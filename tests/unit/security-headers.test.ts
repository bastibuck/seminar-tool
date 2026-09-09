import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildBaseSecurityHeaders,
  buildCsp,
} from "../../lib/security-headers";

const SUPABASE_HTTPS = "https://abcd.supabase.co";
const SUPABASE_HTTP = "http://127.0.0.1:54321";

function directivesOf(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
}

describe("buildCsp", () => {
  it("restricts default-src to the app origin", () => {
    const csp = buildCsp({ nonce: "abc123", supabaseUrl: SUPABASE_HTTPS });
    expect(csp).toContain("default-src 'self'");
  });

  it("allows scripts via nonce only, never unsafe-inline", () => {
    const csp = buildCsp({ nonce: "abc123", supabaseUrl: SUPABASE_HTTPS });
    const scriptSrc = directivesOf(csp).get("script-src")!;
    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("adds unsafe-eval for scripts only in development", () => {
    const prod = buildCsp({ nonce: "abc123", supabaseUrl: SUPABASE_HTTPS });
    expect(directivesOf(prod).get("script-src")).not.toContain("'unsafe-eval'");

    const dev = buildCsp({
      nonce: "abc123",
      isDev: true,
      supabaseUrl: SUPABASE_HTTPS,
    });
    expect(directivesOf(dev).get("script-src")).toContain("'unsafe-eval'");
  });

  it("allows app styles plus the Google Fonts stylesheet host", () => {
    const csp = buildCsp({ nonce: "abc123", supabaseUrl: SUPABASE_HTTPS });
    const styleSrc = directivesOf(csp).get("style-src")!;
    expect(styleSrc).toContain("'self'");
    expect(styleSrc).toContain("https://fonts.googleapis.com");
  });

  it("allows font files from the Google Fonts gstatic host", () => {
    const csp = buildCsp({ nonce: "abc123", supabaseUrl: SUPABASE_HTTPS });
    const fontSrc = directivesOf(csp).get("font-src")!;
    expect(fontSrc).toContain("https://fonts.gstatic.com");
  });

  it("allows finding images from the Supabase origin", () => {
    const csp = buildCsp({ nonce: "abc123", supabaseUrl: SUPABASE_HTTPS });
    const imgSrc = directivesOf(csp).get("img-src")!;
    expect(imgSrc).toContain(SUPABASE_HTTPS);
  });

  it("allows Supabase REST, Realtime and WebSocket connections", () => {
    const csp = buildCsp({ nonce: "abc123", supabaseUrl: SUPABASE_HTTPS });
    const connectSrc = directivesOf(csp).get("connect-src")!;
    expect(connectSrc).toContain(SUPABASE_HTTPS);
    expect(connectSrc).toContain(`wss://${new URL(SUPABASE_HTTPS).host}`);
  });

  it("uses the ws scheme for a non-HTTPS Supabase origin", () => {
    const csp = buildCsp({ nonce: "abc123", supabaseUrl: SUPABASE_HTTP });
    const connectSrc = directivesOf(csp).get("connect-src")!;
    expect(connectSrc).toContain(SUPABASE_HTTP);
    expect(connectSrc).toContain("ws://127.0.0.1:54321");
  });

  it("strips a trailing slash from the Supabase origin", () => {
    const csp = buildCsp({
      nonce: "abc123",
      supabaseUrl: "https://abcd.supabase.co/",
    });
    const imgSrc = directivesOf(csp).get("img-src")!;
    expect(imgSrc).toContain("https://abcd.supabase.co");
    expect(imgSrc).not.toContain("https://abcd.supabase.co/");
  });

  it("blocks framing and inert objects", () => {
    const csp = buildCsp({ nonce: "abc123", supabaseUrl: SUPABASE_HTTPS });
    expect(directivesOf(csp).get("frame-ancestors")).toEqual(["'none'"]);
    expect(directivesOf(csp).get("object-src")).toEqual(["'none'"]);
    expect(directivesOf(csp).get("base-uri")).toEqual(["'self'"]);
    expect(directivesOf(csp).get("form-action")).toEqual(["'self'"]);
  });

  it("upgrades insecure requests only in production", () => {
    const prod = buildCsp({ nonce: "abc123", supabaseUrl: SUPABASE_HTTPS });
    expect(prod).toContain("upgrade-insecure-requests");

    const dev = buildCsp({
      nonce: "abc123",
      isDev: true,
      supabaseUrl: SUPABASE_HTTPS,
    });
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("falls back to the configured Supabase URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_HTTPS);
    const csp = buildCsp({ nonce: "abc123" });
    expect(directivesOf(csp).get("connect-src")).toContain(SUPABASE_HTTPS);
  });
});

describe("buildBaseSecurityHeaders", () => {
  it("emits a strict cross-origin referrer policy", () => {
    const headers = buildBaseSecurityHeaders(true);
    expect(headers).toContainEqual({
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    });
  });

  it("sets nosniff for content types", () => {
    const headers = buildBaseSecurityHeaders(true);
    expect(headers).toContainEqual({
      key: "X-Content-Type-Options",
      value: "nosniff",
    });
  });

  it("restricts browser features via Permissions-Policy", () => {
    const headers = buildBaseSecurityHeaders(true);
    const policy = headers.find((h) => h.key === "Permissions-Policy");
    expect(policy).toBeDefined();
    expect(policy!.value).toContain("camera=()");
    expect(policy!.value).toContain("microphone=()");
    expect(policy!.value).toContain("geolocation=()");
  });

  it("enables HSTS only in production", () => {
    const prod = buildBaseSecurityHeaders(true);
    expect(prod).toContainEqual({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });

    const nonProd = buildBaseSecurityHeaders(false);
    expect(nonProd).not.toContainEqual(
      expect.objectContaining({ key: "Strict-Transport-Security" }),
    );
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});