import { describe, expect, it } from "vitest";

import {
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  generateShortCode,
} from "../../lib/short-code";

describe("generateShortCode", () => {
  it("generates codes of the configured length", () => {
    expect(generateShortCode(() => 0)).toHaveLength(SHORT_CODE_LENGTH);
  });

  it("draws every character from the unambiguous alphabet", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateShortCode();
      expect(code).toMatch(new RegExp(`^[${SHORT_CODE_ALPHABET}]+$`));
    }
  });

  it("excludes visually ambiguous characters and letters prone to accidental words", () => {
    for (const char of "01ILOU") {
      expect(SHORT_CODE_ALPHABET).not.toContain(char);
    }
  });

  it("keeps a large enough alphabet for collision safety", () => {
    expect(SHORT_CODE_ALPHABET.length).toBeGreaterThanOrEqual(30);
  });

  it("maps each position deterministically onto the alphabet", () => {
    const randomInt = () => 5;
    const expected = SHORT_CODE_ALPHABET[5].repeat(SHORT_CODE_LENGTH);
    expect(generateShortCode(randomInt)).toBe(expected);
  });

  it("uses the full spread of the alphabet across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      for (const char of generateShortCode()) {
        seen.add(char);
      }
    }
    expect(seen.size).toBe(SHORT_CODE_ALPHABET.length);
  });

  it("produces varied codes across many draws", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateShortCode()));
    expect(codes.size).toBeGreaterThan(190);
  });
});
