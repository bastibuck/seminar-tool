import { getSupabaseUrl } from "./supabase-config";

export const REFERRER_POLICY = "strict-origin-when-cross-origin";
export const HSTS_VALUE = "max-age=63072000; includeSubDomains; preload";
export const PERMISSIONS_POLICY_VALUE =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=()";

const GOOGLE_FONTS_STYLESHEET = "https://fonts.googleapis.com";
const GOOGLE_FONTS_FILES = "https://fonts.gstatic.com";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

type BuildCspOptions = {
  nonce: string;
  isDev?: boolean;
  supabaseUrl?: string;
};

export function buildCsp({
  nonce,
  isDev = false,
  supabaseUrl = getSupabaseUrl(),
}: BuildCspOptions): string {
  const origin = trimTrailingSlash(supabaseUrl);
  const realtimeEndpoint = new URL(origin);
  const realtimeWs = `${realtimeEndpoint.protocol === "https:" ? "wss" : "ws"}://${realtimeEndpoint.host}`;

  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    isDev ? "'unsafe-eval'" : null,
  ].filter(Boolean);

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_STYLESHEET}`,
    `img-src 'self' ${origin}`,
    `font-src 'self' ${GOOGLE_FONTS_FILES}`,
    `connect-src 'self' ${origin} ${realtimeWs}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];

  return directives.join("; ");
}

export function buildBaseSecurityHeaders(
  isProduction: boolean,
): Array<{ key: string; value: string }> {
  const headers = [
    { key: "Referrer-Policy", value: REFERRER_POLICY },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY_VALUE },
  ];
  if (isProduction) {
    headers.push({ key: "Strict-Transport-Security", value: HSTS_VALUE });
  }
  return headers;
}