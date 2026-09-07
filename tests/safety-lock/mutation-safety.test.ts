import { describe, expect, it } from "vitest";

import { connectTestDb } from "../support/cases";

const BASE_URL = "http://localhost:3112";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

async function request(
  path: string,
  method: string,
  body?: URLSearchParams,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, { method, body });
}

describe("disabled mutation safety lock", () => {
  it("returns 503 before every user-triggered mutation", async () => {
    const mutations = [
      ["/api/cases", "POST"],
      [`/api/cases/${UNKNOWN_ID}/releases`, "POST"],
      [`/api/cases/${UNKNOWN_ID}/end`, "POST"],
      ["/api/admin/case-types", "POST"],
      ["/api/admin/case-types", "PUT"],
      ["/api/admin/case-types", "DELETE"],
      [`/api/admin/case-types/${UNKNOWN_ID}`, "POST"],
      [`/api/admin/case-types/${UNKNOWN_ID}`, "PATCH"],
      [`/api/admin/case-types/${UNKNOWN_ID}`, "DELETE"],
      [`/api/admin/case-types/${UNKNOWN_ID}`, "PUT"],
      [`/api/admin/findings/${UNKNOWN_ID}`, "PATCH"],
    ] as const;

    const marker = `Safety lock ${crypto.randomUUID()}`;
    const responses = await Promise.all(
      mutations.map(([path, method], index) =>
        request(
          path,
          method,
          index === 0
            ? new URLSearchParams({ name: marker, caseTypeId: UNKNOWN_ID })
            : index === 3
              ? new URLSearchParams({ name: marker })
              : undefined,
        ),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      mutations.map(() => 503),
    );
    expect(await countMarker(marker)).toBe(0);
  });

  it("does not block viewer lookup, reads, or the cleanup route", async () => {
    const viewer = await fetch(`${BASE_URL}/api/viewer`, {
      method: "POST",
      body: new URLSearchParams({ code: "does-not-exist" }),
      redirect: "manual",
    });
    expect(viewer.status).toBe(303);

    const read = await request("/api/admin/case-types", "GET");
    expect(read.status).toBe(200);

    const cleanup = await request("/api/internal/finding-image-cleanup", "GET");
    expect(cleanup.status).toBe(401);
  });
});

async function countMarker(marker: string) {
  const sql = connectTestDb();
  try {
    const rows = await sql<{ count: string }[]>`
      select (
        (select count(*) from cases where name = ${marker}) +
        (select count(*) from case_types where name = ${marker})
      )::text as count
    `;
    return Number(rows[0]!.count);
  } finally {
    await sql.end();
  }
}
