import { describe, expect, it } from "vitest";

import { getSupabaseUrl } from "../../lib/supabase-config";
import { BASE_URL } from "../setup/server-address";
import {
  createCase,
  extractCaseTypeId,
  extractCode,
  getStartPage,
  resolveLocation,
} from "../support/cases";

const HSTS_VALUE = "max-age=63072000; includeSubDomains; preload";

function nonceOf(headers: Headers): string {
  const csp = headers.get("content-security-policy")!;
  const match = csp!.match(/'nonce-([^']+)'/);
  if (!match) throw new Error(`Expected a nonce in CSP: ${csp}`);
  return match[1]!;
}

function expectCoreSecurityHeaders(headers: Headers): string {
  expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  expect(headers.get("x-content-type-options")).toBe("nosniff");
  expect(headers.get("permissions-policy")).toContain("geolocation=()");
  expect(headers.get("permissions-policy")).toContain("camera=()");

  const csp = headers.get("content-security-policy");
  expect(csp).toBeDefined();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  const scriptSrc = csp!.match(/script-src ([^;]*)/)?.[1];
  expect(scriptSrc).toContain("'nonce-");
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
  expect(csp).toContain(getSupabaseUrl());
  expect(csp).toContain("https://fonts.googleapis.com");
  expect(csp).toContain("https://fonts.gstatic.com");
  expect(csp).toContain("object-src 'none'");

  expect(headers.get("strict-transport-security")).toBe(HSTS_VALUE);
  return csp!;
}

async function createFreshCase(name: string): Promise<{
  cockpitUrl: string;
  code: string;
}> {
  const caseTypeId = extractCaseTypeId(await getStartPage());
  const response = await createCase({ caseTypeId, name });
  expect(response.status).toBe(303);
  const cockpitUrl = resolveLocation(response.headers.get("location")!);
  const cockpitResponse = await fetch(cockpitUrl);
  const code = extractCode(await cockpitResponse.text());
  return { cockpitUrl, code };
}

describe("deployed security headers", () => {
  it("protects the cockpit page: CSP, frame protection and static headers", async () => {
    const { cockpitUrl } = await createFreshCase("Header-Cockpit");

    const response = await fetch(cockpitUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    const csp = expectCoreSecurityHeaders(response.headers);

    const html = await response.text();
    const nonce = nonceOf(response.headers);
    expect(csp).toContain(`'nonce-${nonce}'`);
    for (const scriptTag of html.match(/<script\b[^>]*>/g) ?? []) {
      expect(scriptTag).toContain(`nonce="${nonce}"`);
    }
  });

  it("protects the admin pages with frame protection", async () => {
    const response = await fetch(`${BASE_URL}/admin`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expectCoreSecurityHeaders(response.headers);
  });

  it("keeps the viewer page under the same strict CSP", async () => {
    const { code } = await createFreshCase("Header-Viewer");

    const response = await fetch(`${BASE_URL}/viewer/${code}`);
    expect(response.status).toBe(200);
    const csp = expectCoreSecurityHeaders(response.headers);

    const html = await response.text();
    const nonce = nonceOf(response.headers);
    expect(csp).toContain(`'nonce-${nonce}'`);
    for (const scriptTag of html.match(/<script\b[^>]*>/g) ?? []) {
      expect(scriptTag).toContain(`nonce="${nonce}"`);
    }
  });

  it("applies the security headers to API routes", async () => {
    const response = await fetch(`${BASE_URL}/api/viewer/ZZZZZZZZ`, {
      redirect: "manual",
    });
    expect(response.status).toBe(404);
    expectCoreSecurityHeaders(response.headers);
  });

  it("emits a fresh nonce for every request", async () => {
    const first = await fetch(`${BASE_URL}/`);
    const second = await fetch(`${BASE_URL}/`);
    expect(nonceOf(first.headers)).not.toBe(nonceOf(second.headers));
    expect(nonceOf(first.headers)).toBeTruthy();
  });
});