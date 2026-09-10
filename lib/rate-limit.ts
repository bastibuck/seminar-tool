export interface RateLimiterOptions {
  /** Sliding window duration in milliseconds */
  windowMs: number;
  /** Maximum requests allowed per window per key */
  max: number;
}

interface WindowEntry {
  timestamps: number[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export interface RateLimiter {
  checkKey(key: string): RateLimitResult;
  check(request: Request): RateLimitResult;
  makeKey(ip: string, path: string): string;
}

export function createRateLimiter(
  options: RateLimiterOptions,
): RateLimiter {
  const store = new Map<string, WindowEntry>();

  function cleanup(key: string): void {
    const entry = store.get(key);
    if (!entry) return;

    const cutoff = Date.now() - options.windowMs;
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }

  function checkKey(key: string): RateLimitResult {
    cleanup(key);

    const entry = store.get(key);
    const count = entry?.timestamps.length ?? 0;

    if (count >= options.max) {
      return { allowed: false, remaining: 0 };
    }

    if (!entry) {
      store.set(key, { timestamps: [Date.now()] });
    } else {
      entry.timestamps.push(Date.now());
    }

    return { allowed: true, remaining: options.max - count - 1 };
  }

  function makeKey(ip: string, path: string): string {
    return `${ip}:${path}`;
  }

  function extractIp(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0]?.trim() ?? "unknown";
    }
    return request.headers.get("x-real-ip") ?? "unknown";
  }

  function check(request: Request): RateLimitResult {
    const ip = extractIp(request);
    const url = new URL(request.url);
    return checkKey(makeKey(ip, url.pathname));
  }

  return { check, checkKey, makeKey };
}
