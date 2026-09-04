import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BASE_URL } from "../setup/server-address";
import {
  connectTestDb,
  createCase,
  getStartPage,
} from "../support/cases";

let sql: ReturnType<typeof connectTestDb>;

const adminBase = `${BASE_URL}/api/admin/case-types`;

let runId: string;
beforeAll(() => {
  runId = crypto.randomUUID().slice(0, 8);
});
function testName(name: string): string {
  return `${name} [${runId}]`;
}

async function createType(name: string): Promise<string> {
  const response = await fetch(adminBase, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name }),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  return result.id as string;
}

async function addFinding(
  typeId: string,
  name: string,
): Promise<string> {
  const body = new FormData();
  body.set("name", name);
  body.set("image", new File(["test-image"], "test.png", { type: "image/png" }));
  const response = await fetch(`${adminBase}/${typeId}`, {
    method: "POST",
    body,
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  return result.id as string;
}

async function getTypeFindings(typeId: string) {
  const response = await fetch(`${adminBase}/${typeId}`);
  expect(response.status).toBe(200);
  return response.json();
}

async function renameType(id: string, name: string): Promise<Response> {
  return fetch(adminBase, {
    method: "PUT",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id, name }),
  });
}

async function deleteType(id: string): Promise<Response> {
  return fetch(adminBase, {
    method: "DELETE",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id }),
  });
}

async function renameFinding(
  typeId: string,
  findingId: string,
  name: string,
): Promise<Response> {
  return fetch(`${adminBase}/${typeId}`, {
    method: "PATCH",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ findingId, name }),
  });
}

async function deleteFinding(typeId: string, findingId: string): Promise<Response> {
  return fetch(`${adminBase}/${typeId}`, {
    method: "DELETE",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ findingId }),
  });
}

async function swapFindings(
  typeId: string,
  findingA: string,
  findingB: string,
): Promise<Response> {
  return fetch(`${adminBase}/${typeId}`, {
    method: "PUT",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ findingA, findingB }),
  });
}

beforeAll(async () => {
  sql = connectTestDb();
});

afterAll(async () => {
  const runScopedName = `% [${runId}]`;
  await sql`
    DELETE FROM cases
    WHERE case_type_id IN (
      SELECT id FROM case_types WHERE name LIKE ${runScopedName}
    )
  `;
  await sql`DELETE FROM case_types WHERE name LIKE ${runScopedName}`;
  await sql.end();
});

describe("Case Type authoring via /api/admin/case-types", () => {
  it("lists case types", async () => {
    const response = await fetch(adminBase);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.caseTypes)).toBe(true);
    expect(
      body.caseTypes.some((t: { name: string }) => t.name === "Akuter Thoraxschmerz"),
    ).toBe(true);
  });

  it("creates a case type and it becomes startable", async () => {
    const id = await createType(testName("Reanimation"));
    const startHtml = await getStartPage();
    expect(startHtml).toContain(testName("Reanimation"));
  });

  it("rejects an empty case type name in German", async () => {
    const response = await fetch(adminBase, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: "   " }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Bitte gib einen Namen ein.");
  });

  it("rejects a duplicate case type name in German", async () => {
    await createType(testName("Doppelter Falltyp"));
    const response = await fetch(adminBase, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: testName("Doppelter Falltyp") }),
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("existiert bereits");
  });

  it("renames a case type", async () => {
    const id = await createType(testName("Umbenennen Typ"));
    const response = await renameType(id, "Umbenannt");
    expect(response.status).toBe(200);
    const list = await (await fetch(adminBase)).json();
    const found = list.caseTypes.find((t: { id: string }) => t.id === id);
    expect(found.name).toBe("Umbenannt");
  });

  it("rejects renaming to an empty name in German", async () => {
    const id = await createType(testName("Leerer Name"));
    const response = await renameType(id, "  ");
    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result.error).toBe("Bitte gib einen Namen ein.");
  });

  it("rejects renaming to an existing case type name in German", async () => {
    const id1 = await createType(testName("Erster Typ"));
    await createType(testName("Zweiter Typ"));
    const response = await renameType(id1, testName("Zweiter Typ"));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("existiert bereits");
  });

  it("deletes an unreferenced case type", async () => {
    const id = await createType(testName("Löschen Mich"));
    const response = await deleteType(id);
    expect(response.status).toBe(200);
    const list = await (await fetch(adminBase)).json();
    expect(list.caseTypes.some((t: { id: string }) => t.id === id)).toBe(false);
  });

  it("refuses to delete a referenced case type in German", async () => {
    const id = await createType(testName("Verwendet Typ"));
    await createCase({ caseTypeId: id, name: "Laufender Testfall" });
    const response = await deleteType(id);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Laufender Testfall");
    expect(body.error).toContain("verwendet");
  });
});

describe("Finding authoring via /api/admin/case-types/[id]", () => {
  it("starts with an empty findings list for a new type", async () => {
    const id = await createType(testName("Leere Befunde"));
    const detail = await getTypeFindings(id);
    expect(detail.name).toBe(testName("Leere Befunde"));
    expect(detail.findings).toEqual([]);
  });

  it("adds findings in order", async () => {
    const id = await createType(testName("Befund Reihenfolge"));
    const f1 = await addFinding(id, "Anamnese");
    const f2 = await addFinding(id, "Vitalparameter");
    const detail = await getTypeFindings(id);
    expect(detail.findings.map((f: { name: string }) => f.name)).toEqual([
      "Anamnese",
      "Vitalparameter",
    ]);
  });

  it("rejects an empty finding name in German", async () => {
    const id = await createType(testName("Leerer Befund"));
    const body = new FormData();
    body.set("name", "  ");
    body.set("image", new File(["test-image"], "test.png", { type: "image/png" }));
    const response = await fetch(`${adminBase}/${id}`, {
      method: "POST",
      body,
    });
    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result.error).toBe("Bitte gib einen Namen ein.");
  });

  it("rejects duplicate finding names within a type in German", async () => {
    const id = await createType(testName("Doppelter Befund"));
    await addFinding(id, "EKG");
    const response = await fetch(`${adminBase}/${id}`, {
      method: "POST",
      body: (() => { const body = new FormData(); body.set("name", "EKG"); body.set("image", new File(["test-image"], "test.png", { type: "image/png" })); return body; })(),
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("existiert bereits");
  });

  it("renames a finding", async () => {
    const id = await createType(testName("Befund Umbenennen"));
    const f = await addFinding(id, "Alt");
    const response = await renameFinding(id, f, "Neu");
    expect(response.status).toBe(200);
    const detail = await getTypeFindings(id);
    expect(detail.findings[0].name).toBe("Neu");
  });

  it("rejects renaming a finding to a duplicate in German", async () => {
    const id = await createType(testName("Befund Doppel"));
    const f1 = await addFinding(id, "A");
    await addFinding(id, "B");
    const response = await renameFinding(id, f1, "B");
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("existiert bereits");
  });

  it("swaps adjacent findings and re-indexes delete", async () => {
    const id = await createType(testName("Swap Typ"));
    const f1 = await addFinding(id, "Erster");
    const f2 = await addFinding(id, "Zweiter");

    const swap = await swapFindings(id, f1, f2);
    expect(swap.status).toBe(200);
    let detail = await getTypeFindings(id);
    expect(detail.findings.map((f: { name: string }) => f.name)).toEqual([
      "Zweiter",
      "Erster",
    ]);

    await deleteFinding(id, f2);
    detail = await getTypeFindings(id);
    expect(detail.findings.map((f: { name: string }) => f.name)).toEqual([
      "Erster",
    ]);
    expect(detail.findings[0].position).toBe(1);
  });

  it("refuses to delete a finding that was ever released in German", async () => {
    const id = await createType(testName("Freigegebener Befund"));
    const findingId = await addFinding(id, "Blutbild");
    const { cockpitUrl } = await createAndGetCockpit(id);
    await releaseFinding(cockpitUrl, findingId);
    const response = await deleteFinding(id, findingId);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("freigegeben");
    expect(body.error).toContain("Admin Freigabe");
    const detail = await getTypeFindings(id);
    expect(detail.findings.some((f: { id: string }) => f.id === findingId)).toBe(true);
  });
});

describe("admin pages", () => {
  it("renders /admin with the case type list", async () => {
    await createType(testName("Seiten Testtyp"));
    const response = await fetch(`${BASE_URL}/admin`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Falltypen");
    expect(html).toContain(testName("Seiten Testtyp"));
    expect(html).toContain("Neuer Falltyp");
  });

  it("renders the findings editor for a case type", async () => {
    const id = await createType(testName("Findings Seitentest"));
    await addFinding(id, "Erster Befund");
    await addFinding(id, "Zweiter Befund");

    const response = await fetch(`${BASE_URL}/admin/case-types/${id}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(testName("Findings Seitentest"));
    expect(html).toContain("Erster Befund");
    expect(html).toContain("Zweiter Befund");
    expect(html).toContain("Befund hinzufügen");
  });

  it("returns 404 for an unknown case type editor page", async () => {
    const response = await fetch(
      `${BASE_URL}/admin/case-types/00000000-0000-4000-8000-000000000000`,
    );
    expect(response.status).toBe(404);
  });
});

async function createAndGetCockpit(caseTypeId: string) {
  const response = await createCase({ caseTypeId, name: "Admin Freigabe" });
  expect(response.status).toBe(303);
  const cockpitUrl = response.headers.get("location")!;
  return { cockpitUrl };
}

async function releaseFinding(cockpitUrl: string, findingId: string) {
  const cockpitId = cockpitUrl.split("/").pop()!;
  const response = await fetch(
    `${BASE_URL}/api/cases/${cockpitId}/releases`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ findingId, intent: "release" }),
    },
  );
  expect(response.status).toBe(200);
}
