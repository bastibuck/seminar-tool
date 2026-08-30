const AMBIGUITY_EXCLUSIONS = new Set(["0", "1", "I", "L", "O", "U"]);

const DIGITS = "23456789";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  .split("")
  .filter((letter) => !AMBIGUITY_EXCLUSIONS.has(letter));

export const CASE_CODE_ALPHABET = DIGITS + LETTERS.join("");

export const CASE_CODE_LENGTH = 8;
export const CASE_CODE_GROUP = 4;

export type RandomInt = (maxExclusive: number) => number;

function defaultRandomInt(maxExclusive: number): number {
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0]!;
  } while (value >= limit);
  return value % maxExclusive;
}

export function generateCaseCode(randomInt: RandomInt = defaultRandomInt): string {
  let code = "";
  for (let i = 0; i < CASE_CODE_LENGTH; i++) {
    code += CASE_CODE_ALPHABET[randomInt(CASE_CODE_ALPHABET.length)];
  }
  return code;
}

export function formatCaseCode(code: string): string {
  if (code.length <= CASE_CODE_GROUP) return code;
  return `${code.slice(0, CASE_CODE_GROUP)}-${code.slice(CASE_CODE_GROUP)}`;
}

export function normalizeCode(raw: string): string {
  return raw.replace(/-/g, "").toUpperCase();
}

export function formatCodeInput(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CASE_CODE_LENGTH);
  return formatCaseCode(clean);
}
