import { NextResponse, type NextRequest } from "next/server";

import { buildCsp } from "./lib/security-headers";

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const cspHeader = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};