import { describe, expect, it, vi } from "vitest";

import { createRateLimiter } from "../../lib/rate-limit";

describe("createRateLimiter (in-memory fallback)", () => {
  it("allows requests within the limit", async () => {
    const limiter = await createRateLimiter("test:allow", 3, 60, "memory");

    const req = new Request("http://localhost/api/test");

    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 2 });
    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
  });

  it("blocks requests exceeding the limit", async () => {
    const limiter = await createRateLimiter("test:block", 2, 60, "memory");

    const req = new Request("http://localhost/api/test");

    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
    expect(await limiter.check(req)).toEqual({ allowed: false, remaining: 0 });
  });

  it("tracks per-IP separately", async () => {
    const limiter = await createRateLimiter("test:per-ip", 1, 60, "memory");

    const reqA = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    const reqB = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "2.2.2.2" },
    });

    expect(await limiter.check(reqA)).toEqual({ allowed: true, remaining: 0 });
    expect(await limiter.check(reqB)).toEqual({ allowed: true, remaining: 0 });
  });

  it("blocks once per-IP, not globally", async () => {
    const limiter = await createRateLimiter("test:not-global", 1, 60, "memory");

    const reqA = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    const reqB = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "2.2.2.2" },
    });

    await limiter.check(reqA);
    expect(await limiter.check(reqA)).toEqual({ allowed: false, remaining: 0 });
    expect(await limiter.check(reqB)).toEqual({ allowed: true, remaining: 0 });
  });

  it("resets the count after the window expires", async () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      vi.setSystemTime(now);

      const limiter = await createRateLimiter("test:reset", 2, 60, "memory");

      const req = new Request("http://localhost/api/test");

      expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
      expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
      expect(await limiter.check(req)).toEqual({ allowed: false, remaining: 0 });

      vi.setSystemTime(now + 60_001);

      expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
      expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a sliding window, not a fixed window", async () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      vi.setSystemTime(now);

      const limiter = await createRateLimiter("test:sliding", 2, 60, "memory");

      const req = new Request("http://localhost/api/test");

      await limiter.check(req);
      await limiter.check(req);
      expect(await limiter.check(req)).toEqual({ allowed: false, remaining: 0 });

      vi.setSystemTime(now + 30_000);

      await limiter.check(req);
      await limiter.check(req);
      expect(await limiter.check(req)).toEqual({ allowed: false, remaining: 0 });

      vi.setSystemTime(now + 60_001);

      expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("extracts IP from x-real-ip header as fallback", async () => {
    const limiter = await createRateLimiter("test:x-real-ip", 1, 60, "memory");

    const reqA = new Request("http://localhost/api/test", {
      headers: { "x-real-ip": "3.3.3.3" },
    });
    const reqB = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "4.4.4.4" },
    });

    expect(await limiter.check(reqA)).toEqual({ allowed: true, remaining: 0 });
    expect(await limiter.check(reqB)).toEqual({ allowed: true, remaining: 0 });
  });

  it("groups multiple IPs behind comma-separated x-forwarded-for", async () => {
    const limiter = await createRateLimiter("test:comma-ips", 1, 60, "memory");

    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.1.1.1, 5.5.5.5" },
    });

    expect(await limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
  });

  it("isolates by endpoint name", async () => {
    const limiterA = await createRateLimiter("test:iso-a", 1, 60, "memory");
    const limiterB = await createRateLimiter("test:iso-b", 1, 60, "memory");

    const req = new Request("http://localhost/api/test");

    expect(await limiterA.check(req)).toEqual({ allowed: true, remaining: 0 });
    expect(await limiterA.check(req)).toEqual({ allowed: false, remaining: 0 });
    expect(await limiterB.check(req)).toEqual({ allowed: true, remaining: 0 });
  });
});
