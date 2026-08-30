import postgres from "postgres";

import { expect } from "vitest";

import { BASE_URL } from "../setup/server-address";

export const CODE_PATTERN = /[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}/;

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function getStartPage(): Promise<string> {
  const response = await fetch(`${BASE_URL}/`);
  expect(response.status).toBe(200);
  return response.text();
}

export function extractCaseTypeId(startPageHtml: string): string {
  const match = startPageHtml.match(/<option value="([0-9a-f-]{36})"/);
  if (!match) throw new Error("No case type found on the start page");
  return match[1]!;
}

export async function createCase(input: {
  name?: string;
  caseTypeId?: string;
}): Promise<Response> {
  const body = new URLSearchParams({
    name: input.name ?? "Herzinfarkt Demo",
    caseTypeId: input.caseTypeId ?? "",
  });
  return fetch(`${BASE_URL}/api/cases`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    redirect: "manual",
  });
}

export function extractCode(cockpitHtml: string): string {
  const match = cockpitHtml.match(CODE_PATTERN);
  if (!match) throw new Error("No short code shown on the cockpit page");
  return match[0];
}

export function connectTestDb() {
  return postgres(TEST_DATABASE_URL);
}
