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

async function expectOk(response: Response): Promise<void> {
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
}

const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";

afterAll(async () => {
  await db.end();
});

function cockpitIdOf(cockpitUrl: string): string {
  return cockpitUrl.split("/").pop()!;
}

async function getCockpit(cockpitUrl: string): Promise<string> {
  const response = await fetch(cockpitUrl);
  expect(response.status).toBe(200);
  return response.text();
}

type CockpitFinding = { id: string; name: string; hasToggle: boolean };

function extractFindingsFromCockpit(cockpitHtml: string): CockpitFinding[] {
  const findings: CockpitFinding[] = [];
  const rowPattern = /<li data-finding-id="([0-9a-f-]{36})">([\s\S]*?)<\/li>/g;
  for (const [, id, content] of cockpitHtml.matchAll(rowPattern)) {
    const name = content.match(/<strong>([^<]*)<\/strong>/)?.[1];
    if (!name) throw new Error("Finding row without a name on the cockpit");
    findings.push({
      id,
      name,
      hasToggle: content.includes("data-action"),
    });
  }
  if (findings.length === 0) {
    throw new Error("No findings rendered on the cockpit page");
  }
  return findings;
}

type ViewerFinding = { name: string };

function extractViewerFindings(viewerHtml: string): ViewerFinding[] {
  const findings: ViewerFinding[] = [];
  const itemPattern = /<li[^>]*>([\s\S]*?)<\/li>/g;
  for (const [, content] of viewerHtml.matchAll(itemPattern)) {
    const name = content.match(/<strong>([^<]*)<\/strong>/)?.[1];
    if (!name) continue;
    findings.push({ name });
  }
  return findings;
}

function hasEndBanner(viewerHtml: string): boolean {
  return viewerHtml.includes("Fall beendet");
}

function extractEndedAt(cockpitHtml: string): string | null {
  const match = cockpitHtml.match(/Beendet um\s*<time datetime="([^"]+)"/i);
  return match ? match[1] : null;
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
  const code = extractCode(await getCockpit(cockpitUrl));

  const rows = await db<{ id: string }[]>`
    select id from cases where cockpit_id = ${cockpitIdOf(cockpitUrl)}
  `;
  const caseId = rows[0]!.id;

  return { cockpitUrl, code, caseId };
}

async function toggleFinding(input: {
  cockpitUrl: string;
  findingId: string;
  intent: "release" | "unrelease";
}): Promise<Response> {
  const body = new URLSearchParams({
    findingId: input.findingId,
    intent: input.intent,
  });
  return fetch(
    `${BASE_URL}/api/cases/${cockpitIdOf(input.cockpitUrl)}/releases`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      redirect: "manual",
    },
  );
}

async function endCase(cockpitUrl: string): Promise<Response> {
  return fetch(`${BASE_URL}/api/cases/${cockpitIdOf(cockpitUrl)}/end`, {
    method: "POST",
    redirect: "manual",
  });
}

function subscribeToCaseEvents(
  caseId: string,
): { events: unknown[]; promise: Promise<unknown[]>; cleanup: () => void } {
  const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const events: unknown[] = [];

  let resolve!: (events: unknown[]) => void;
  const promise = new Promise<unknown[]>((r) => {
    resolve = r;
  });

  const channel = supabase
    .channel(`test-case-events-${caseId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "cases",
        filter: `id=eq.${caseId}`,
      },
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

describe("ending a case from the cockpit", () => {
  it("offers an end action from the cockpit", async () => {
    const { cockpitUrl } = await createFreshCase("Ende-Aktion");
    const cockpitId = cockpitIdOf(cockpitUrl);

    const cockpitHtml = await getCockpit(cockpitUrl);
    expect(cockpitHtml).toContain('data-action="end"');
    expect(cockpitHtml).toContain("Fall beenden");
    void cockpitId;
  });

  it("marks an ended case on the cockpit and removes the release toggles", async () => {
    const { cockpitUrl } = await createFreshCase("Cockpit Beendet");
    const findings = extractFindingsFromCockpit(await getCockpit(cockpitUrl));
    await toggleFinding({
      cockpitUrl,
      findingId: findings[0]!.id,
      intent: "release",
    });

    const response = await endCase(cockpitUrl);
    await expectOk(response);

    const cockpitHtml = await getCockpit(cockpitUrl);
    expect(cockpitHtml).toContain("Beendet um");
    expect(cockpitHtml).not.toContain('data-action="end"');
    const state = extractFindingsFromCockpit(cockpitHtml);
    expect(state.every((finding) => !finding.hasToggle)).toBe(true);
  });
});

describe("server-side rejection after end", () => {
  it("rejects a release attempt after the case ended and changes nothing", async () => {
    const { cockpitUrl } = await createFreshCase("Freigabe danach");
    const findings = extractFindingsFromCockpit(await getCockpit(cockpitUrl));
    const [released, attempted] = [findings[0]!, findings[2]!];

    await toggleFinding({
      cockpitUrl,
      findingId: released.id,
      intent: "release",
    });
    await endCase(cockpitUrl);

    const response = await toggleFinding({
      cockpitUrl,
      findingId: attempted.id,
      intent: "release",
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Fall bereits beendet.");

    const state = extractFindingsFromCockpit(await getCockpit(cockpitUrl));
    const toggles = state.filter((finding) => finding.hasToggle);
    expect(toggles).toHaveLength(0);
  });

  it("rejects an un-release attempt after the case ended; findings stay readable", async () => {
    const { cockpitUrl, code } = await createFreshCase(
      "Zurückziehen danach",
    );
    const findings = extractFindingsFromCockpit(await getCockpit(cockpitUrl));
    const target = findings[1]!;

    await toggleFinding({
      cockpitUrl,
      findingId: target.id,
      intent: "release",
    });
    await endCase(cockpitUrl);

    const response = await toggleFinding({
      cockpitUrl,
      findingId: target.id,
      intent: "unrelease",
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Fall bereits beendet.");

    const viewerResponse = await fetch(
      `${BASE_URL}/viewer/${code}`,
    );
    expect(viewerResponse.status).toBe(200);
    const viewerHtml = await viewerResponse.text();
    const viewerFindings = extractViewerFindings(viewerHtml);
    expect(viewerFindings.map((f) => f.name)).toEqual([target.name]);
  });
});

describe("banner state exposure", () => {
  it("exposes ended state and readable findings via the viewer JSON API", async () => {
    const { cockpitUrl, code } = await createFreshCase("JSON Beendet");
    const findings = extractFindingsFromCockpit(await getCockpit(cockpitUrl));
    await toggleFinding({
      cockpitUrl,
      findingId: findings[3]!.id,
      intent: "release",
    });
    await endCase(cockpitUrl);

    const response = await fetch(`${BASE_URL}/api/viewer/${code}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ended).toBe(true);
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0]!.name).toBe(findings[3]!.name);
  });

  it("reports false for an active case", async () => {
    const { code } = await createFreshCase("JSON Aktiv");
    const response = await fetch(`${BASE_URL}/api/viewer/${code}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ended).toBe(false);
  });

  it("shows the end banner on the server-rendered viewer page", async () => {
    const { cockpitUrl, code } = await createFreshCase("Banner HTML");
    const findings = extractFindingsFromCockpit(await getCockpit(cockpitUrl));
    await toggleFinding({
      cockpitUrl,
      findingId: findings[0]!.id,
      intent: "release",
    });
    await toggleFinding({
      cockpitUrl,
      findingId: findings[4]!.id,
      intent: "release",
    });
    await endCase(cockpitUrl);

    const response = await fetch(`${BASE_URL}/viewer/${code}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(hasEndBanner(html)).toBe(true);

    const viewerFindings = extractViewerFindings(html);
    expect(viewerFindings.map((f) => f.name)).toEqual([
      findings[0]!.name,
      findings[4]!.name,
    ]);
  });
});

describe("post-end join behavior", () => {
  it("a viewer joining after the end sees all released findings plus the banner", async () => {
    const { cockpitUrl, code } = await createFreshCase("Nachzügler Beendet");
    const findings = extractFindingsFromCockpit(await getCockpit(cockpitUrl));
    const released = [findings[5]!, findings[1]!, findings[3]!];

    for (const finding of released) {
      await toggleFinding({
        cockpitUrl,
        findingId: finding.id,
        intent: "release",
      });
      await new Promise((r) => setTimeout(r, 5));
    }
    await endCase(cockpitUrl);

    const response = await fetch(`${BASE_URL}/viewer/${code}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(hasEndBanner(html)).toBe(true);

    const viewerFindings = extractViewerFindings(html);
    expect(viewerFindings.map((f) => f.name)).toEqual(
      released.map((f) => f.name),
    );
  });
});

describe("realtime end banner push", () => {
  it("delivers the case end to a subscribed realtime client within ~1 second", async () => {
    await ensureRealtimeLive();
    const { cockpitUrl, caseId } = await createFreshCase("Ende Realtime");
    const sub = subscribeToCaseEvents(caseId);
    await sub.promise;

    const before = Date.now();
    await endCase(cockpitUrl);

    await vi.waitFor(() => {
      expect(sub.events.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    const elapsed = Date.now() - before;
    expect(elapsed).toBeLessThan(2000);

    const event = sub.events[0] as {
      eventType: string;
      new: { ended_at: string | null };
    };
    expect(event.eventType).toBe("UPDATE");
    expect(event.new.ended_at).toBeTruthy();

    sub.cleanup();
  }, 30000);
});

describe("ending error handling", () => {
  it("reports an unknown cockpit with a German error", async () => {
    const response = await fetch(`${BASE_URL}/api/cases/${UNKNOWN_UUID}/end`, {
      method: "POST",
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Fall nicht gefunden.");
  });

  it("ending an already-ended case is harmless and keeps the original end time", async () => {
    const { cockpitUrl } = await createFreshCase("Doppelt beendet");
    await endCase(cockpitUrl);

    const firstTime = extractEndedAt(await getCockpit(cockpitUrl));
    expect(firstTime).toBeDefined();

    await new Promise((r) => setTimeout(r, 20));
    await endCase(cockpitUrl);
    await endCase(cockpitUrl);

    const secondTime = extractEndedAt(await getCockpit(cockpitUrl));
    expect(secondTime).toEqual(firstTime);
  });
});