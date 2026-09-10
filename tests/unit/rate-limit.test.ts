import { describe, expect, it, vi } from "vitest";

import { createRateLimiter } from "../../lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows requests within the limit", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
    });

    const req = new Request("http://localhost/api/test");

    expect(limiter.check(req)).toEqual({ allowed: true, remaining: 2 });
    expect(limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
  });

  it("blocks requests exceeding the limit", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 2,
    });

    const req = new Request("http://localhost/api/test");

    expect(limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
    expect(limiter.check(req)).toEqual({ allowed: false, remaining: 0 });
  });

  it("tracks per-IP separately", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
    });

    const reqA = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    const reqB = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "2.2.2.2" },
    });

    expect(limiter.check(reqA)).toEqual({ allowed: true, remaining: 0 });
    expect(limiter.check(reqB)).toEqual({ allowed: true, remaining: 0 });
  });

  it("blocks once per-IP, not globally", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
    });

    const reqA = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    const reqB = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "2.2.2.2" },
    });

    limiter.check(reqA);
    expect(limiter.check(reqA)).toEqual({ allowed: false, remaining: 0 });
    expect(limiter.check(reqB)).toEqual({ allowed: true, remaining: 0 });
  });

  it("resets the count after the window expires", () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      vi.setSystemTime(now);

      const limiter = createRateLimiter({
        windowMs: 60_000,
        max: 2,
      });

      const req = new Request("http://localhost/api/test");

      expect(limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
      expect(limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
      expect(limiter.check(req)).toEqual({ allowed: false, remaining: 0 });

      vi.setSystemTime(now + 60_001);

      expect(limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
      expect(limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a sliding window, not a fixed window", () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      vi.setSystemTime(now);

      const limiter = createRateLimiter({
        windowMs: 60_000,
        max: 2,
      });

      const req = new Request("http://localhost/api/test");

      limiter.check(req);
      limiter.check(req);
      expect(limiter.check(req)).toEqual({ allowed: false, remaining: 0 });

      vi.setSystemTime(now + 30_000);

      limiter.check(req);
      limiter.check(req);
      expect(limiter.check(req)).toEqual({ allowed: false, remaining: 0 });

      vi.setSystemTime(now + 60_001);

      expect(limiter.check(req)).toEqual({ allowed: true, remaining: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("extracts IP from x-real-ip header as fallback", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
    });

    const reqA = new Request("http://localhost/api/test", {
      headers: { "x-real-ip": "3.3.3.3" },
    });
    const reqB = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "4.4.4.4" },
    });

    expect(limiter.check(reqA)).toEqual({ allowed: true, remaining: 0 });
    expect(limiter.check(reqB)).toEqual({ allowed: true, remaining: 0 });
  });

  it("groups multiple IPs behind comma-separated x-forwarded-for", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
    });

    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.1.1.1, 5.5.5.5" },
    });

    expect(limiter.check(req)).toEqual({ allowed: true, remaining: 0 });
  });

  it("provides a makeKey helper for custom keys", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 2,
    });

    const key = limiter.makeKey("1.1.1.1", "/api/viewer");
    expect(key).toBe("1.1.1.1:/api/viewer");

    expect(limiter.checkKey(key)).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.checkKey(key)).toEqual({ allowed: true, remaining: 0 });
    expect(limiter.checkKey(key)).toEqual({ allowed: false, remaining: 0 });
  });
});
