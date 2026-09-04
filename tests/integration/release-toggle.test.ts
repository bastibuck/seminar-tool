import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BASE_URL } from "../setup/server-address";
import {
  connectTestDb,
  createCase,
  expectErrorJson,
  expectOk,
  extractCaseTypeId,
  getStartPage,
  toggleFinding,
} from "../support/cases";

type FindingView = {
  id: string;
  name: string;
  released: boolean;
  releasedAtIso: string | null;
};

const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";

const FOREIGN_TYPE_ID = "31111111-4111-4111-8111-111111111111";
const FOREIGN_FINDING_ID = "32111111-4111-4111-8111-111111111111";

// The one deliberate exception to "assert at the HTTP seam, never internals":
// un-releasing must delete the record instead of flagging it hidden
// ("no trace in any data the viewer could observe"). Until ticket 4 ships the
// viewer feed, this table is the only data a viewer would observe.
async function hasAnyRelease(cockpitId: string): Promise<boolean> {
  const rows = await db`
    select 1
    from releases r
    join cases c on c.id = r.case_id
    where c.cockpit_id = ${cockpitId}
    limit 1
  `;
  return rows.length > 0;
}

const db = connectTestDb();

afterAll(async () => {
  await db`delete from case_types where id = ${FOREIGN_TYPE_ID}`;
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

function extractFindings(cockpitHtml: string): FindingView[] {
  const findings: FindingView[] = [];
  const rowPattern = /<li[^>]*data-finding-id="([0-9a-f-]{36})"[^>]*>([\s\S]*?)<\/li>/g;
  for (const [, id, content] of cockpitHtml.matchAll(rowPattern)) {
    const name = content.match(/<strong>([^<]*)<\/strong>/)?.[1];
    if (!name) throw new Error("Finding row without a name on the cockpit");
    const releasedAtIso = content.match(
      /<time datetime="([^"]+)">/i,
    )?.[1] as string | null;
    findings.push({
      id,
      name,
      released: releasedAtIso !== null && content.includes("Freigegeben"),
      releasedAtIso,
    });
  }
  if (findings.length === 0) {
    throw new Error("No findings rendered on the cockpit page");
  }
  return findings;
}

async function createCaseOfType(
  caseTypeId: string,
  name: string,
): Promise<string> {
  const response = await createCase({ caseTypeId, name });
  expect(response.status).toBe(303);
  return response.headers.get("location")!;
}

async function createFreshCase(name: string): Promise<{
  cockpitUrl: string;
}> {
  const caseTypeId = extractCaseTypeId(await getStartPage());
  const cockpitUrl = await createCaseOfType(caseTypeId, name);
  return { cockpitUrl };
}

describe("release toggle lifecycle", () => {
  it("releases a finding with one tap and shows it distinctly", async () => {
    const { cockpitUrl } = await createFreshCase("Lebenszyklus");

    const initial = extractFindings(await getCockpit(cockpitUrl));
    expect(initial.length).toBeGreaterThan(1);
    expect(initial.every((finding) => !finding.released)).toBe(true);

    const target = initial[1]!;
    const releaseResponse = await toggleFinding({
      cockpitUrl,
      findingId: target.id,
      intent: "release",
    });
    expect(releaseResponse.status).toBe(200);
    const releaseBody = await releaseResponse.json();
    expect(releaseBody.ok).toBe(true);
    expect(typeof releaseBody.releasedAt).toBe("string");

    const findings = extractFindings(await getCockpit(cockpitUrl));
    expect(findings.find((finding) => finding.id === target.id)?.released).toBe(
      true,
    );
    expect(findings.find((finding) => finding.id === target.id)?.releasedAtIso).toBe(
      releaseBody.releasedAt,
    );
    expect(findings.filter((finding) => finding.released)).toHaveLength(1);
  });

  it("un-releasing leaves no trace anywhere, not even re-toggling remnants", async () => {
    const { cockpitUrl } = await createFreshCase("Spurenverwischung");
    const initial = extractFindings(await getCockpit(cockpitUrl));
    const target = initial[2]!;

    const released = await toggleFinding({
      cockpitUrl,
      findingId: target.id,
      intent: "release",
    });
    await expectOk(released);
    const unreleased = await toggleFinding({
      cockpitUrl,
      findingId: target.id,
      intent: "unrelease",
    });
    expect(unreleased.status).toBe(200);
    const unreleaseBody = await unreleased.json();
    expect(unreleaseBody.ok).toBe(true);
    expect(unreleaseBody.releasedAt).toBeNull();

    const findings = extractFindings(await getCockpit(cockpitUrl));
    expect(findings.every((finding) => !finding.released)).toBe(true);

    expect(await hasAnyRelease(cockpitIdOf(cockpitUrl))).toBe(false);
  });
});

describe("GET /api/cases/[cockpitId] overview", () => {
  async function getOverview(cockpitUrl: string): Promise<{
    ok: boolean;
    endedAt: string | null;
    findings: { id: string; name: string; releasedAt: string | null }[];
  }> {
    const response = await fetch(
      `${BASE_URL}/api/cases/${cockpitIdOf(cockpitUrl)}`,
    );
    expect(response.status).toBe(200);
    return response.json();
  }

  it("returns the full finding list, all held back on a fresh case", async () => {
    const { cockpitUrl } = await createFreshCase("Übersicht");
    const overview = await getOverview(cockpitUrl);
    expect(overview.ok).toBe(true);
    expect(overview.endedAt).toBeNull();
    expect(overview.findings.length).toBeGreaterThan(1);
    expect(overview.findings.every((finding) => finding.releasedAt === null)).toBe(
      true,
    );
  });

  it("reflects a release back on the next fetch", async () => {
    const { cockpitUrl } = await createFreshCase("Übersicht Freigabe");
    const target = (await getOverview(cockpitUrl)).findings[2]!;

    await toggleFinding({
      cockpitUrl,
      findingId: target.id,
      intent: "release",
    });

    const overview = await getOverview(cockpitUrl);
    expect(overview.findings.find((f) => f.id === target.id)?.releasedAt).toEqual(
      expect.any(String),
    );
    expect(
      overview.findings.filter((finding) => finding.releasedAt !== null),
    ).toHaveLength(1);
  });

  it("reports 404 for an unknown cockpit", async () => {
    const response = await fetch(
      `${BASE_URL}/api/cases/${UNKNOWN_UUID}`,
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Fall nicht gefunden.");
  });
});


describe("chronological release order", () => {
  it("establishes deterministic chronological order across several releases", async () => {
    const { cockpitUrl } = await createFreshCase("Reihenfolge");
    const findings = extractFindings(await getCockpit(cockpitUrl));
    const scrambled = [findings[3]!, findings[0]!, findings[5]!, findings[1]!];

    for (const finding of scrambled) {
      const response = await toggleFinding({
        cockpitUrl,
        findingId: finding.id,
        intent: "release",
      });
      await expectOk(response);
    }

    const releaseTimeById = new Map(
      extractFindings(await getCockpit(cockpitUrl)).map((finding) => [
        finding.id,
        finding.releasedAtIso,
      ]),
    );
    for (const finding of scrambled) {
      expect(releaseTimeById.get(finding.id)).toBeDefined();
    }

    const timesInReleaseOrder = scrambled.map((finding) =>
      new Date(releaseTimeById.get(finding.id)!).getTime(),
    );
    for (let i = 1; i < timesInReleaseOrder.length; i++) {
      expect(timesInReleaseOrder[i]).toBeGreaterThan(timesInReleaseOrder[i - 1]!);
    }
  });

  it("keeps the order when a finding is un-released and released again", async () => {
    const { cockpitUrl } = await createFreshCase("Erneute Freigabe");
    const findings = extractFindings(await getCockpit(cockpitUrl));
    const [first, second] = [findings[0]!, findings[4]!];

    await toggleFinding({ cockpitUrl, findingId: first.id, intent: "release" });
    await toggleFinding({
      cockpitUrl,
      findingId: second.id,
      intent: "release",
    });
    await toggleFinding({
      cockpitUrl,
      findingId: second.id,
      intent: "unrelease",
    });
    await toggleFinding({
      cockpitUrl,
      findingId: second.id,
      intent: "release",
    });

    const state = extractFindings(await getCockpit(cockpitUrl));
    const released = state.filter((finding) => finding.released);
    expect(released.map((finding) => finding.id)).toEqual([
      first.id,
      second.id,
    ]);
    const [firstTime, secondTime] = released.map((finding) =>
      new Date(finding.releasedAtIso!).getTime(),
    );
    expect(secondTime).toBeGreaterThan(firstTime!);
  });
});

describe("cross-case independence", () => {
  it("never lets one case's toggles affect another case of the same type", async () => {
    const caseTypeId = extractCaseTypeId(await getStartPage());
    const urlA = await createCaseOfType(caseTypeId, "Raum A – Steuerung");
    const urlB = await createCaseOfType(caseTypeId, "Raum B – Steuerung");

    const findingsA = extractFindings(await getCockpit(urlA));
    const findingsB = extractFindings(await getCockpit(urlB));
    expect(findingsA.map((finding) => finding.id)).toEqual(
      findingsB.map((finding) => finding.id),
    );

    await toggleFinding({
      cockpitUrl: urlA,
      findingId: findingsA[1]!.id,
      intent: "release",
    });

    let stateA = extractFindings(await getCockpit(urlA));
    let stateB = extractFindings(await getCockpit(urlB));
    expect(stateA.find((f) => f.id === findingsA[1]!.id)?.released).toBe(true);
    expect(stateB.every((finding) => !finding.released)).toBe(true);

    await toggleFinding({
      cockpitUrl: urlB,
      findingId: findingsB[3]!.id,
      intent: "release",
    });

    stateA = extractFindings(await getCockpit(urlA));
    stateB = extractFindings(await getCockpit(urlB));
    expect(stateA.filter((finding) => finding.released)).toHaveLength(1);
    expect(stateB.filter((finding) => finding.released)).toHaveLength(1);
    expect(stateB.find((f) => f.released)?.id).toBe(findingsB[3]!.id);

    await toggleFinding({
      cockpitUrl: urlA,
      findingId: findingsA[1]!.id,
      intent: "unrelease",
    });

    stateA = extractFindings(await getCockpit(urlA));
    stateB = extractFindings(await getCockpit(urlB));
    expect(stateA.every((finding) => !finding.released)).toBe(true);
    expect(stateB.filter((finding) => finding.released)).toHaveLength(1);
    expect(stateB.find((f) => f.released)?.id).toBe(findingsB[3]!.id);
  });
});

describe("POST /api/cases/[cockpitId]/releases error handling", () => {
  it("reports an unknown cockpit with a German error", async () => {
    const response = await toggleFinding({
      cockpitUrl: `${BASE_URL}/cockpit/${UNKNOWN_UUID}`,
      findingId: UNKNOWN_UUID,
      intent: "release",
    });

    await expectErrorJson(response, "Fall nicht gefunden.", 404);
  });

  it("rejects a finding of another case type without changing anything", async () => {
    await db`
      insert into case_types (id, name)
      values (${FOREIGN_TYPE_ID}, 'Testfremder Falltyp')
      on conflict (id) do nothing
    `;
    await db`
      insert into findings (id, case_type_id, name, position, image_path)
      values (${FOREIGN_FINDING_ID}, ${FOREIGN_TYPE_ID}, 'Fremder Befund', 1,
        ${`findings/${FOREIGN_FINDING_ID}/placeholder.svg`})
      on conflict (id) do nothing
    `;

    const caseTypeId = extractCaseTypeId(await getStartPage());
    const urlA = await createCaseOfType(caseTypeId, "Fremder Befund A");

    const response = await toggleFinding({
      cockpitUrl: urlA,
      findingId: FOREIGN_FINDING_ID,
      intent: "release",
    });
    await expectErrorJson(response, "Befund nicht gefunden.", 404);

    const stateA = extractFindings(await getCockpit(urlA));
    expect(stateA.every((finding) => !finding.released)).toBe(true);
  });
});
