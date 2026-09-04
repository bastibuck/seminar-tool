import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { BASE_URL } from "../setup/server-address";
import {
  CODE_PATTERN,
  connectTestDb,
  createCase,
  extractCaseTypeId,
  extractCode,
  getStartPage,
} from "../support/cases";

const SEEDED_TYPE_NAME = "Akuter Thoraxschmerz";
const SEEDED_FINDING_NAMES = [
  "Anamnese",
  "Vitalparameter",
  "12-Kanal-EKG",
  "Labor: Troponin T",
  "Röntgen-Thorax",
  "Diagnose",
];

describe("cockpit start page", () => {
  it("offers the seeded case type in German", async () => {
    const html = await getStartPage();

    expect(html).toContain("Fall starten");
    expect(html).toContain(SEEDED_TYPE_NAME);
  });
});

describe("POST /api/cases", () => {
  it("redirects to a private cockpit url showing name, checklist and code", async () => {
    const caseTypeId = extractCaseTypeId(await getStartPage());

    const response = await createCase({ caseTypeId });
    expect(response.status).toBe(303);

    const location = response.headers.get("location")!;
    expect(location).toMatch(
      new RegExp(`^${BASE_URL}/cockpit/[0-9a-f-]{36}$`),
    );

    const cockpit = await fetch(location);
    expect(cockpit.status).toBe(200);
    const html = await cockpit.text();

    expect(html).toContain("Herzinfarkt Demo");
    for (const finding of SEEDED_FINDING_NAMES) {
      expect(html).toContain(finding);
    }
    expect(extractCode(html)).toBeDefined();
  });

  it("creates independent cases with distinct codes and urls for the same type", async () => {
    const caseTypeId = extractCaseTypeId(await getStartPage());

    const first = await createCase({ caseTypeId, name: "Raum 1" });
    const second = await createCase({ caseTypeId, name: "Raum 2" });

    const firstUrl = first.headers.get("location")!;
    const secondUrl = second.headers.get("location")!;
    expect(firstUrl).not.toBe(secondUrl);

    const firstHtml = await (await fetch(firstUrl)).text();
    const secondHtml = await (await fetch(secondUrl)).text();

    expect(firstHtml).toContain("Raum 1");
    expect(secondHtml).toContain("Raum 2");

    const firstCode = extractCode(firstHtml);
    const secondCode = extractCode(secondHtml);
    expect(firstCode).not.toBe(secondCode);
  });

  it("generates collision-safe unique codes across many cases", async () => {
    const caseTypeId = extractCaseTypeId(await getStartPage());
    const codes = new Set<string>();

    for (let i = 0; i < 25; i++) {
      const response = await createCase({
        caseTypeId,
        name: `Kollisionsfall ${i}`,
      });
      expect(response.status).toBe(303);
      const html = await (await fetch(response.headers.get("location")!)).text();
      codes.add(extractCode(html));
    }

    expect(codes.size).toBe(25);
  });

  it("rejects an empty case name in German", async () => {
    const caseTypeId = extractCaseTypeId(await getStartPage());

    const response = await createCase({ caseTypeId, name: "" });

    expect(response.status).toBe(303);
    const location = response.headers.get("location")!;
    expect(location.startsWith(`${BASE_URL}/?error=`)).toBe(true);

    const html = await (await fetch(location)).text();
    expect(html).toContain("Bitte gib einen Fallnamen ein.");
  });

  it("rejects an unknown case type in German", async () => {
    const response = await createCase({
      name: "Beliebiger Fall",
      caseTypeId: "00000000-0000-4000-8000-000000000000",
    });

    expect(response.status).toBe(303);
    const location = response.headers.get("location")!;
    expect(location.startsWith(`${BASE_URL}/?error=`)).toBe(true);

    const html = await (await fetch(location)).text();
    expect(html).toContain("Unbekannter Falltyp.");
  });
});

describe("GET /cockpit/[id]", () => {
  it("returns 404 for unknown cockpit ids", async () => {
    const response = await fetch(
      `${BASE_URL}/cockpit/00000000-0000-4000-8000-000000000000`,
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 for malformed cockpit ids", async () => {
    const response = await fetch(`${BASE_URL}/cockpit/not-a-real-id`);
    expect(response.status).toBe(404);
  });
});

describe("seed script", () => {
  it("is idempotent when re-run against the database", async () => {
    const caseTypeCount = async () => {
      const sql = connectTestDb();
      try {
        const rows = await sql<{ count: string }[]>`select count(*) from case_types where name = ${SEEDED_TYPE_NAME}`;
        return Number(rows[0]!.count);
      } finally {
        await sql.end();
      }
    };

    const before = await caseTypeCount();

    const sql = connectTestDb();
    try {
      await sql.file(
        fileURLToPath(new URL("../../supabase/seed.sql", import.meta.url)),
      );
    } finally {
      await sql.end();
    }

    const after = await caseTypeCount();

    expect(before).toBeGreaterThan(0);
    expect(after).toBe(before);
  });
});
