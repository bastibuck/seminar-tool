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
  resolveLocation,
  toggleFinding,
} from "../support/cases";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "../../lib/supabase-config";

const db = connectTestDb();

afterAll(async () => {
  await db.end();
});

async function getCockpit(cockpitUrl: string): Promise<string> {
  const response = await fetch(cockpitUrl);
  expect(response.status).toBe(200);
  return response.text();
}

function extractFindingsFromCockpit(cockpitHtml: string): {
  id: string;
  name: string;
}[] {
  const findings: { id: string; name: string }[] = [];
  const rowPattern = /<li[^>]*data-finding-id="([0-9a-f-]{36})"[^>]*>([\s\S]*?)<\/li>/g;
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
  const cockpitUrl = resolveLocation(response.headers.get("location")!);
  const cockpitHtml = await getCockpit(cockpitUrl);
  const code = extractCode(cockpitHtml);

  const cockpitId = cockpitUrl.split("/").pop()!;
  const rows = await db<{ id: string }[]>`
    select id from cases where cockpit_id = ${cockpitId}
  `;
  const caseId = rows[0]!.id;

  return { cockpitUrl, code, caseId };
}

function subscribeToCaseBroadcast(
  caseId: string,
): {
  events: {
    type: string;
    event: string;
    payload: { type: string } & Record<string, unknown>;
  }[];
  promise: Promise<void>;
  cleanup: () => void;
} {
  const supabase: SupabaseClient = createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
  );
  const events: {
    type: string;
    event: string;
    payload: { type: string } & Record<string, unknown>;
  }[] = [];

  let resolveSubscribed!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveSubscribed = resolve;
  });

  const channel = supabase
    .channel(`viewer-${caseId}`)
    .on(
      "broadcast",
      { event: "changed" },
      (
        broadcast: {
          type: string;
          event: string;
          payload: { type: string } & Record<string, unknown>;
        },
      ) => {
        events.push(broadcast);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") resolveSubscribed();
    });

  return {
    events,
    promise,
    cleanup: () => {
      supabase.removeChannel(channel);
    },
  };
}

async function endCase(cockpitUrl: string): Promise<Response> {
  const cockpitId = cockpitUrl.split("/").pop()!;
  return fetch(`${BASE_URL}/api/cases/${cockpitId}/end`, {
    method: "POST",
    redirect: "manual",
  });
}

describe("broadcast push from cockpit to viewer", () => {
  it("delivers a row-free invalidation ping on release, un-release, and end", async () => {
    await ensureRealtimeLive();
    const { cockpitUrl, caseId } = await createFreshCase("Broadcast Smoke");
    const cockpitFindings = extractFindingsFromCockpit(
      await getCockpit(cockpitUrl),
    );
    const target = cockpitFindings[2]!;

    const sub = subscribeToCaseBroadcast(caseId);
    await sub.promise;

    async function expectPing(action: () => Promise<unknown>) {
      const beforeCount = sub.events.length;
      const before = Date.now();
      await action();
      await vi.waitFor(
        () => {
          expect(sub.events.length).toBeGreaterThan(beforeCount);
        },
        { timeout: 3000 },
      );
      const elapsed = Date.now() - before;
      expect(elapsed).toBeLessThan(2000);
      const latest = sub.events[sub.events.length - 1]!;
      expect(latest.type).toBe("broadcast");
      expect(latest.event).toBe("changed");
      expect(latest.payload).toEqual({ type: "changed" });
      return latest.payload;
    }

    const releasePayload = await expectPing(() =>
      toggleFinding({
        cockpitUrl,
        findingId: target.id,
        intent: "release",
      }),
    );
    // The ping must never carry sensitive row data.
    expect(JSON.stringify(releasePayload)).not.toMatch(/case_|finding_id|note|image/);

    await expectPing(() =>
      toggleFinding({
        cockpitUrl,
        findingId: target.id,
        intent: "unrelease",
      }),
    );
    await expectPing(() => endCase(cockpitUrl));

    sub.cleanup();
  }, 30000);

  it("does not deliver a broadcast ping for a different case", async () => {
    const caseA = await createFreshCase("Broadcast Isolation A");
    const caseB = await createFreshCase("Broadcast Isolation B");
    const cockpitFindingsB = extractFindingsFromCockpit(
      await getCockpit(caseB.cockpitUrl),
    );

    const sub = subscribeToCaseBroadcast(caseA.caseId);
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
