import { describe, expect, it } from "vitest";

import { sql } from "../../lib/db";
import { createRateLimiter } from "../../lib/rate-limit";

function headersFor(ip: string): HeadersInit {
  return { "x-forwarded-for": ip };
}

// Unique per run so entries left behind by a previous run (the 60s window) can
// never skew the counts.
const runSuffix = Date.now().toString().slice(-3);
const ip = (suffix: number) => `198.51.100.${runSuffix}${suffix}`;

describe("createRateLimiter (Postgres-backed)", () => {
  it("allows requests within the limit", async () => {
    const limiter = await createRateLimiter("unit:allow", 3, 60);

    const req = new Request("http://localhost/api/test", {
      headers: headersFor(ip(1)),
    });

    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 2 });
    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
  });

  it("blocks requests exceeding the limit", async () => {
    const limiter = await createRateLimiter("unit:block", 2, 60);

    const req = new Request("http://localhost/api/test", {
      headers: headersFor(ip(2)),
    });

    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
    expect(await limiter.check(req)).toEqual({ allowed: false, remaining: 0 });
  });

  it("tracks per-IP separately", async () => {
    const limiter = await createRateLimiter("unit:per-ip", 1, 60);

    const reqA = new Request("http://localhost/api/test", {
      headers: headersFor(ip(3)),
    });
    const reqB = new Request("http://localhost/api/test", {
      headers: headersFor(ip(4)),
    });

    expect(await limiter.check(reqA)).toEqual({ allowed: true, remaining: 0 });
    expect(await limiter.check(reqB)).toEqual({ allowed: true, remaining: 0 });
  });

  it("blocks once per-IP, not globally", async () => {
    const limiter = await createRateLimiter("unit:not-global", 1, 60);

    const reqA = new Request("http://localhost/api/test", {
      headers: headersFor(ip(5)),
    });
    const reqB = new Request("http://localhost/api/test", {
      headers: headersFor(ip(6)),
    });

    await limiter.check(reqA);
    expect(await limiter.check(reqA)).toEqual({ allowed: false, remaining: 0 });
    expect(await limiter.check(reqB)).toEqual({ allowed: true, remaining: 0 });
  });

  it("resets the count after the window expires", async () => {
    const address = ip(7);
    const endpoint = "unit:reset";
    const limiter = await createRateLimiter(endpoint, 2, 60);

    const req = new Request("http://localhost/api/test", {
      headers: headersFor(address),
    });

    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
    expect(await limiter.check(req)).toEqual({ allowed: false, remaining: 0 });

    // Age the recorded requests beyond the 60s window.
    await sql`
      update rate_limits
      set created_at = now() - interval '61 seconds'
      where ip = ${address} and endpoint = ${endpoint}
    `;

    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
  });

  it("uses a sliding window, not a fixed window", async () => {
    const address = ip(8);
    const endpoint = "unit:sliding";
    const limiter = await createRateLimiter(endpoint, 2, 60);

    // Two requests 30s ago are still inside the 60s window.
    await sql`
      insert into rate_limits (ip, endpoint, created_at)
      values
        (${address}, ${endpoint}, now() - interval '30 seconds'),
        (${address}, ${endpoint}, now() - interval '30 seconds')
    `;

    const req = new Request("http://localhost/api/test", {
      headers: headersFor(address),
    });

    expect(await limiter.check(req)).toEqual({ allowed: false, remaining: 0 });

    // Age those requests past the window; the next request is allowed again.
    await sql`
      update rate_limits
      set created_at = now() - interval '61 seconds'
      where ip = ${address} and endpoint = ${endpoint}
    `;

    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
  });

  it("extracts IP from x-real-ip header as fallback", async () => {
    const limiter = await createRateLimiter("unit:x-real-ip", 1, 60);

    const reqA = new Request("http://localhost/api/test", {
      headers: { "x-real-ip": ip(9) },
    });
    const reqB = new Request("http://localhost/api/test", {
      headers: headersFor(ip(0)),
    });

    expect(await limiter.check(reqA)).toEqual({ allowed: true, remaining: 0 });
    expect(await limiter.check(reqB)).toEqual({ allowed: true, remaining: 0 });
  });

  it("groups multiple IPs behind comma-separated x-forwarded-for", async () => {
    const limiter = await createRateLimiter("unit:comma-ips", 1, 60);

    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.1.1.1, 5.5.5.5" },
    });

    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
  });

  it("isolates by endpoint name", async () => {
    const limiterA = await createRateLimiter("unit:iso-a", 1, 60);
    const limiterB = await createRateLimiter("unit:iso-b", 1, 60);

    const req = new Request("http://localhost/api/test", {
      headers: headersFor(ip(3)),
    });

    expect(await limiterA.check(req)).toEqual({ allowed: true, remaining: 0 });
    expect(await limiterA.check(req)).toEqual({ allowed: false, remaining: 0 });
    expect(await limiterB.check(req)).toEqual({ allowed: true, remaining: 0 });
  });
});