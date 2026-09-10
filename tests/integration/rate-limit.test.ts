import { describe, expect, it } from "vitest";

import { BASE_URL } from "../setup/server-address";

function headersFor(ip: string): HeadersInit {
  return { "x-forwarded-for": ip };
}

const runSuffix = Date.now().toString().slice(-3);

const VIEWER_READ_GUESSING_IP = `198.51.100.${runSuffix}77`;
const VIEWER_READ_BURST_IP = `198.51.100.${runSuffix}78`;
const JOIN_GUESSING_IP = `198.51.100.${runSuffix}79`;
const COCKPIT_GUESSING_IP = `198.51.100.${runSuffix}80`;

describe("rate limiting", () => {
  it("throttles repeated viewer-code guesses beyond the limit with 429", async () => {
    const url = `${BASE_URL}/api/viewer/ZZZZZZZZ`;

    const responses = await Promise.all(
      Array.from({ length: 310 }, () =>
        fetch(url, { headers: headersFor(VIEWER_READ_GUESSING_IP) }),
      ),
    );

    const allowed = responses.filter((r) => r.status === 404);
    const throttled = responses.filter((r) => r.status === 429);
    expect(allowed.length).toBe(300);
    expect(throttled.length).toBe(10);
  });

  it("never throttles a shared-classroom burst: several rooms refetching from one IP", async () => {
    const url = `${BASE_URL}/api/viewer/ZZZZZZZZ`;

    const responses = await Promise.all(
      Array.from({ length: 40 }, () =>
        fetch(url, { headers: headersFor(VIEWER_READ_BURST_IP) }),
      ),
    );

    const throttled = responses.filter((r) => r.status === 429);
    expect(throttled).toHaveLength(0);
    expect(responses.every((r) => r.status === 404)).toBe(true);
  });

  it("throttles the join endpoint by redirecting to an error page beyond the limit", async () => {
    const url = `${BASE_URL}/api/viewer`;
    const body = new URLSearchParams({ code: "ZZZZZZZZ" }).toString();

    const responses = await Promise.all(
      Array.from({ length: 36 }, () =>
        fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            ...headersFor(JOIN_GUESSING_IP),
          },
          body,
          redirect: "manual",
        }),
      ),
    );

    const nonThrottled = responses.filter(
      (r) =>
        r.headers.get("location") !== null &&
        decodeURIComponent(r.headers.get("location")!).includes(
          "Fallcode nicht gefunden",
        ),
    );
    const throttled = responses.filter(
      (r) =>
        r.headers.get("location") !== null &&
        decodeURIComponent(r.headers.get("location")!).includes(
          "Zu viele Versuche",
        ),
    );
    expect(responses.every((r) => r.status === 303)).toBe(true);
    expect(nonThrottled.length).toBe(30);
    expect(throttled.length).toBe(6);
  });

  it("throttles repeated cockpit reads with 429", async () => {
    const url = `${BASE_URL}/api/cases/00000000-0000-4000-8000-000000000000`;

    const responses = await Promise.all(
      Array.from({ length: 130 }, () =>
        fetch(url, { headers: headersFor(COCKPIT_GUESSING_IP) }),
      ),
    );

    const allowed = responses.filter((r) => r.status === 404);
    const throttled = responses.filter((r) => r.status === 429);
    expect(allowed.length).toBe(120);
    expect(throttled.length).toBe(10);
  });
});
