import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export interface RateLimiter {
  check(request: Request): Promise<RateLimitResult>;
}

function extractIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function makeKey(ip: string, path: string): string {
  return `${ip}:${path}`;
}

function createUpstashLimiter(
  windowSec: number,
  max: number,
  prefix: string,
): RateLimiter {
  const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
    prefix,
  });

  return {
    async check(request: Request): Promise<RateLimitResult> {
      const ip = extractIp(request);
      const url = new URL(request.url);
      const key = makeKey(ip, url.pathname);
      const { success, remaining } = await ratelimit.limit(key);
      return { allowed: success, remaining };
    },
  };
}

function createMemoryLimiter(
  windowMs: number,
  max: number,
): RateLimiter {
  const store = new Map<string, number[]>();

  function cleanup(key: string): void {
    const timestamps = store.get(key);
    if (!timestamps) return;

    const cutoff = Date.now() - windowMs;
    const filtered = timestamps.filter((t) => t > cutoff);

    if (filtered.length === 0) {
      store.delete(key);
    } else {
      store.set(key, filtered);
    }
  }

  return {
    check(request: Request): Promise<RateLimitResult> {
      const ip = extractIp(request);
      const url = new URL(request.url);
      const key = makeKey(ip, url.pathname);

      cleanup(key);

      const timestamps = store.get(key) ?? [];
      const count = timestamps.length;

      if (count >= max) {
        return Promise.resolve({ allowed: false, remaining: 0 });
      }

      timestamps.push(Date.now());
      store.set(key, timestamps);

      return Promise.resolve({ allowed: true, remaining: max - count - 1 });
    },
  };
}

export function createRateLimiter(
  windowSec: number,
  max: number,
  prefix: string,
): RateLimiter {
  if (process.env.UPSTASH_REDIS_REST_URL) {
    return createUpstashLimiter(windowSec, max, prefix);
  }
  return createMemoryLimiter(windowSec * 1000, max);
}
