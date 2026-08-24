import { describe, expect, it } from "vitest";

import {
  CASE_CODE_ALPHABET,
  CASE_CODE_LENGTH,
  generateCaseCode,
} from "../../lib/case-code";

describe("generateCaseCode", () => {
  it("generates codes of the configured length", () => {
    expect(generateCaseCode(() => 0)).toHaveLength(CASE_CODE_LENGTH);
  });

  it("draws every character from the unambiguous alphabet", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCaseCode();
      expect(code).toMatch(new RegExp(`^[${CASE_CODE_ALPHABET}]+$`));
    }
  });

  it("excludes visually ambiguous characters and letters prone to accidental words", () => {
    for (const char of "01ILOU") {
      expect(CASE_CODE_ALPHABET).not.toContain(char);
    }
  });

  it("keeps a large enough alphabet for collision safety", () => {
    expect(CASE_CODE_ALPHABET.length).toBeGreaterThanOrEqual(30);
  });

  it("maps each position deterministically onto the alphabet", () => {
    const randomInt = () => 5;
    const expected = CASE_CODE_ALPHABET[5].repeat(CASE_CODE_LENGTH);
    expect(generateCaseCode(randomInt)).toBe(expected);
  });

  it("uses the full spread of the alphabet across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      for (const char of generateCaseCode()) {
        seen.add(char);
      }
    }
    expect(seen.size).toBe(CASE_CODE_ALPHABET.length);
  });

  it("produces varied codes across many draws", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCaseCode()));
    expect(codes.size).toBeGreaterThan(190);
  });
});
