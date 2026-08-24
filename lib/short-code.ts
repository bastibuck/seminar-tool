const AMBIGUITY_EXCLUSIONS = new Set(["0", "1", "I", "L", "O", "U"]);

const DIGITS = "23456789";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  .split("")
  .filter((letter) => !AMBIGUITY_EXCLUSIONS.has(letter));

export const SHORT_CODE_ALPHABET = DIGITS + LETTERS.join("");

export const SHORT_CODE_LENGTH = 6;

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

export function generateShortCode(
  randomInt: RandomInt = defaultRandomInt,
): string {
  let code = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    code += SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)];
  }
  return code;
}

export function formatShortCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
