import { describe, expect, it } from "vitest";

import { isCodeCollision } from "../../lib/cases";

describe("isCodeCollision", () => {
  const postgresError = (
    payload: Partial<Parameters<typeof isCodeCollision>[0]>,
  ) => ({
    name: "PostgresError",
    severity: "ERROR",
    code: "23505",
    detail: "Key (code)=(ABCD2345) already exists.",
    schema_name: "public",
    table_name: "cases",
    constraint_name: "cases_code_key",
    file: "nbtinsert.c",
    line: 666,
    routine: "_bt_check_unique",
    ...payload,
  });

  it("recognizes a unique violation on the case code constraint", () => {
    expect(isCodeCollision(postgresError({}))).toBe(true);
  });

  it("rejects errors that are not unique violations", () => {
    expect(isCodeCollision(postgresError({ code: "23503" }))).toBe(false);
  });

  it("rejects unique violations on a different constraint", () => {
    expect(
      isCodeCollision(postgresError({ constraint_name: "cases_code_key_other" })),
    ).toBe(false);
  });

  it("rejects malformed error objects", () => {
    expect(isCodeCollision(null)).toBe(false);
    expect(isCodeCollision("boom")).toBe(false);
    expect(isCodeCollision({})).toBe(false);
  });

  it("does not match when the constraining field is absent", () => {
    expect(isCodeCollision({ code: "23505" })).toBe(false);
  });
});
