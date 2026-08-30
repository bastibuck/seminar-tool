import { describe, expect, it } from "vitest";

import {
  CASE_CODE_ALPHABET,
  CASE_CODE_LENGTH,
  formatCaseCode,
  formatCodeInput,
  generateCaseCode,
  normalizeCode,
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

describe("case code format", () => {
  it("uses 8 characters split into two groups of 4", () => {
    expect(CASE_CODE_LENGTH).toBe(8);
    expect(formatCaseCode("ABCD2345")).toBe("ABCD-2345");
  });

  it("keeps the dash out of the stored code", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateCaseCode();
      expect(code).not.toContain("-");
      expect(code).toHaveLength(8);
    }
  });
});

describe("formatCaseCode", () => {
  it("inserts a dash after the fourth character", () => {
    expect(formatCaseCode("ABCD2345")).toBe("ABCD-2345");
  });

  it("leaves a short code without a trailing dash", () => {
    expect(formatCaseCode("ABC")).toBe("ABC");
  });
});

describe("normalizeCode", () => {
  it("removes a dash and uppercases", () => {
    expect(normalizeCode("abcd-2345")).toBe("ABCD2345");
  });

  it("removes every dash, not just the first", () => {
    expect(normalizeCode("AB-CD-23-45")).toBe("ABCD2345");
  });

  it("leaves a code without a dash untouched except for casing", () => {
    expect(normalizeCode("abcd2345")).toBe("ABCD2345");
  });
});

describe("formatCodeInput", () => {
  it("inserts the dash automatically after the fourth character", () => {
    expect(formatCodeInput("ABCD2345")).toBe("ABCD-2345");
  });

  it("keeps the input clean before the fifth character", () => {
    expect(formatCodeInput("ABC")).toBe("ABC");
    expect(formatCodeInput("ABCD")).toBe("ABCD");
  });

  it("uppercases as the user types", () => {
    expect(formatCodeInput("abcd")).toBe("ABCD");
  });

  it("strips characters outside the code alphabet", () => {
    expect(formatCodeInput("AB-CD_23 45!!")).toBe("ABCD-2345");
  });

  it("keeps an already-dashed code intact", () => {
    expect(formatCodeInput("abcd-2345")).toBe("ABCD-2345");
  });

  it("never grows beyond 8 characters plus the dash", () => {
    expect(formatCodeInput("ABCD2345XYZ")).toBe("ABCD-2345");
  });

  it("returns the empty string for empty input", () => {
    expect(formatCodeInput("")).toBe("");
  });
});