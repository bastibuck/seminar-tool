import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";

import { BASE_URL } from "../setup/server-address";
import { ensureRealtimeLive } from "../support/realtime";
import {
  connectTestDb,
  createCase,
  extractCaseTypeId,
  extractCode,
  getStartPage,
} from "../support/cases";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const db = connectTestDb();

afterAll(async () => {
  await db.end();
});

async function getCockpit(cockpitUrl: string): Promise<string> {
  const response = await fetch(cockpitUrl);
  expect(response.status).toBe(200);
  return response.text();
}

function extractFindingsFromCockpit(cockpitHtml: string): { id: string; name: string }[] {
  const findings: { id: string; name: string }[] = [];
  const rowPattern = /<li data-finding-id="([0-9a-f-]{36})">([\s\S]*?)<\/li>/g;
  for (const [, id, content] of cockpitHtml.matchAll(rowPattern)) {
    const name = content.match(/<strong>([^<]*)<\/strong>/)?.[1];
    if (name) findings.push({ id, name });
  }
  return findings;
}

async function createFreshCase(name: string): Promise<{
  cockpitUrl: string;
  code: string;
  caseId: string;
}> {
  const caseTypeId = extractCaseTypeId(await getStartPage());
  const response = await createCase({ caseTypeId, name });
  expect(response.status).toBe(303);
  const cockpitUrl = response.headers.get("location")!;
  const cockpitHtml = await getCockpit(cockpitUrl);
  const code = extractCode(cockpitHtml);

  const cockpitId = cockpitUrl.split("/").pop()!;
  const rows = await db<{ id: string }[]>`
    select id from cases where cockpit_id = ${cockpitId}
  `;
  const caseId = rows[0]!.id;

  return { cockpitUrl, code, caseId };
}

async function toggleFinding(input: {
  cockpitUrl: string;
  findingId: string;
  intent: "release" | "unrelease";
}): Promise<Response> {
  const cockpitId = input.cockpitUrl.split("/").pop()!;
  const body = new URLSearchParams({
    findingId: input.findingId,
    intent: input.intent,
  });
  return fetch(`${BASE_URL}/api/cases/${cockpitId}/releases`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    redirect: "manual",
  });
}

function subscribeToCaseReleases(
  caseId: string,
): { events: unknown[]; promise: Promise<unknown[]>; cleanup: () => void } {
  const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const events: unknown[] = [];

  let resolve!: (events: unknown[]) => void;
  const promise = new Promise<unknown[]>((r) => {
    resolve = r;
  });

  const channel = supabase
    .channel(`test-case-${caseId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "releases", filter: `case_id=eq.${caseId}` },
      (payload) => {
        events.push(payload);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        resolve(events);
      }
    });

  return {
    events,
    promise,
    cleanup: () => {
      supabase.removeChannel(channel);
    },
  };
}

describe("realtime push from cockpit to viewer", () => {
  it("delivers a release event to a subscribed realtime client within ~1 second", async () => {
    await ensureRealtimeLive();
    const { cockpitUrl, caseId } = await createFreshCase("Realtime Smoke");
    const cockpitFindings = extractFindingsFromCockpit(await getCockpit(cockpitUrl));
    const target = cockpitFindings[2]!;

    const sub = subscribeToCaseReleases(caseId);
    await sub.promise;

    const before = Date.now();
    await toggleFinding({
      cockpitUrl,
      findingId: target.id,
      intent: "release",
    });

    await vi.waitFor(() => {
      expect(sub.events.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    const elapsed = Date.now() - before;
    expect(elapsed).toBeLessThan(2000);

    const event = sub.events[0] as { eventType: string; new: { finding_id: string } };
    expect(event.eventType).toBe("INSERT");
    expect(event.new.finding_id).toBe(target.id);

    sub.cleanup();
  }, 30000);

  it("delivers an un-release event that removes the finding", async () => {
    const { cockpitUrl, caseId } = await createFreshCase("Realtime Unrelease");
    const cockpitFindings = extractFindingsFromCockpit(await getCockpit(cockpitUrl));
    const target = cockpitFindings[1]!;

    await toggleFinding({
      cockpitUrl,
      findingId: target.id,
      intent: "release",
    });

    await new Promise((r) => setTimeout(r, 1000));

    const sub = subscribeToCaseReleases(caseId);
    await sub.promise;

    await new Promise((r) => setTimeout(r, 500));

    const before = Date.now();
    await toggleFinding({
      cockpitUrl,
      findingId: target.id,
      intent: "unrelease",
    });

    await vi.waitFor(() => {
      const deleteEvents = sub.events.filter(
        (e) => (e as { eventType: string }).eventType === "DELETE",
      );
      expect(deleteEvents.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    const elapsed = Date.now() - before;
    expect(elapsed).toBeLessThan(2000);

    const deleteEvent = sub.events.find(
      (e) => (e as { eventType: string }).eventType === "DELETE",
    ) as { eventType: string; old: { id: number } };
    expect(deleteEvent.old.id).toBeDefined();

    sub.cleanup();
  });

  it("does not deliver events from a different case", async () => {
    const caseA = await createFreshCase("Realtime Isolation A");
    const caseB = await createFreshCase("Realtime Isolation B");
    const cockpitFindingsB = extractFindingsFromCockpit(await getCockpit(caseB.cockpitUrl));

    const sub = subscribeToCaseReleases(caseA.caseId);
    await sub.promise;

    await toggleFinding({
      cockpitUrl: caseB.cockpitUrl,
      findingId: cockpitFindingsB[0]!.id,
      intent: "release",
    });

    await new Promise((r) => setTimeout(r, 1500));
    expect(sub.events).toHaveLength(0);

    sub.cleanup();
  });
});
