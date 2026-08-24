import { describe, expect, it } from "vitest";

import { BASE_URL } from "../setup/server-address";

describe("GET /", () => {
  it("serves a page that reads from the local database", async () => {
    const response = await fetch(`${BASE_URL}/`);

    expect(response.status).toBe(200);

    const body = await response.text();
    expect(body).toContain("Bereit");
  });
});
