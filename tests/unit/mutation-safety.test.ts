import { afterEach, describe, expect, it } from "vitest";

import {
  mutationsDisabledResponse,
  mutationsEnabled,
} from "../../lib/mutation-safety";

const originalValue = process.env.MUTATIONS_ENABLED;

afterEach(() => {
  if (originalValue === undefined) {
    delete process.env.MUTATIONS_ENABLED;
  } else {
    process.env.MUTATIONS_ENABLED = originalValue;
  }
});

describe("mutationsEnabled", () => {
  it("only enables mutations for the exact lowercase true value", () => {
    for (const value of [undefined, "", "TRUE", " true", "true ", "1", "false"]) {
      if (value === undefined) delete process.env.MUTATIONS_ENABLED;
      else process.env.MUTATIONS_ENABLED = value;

      expect(mutationsEnabled()).toBe(false);
    }

    process.env.MUTATIONS_ENABLED = "true";
    expect(mutationsEnabled()).toBe(true);
  });
});

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
