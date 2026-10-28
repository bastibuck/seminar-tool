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
  requestHeaders.set("x-instructor-destination", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  // Consume the short-lived user-navigation marker even on redirects. It is
  // never used for prefetches or subrequests, and is not an auth credential.
  if (request.headers.get("sec-fetch-mode") === "navigate" && request.cookies.has("instructor_navigation")) {
    response.cookies.delete("instructor_navigation");
  }
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
