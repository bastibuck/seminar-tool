import { describe, expect, it } from "vitest";

import { mutationsDisabledResponse } from "../../lib/mutation-safety";

describe("mutationsDisabledResponse", () => {
  it("returns the shared JSON 503 response", async () => {
    const response = mutationsDisabledResponse();

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      ok: false,
      error: "Mutationen sind derzeit deaktiviert.",
    });
  });
});
