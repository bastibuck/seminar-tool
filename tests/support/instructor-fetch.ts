import { inject } from "vitest";
import "../setup/instructor";

// Existing feature tests exercise protected operations as an active Instructor.
// Viewer and internal requests remain anonymous.
export const fetch: typeof globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  const protectedPath = url.pathname === "/" || /^\/(admin|cockpit|api\/admin|api\/cases)(\/|$)/.test(url.pathname);
  if (!protectedPath || url.port !== "3111") return globalThis.fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (!headers.has("cookie")) headers.set("cookie", inject("instructorCookie"));
  return globalThis.fetch(input, { ...init, headers });
};
