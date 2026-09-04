import { afterAll, describe, expect, it } from "vitest";

import { BASE_URL } from "../setup/server-address";
import {
  connectTestDb,
  createCase,
  extractCaseTypeId,
  extractCode,
  getStartPage,
  toggleFinding,
} from "../support/cases";

const db = connectTestDb();

afterAll(async () => {
  await db.end();
});

function cockpitIdOf(cockpitUrl: string): string {
  return cockpitUrl.split("/").pop()!;
}

async function createFreshCase(name: string) {
  const caseTypeId = extractCaseTypeId(await getStartPage());
  const response = await createCase({ caseTypeId, name });
  expect(response.status).toBe(303);
  const cockpitUrl = response.headers.get("location")!;
  const cockpitResponse = await fetch(cockpitUrl);
  expect(cockpitResponse.status).toBe(200);
  const code = extractCode(await cockpitResponse.text());
  const [row] = await db<{ id: string; case_type_id: string }[]>`
    select id, case_type_id
    from cases
    where cockpit_id = ${cockpitIdOf(cockpitUrl)}
  `;
  return { cockpitUrl, code, caseId: row!.id, caseTypeId: row!.case_type_id };
}

async function runCleanup(): Promise<number> {
  const [result] = await db<{ delete_expired_cases: number }[]>`
    select delete_expired_cases()
  `;
  return result!.delete_expired_cases;
}

describe("expired case cleanup", () => {
  it("deletes old ended cases and cascades releases while retaining the case type", async () => {
    const created = await createFreshCase("Abgelaufener Fall");
    const [finding] = await db<{ id: string }[]>`
      select id
      from findings
      where case_type_id = ${created.caseTypeId}
      order by position
      limit 1
    `;
    await db`
      insert into releases (case_id, finding_id)
      values (${created.caseId}, ${finding!.id})
    `;
    await db`
      update cases
      set ended_at = now() - interval '24 hours',
          last_activity_at = now()
      where id = ${created.caseId}
    `;

    expect(await runCleanup()).toBe(1);
    expect((await db`select 1 from cases where id = ${created.caseId}`).length).toBe(0);
    expect((await db`select 1 from releases where case_id = ${created.caseId}`).length).toBe(0);
    expect((await db`select 1 from case_types where id = ${created.caseTypeId}`).length).toBe(1);
    expect((await db`select 1 from findings where id = ${finding!.id}`).length).toBe(1);
    expect((await fetch(created.cockpitUrl)).status).toBe(404);
    expect((await fetch(`${BASE_URL}/viewer/${created.code}`)).status).toBe(404);
    expect(await runCleanup()).toBe(0);
  });

  it("deletes inactive active cases but keeps recent and boundary-newer cases", async () => {
    const inactive = await createFreshCase("Inaktiv");
    const recent = await createFreshCase("Aktiv");
    const endedRecent = await createFreshCase("Kürzlich beendet");
    await db`
      update cases
      set last_activity_at = now() - interval '72 hours'
      where id = ${inactive.caseId}
    `;
    await db`
      update cases
      set last_activity_at = now() - interval '71 hours 59 minutes'
      where id = ${recent.caseId}
    `;
    await db`
      update cases
      set ended_at = now() - interval '23 hours 59 minutes'
      where id = ${endedRecent.caseId}
    `;

    expect(await runCleanup()).toBe(1);
    expect((await fetch(inactive.cockpitUrl)).status).toBe(404);
    expect((await fetch(recent.cockpitUrl)).status).toBe(200);
    expect((await fetch(endedRecent.cockpitUrl)).status).toBe(200);
  });

  it("refreshes activity only for state-changing release actions", async () => {
    const created = await createFreshCase("Aktivitätszeitpunkt");
    const [finding] = await db<{ id: string }[]>`
      select id from findings where case_type_id = ${created.caseTypeId} order by position limit 1
    `;
    const initial = await db<{ created_at: Date; last_activity_at: Date }[]>`
      select created_at, last_activity_at from cases where id = ${created.caseId}
    `;
    expect(initial[0]!.last_activity_at).toEqual(initial[0]!.created_at);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const endResponse = await fetch(
      `${BASE_URL}/api/cases/${cockpitIdOf(created.cockpitUrl)}/end`,
      { method: "POST" },
    );
    expect(endResponse.status).toBe(200);
    const afterEnd = await db<{ last_activity_at: Date }[]>`
      select last_activity_at from cases where id = ${created.caseId}
    `;
    expect(afterEnd[0]!.last_activity_at).toEqual(initial[0]!.last_activity_at);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const active = await createFreshCase("Aktivitätszeitpunkt Freigabe");
    const [activeFinding] = await db<{ id: string }[]>`
      select id from findings where case_type_id = ${active.caseTypeId} order by position limit 1
    `;
    const activeInitial = await db<{ last_activity_at: Date }[]>`
      select last_activity_at from cases where id = ${active.caseId}
    `;
    await toggleFinding({ cockpitUrl: active.cockpitUrl, findingId: activeFinding!.id, intent: "release" });
    const afterRelease = await db<{ last_activity_at: Date }[]>`
      select last_activity_at from cases where id = ${active.caseId}
    `;
    expect(afterRelease[0]!.last_activity_at.getTime()).toBeGreaterThan(activeInitial[0]!.last_activity_at.getTime());

    await new Promise((resolve) => setTimeout(resolve, 20));
    await toggleFinding({ cockpitUrl: active.cockpitUrl, findingId: activeFinding!.id, intent: "release" });
    const afterNoop = await db<{ last_activity_at: Date }[]>`
      select last_activity_at from cases where id = ${active.caseId}
    `;
    expect(afterNoop[0]!.last_activity_at).toEqual(afterRelease[0]!.last_activity_at);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await toggleFinding({ cockpitUrl: active.cockpitUrl, findingId: activeFinding!.id, intent: "unrelease" });
    const afterUnrelease = await db<{ last_activity_at: Date }[]>`
      select last_activity_at from cases where id = ${active.caseId}
    `;
    expect(afterUnrelease[0]!.last_activity_at.getTime()).toBeGreaterThan(afterNoop[0]!.last_activity_at.getTime());
  });
});
