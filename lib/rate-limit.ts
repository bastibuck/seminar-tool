import { NextResponse } from "next/server";
import type { Sql } from "postgres";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export interface RateLimiter {
  check(request: Request): Promise<RateLimitResult>;
}

export function rateLimitExceededResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Zu viele Anfragen. Bitte warte einen Moment." },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}

function extractIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function createDatabaseLimiter(
  sql: Sql,
  endpoint: string,
  limit: number,
  windowSec: number,
): RateLimiter {
  return {
    async check(request: Request): Promise<RateLimitResult> {
      const ip = extractIp(request);
      const rows = await sql<{ ok: boolean; remaining: number }[]>`
        select *
        from check_rate_limit(
          ${ip},
          ${endpoint},
          ${limit},
          make_interval(secs => ${windowSec})
        )
      `;
      const row = rows[0];
      return { allowed: row.ok, remaining: row.remaining };
    },
  };
}

const limiterCache = new Map<string, Promise<RateLimiter>>();

export function createRateLimiter(
  endpoint: string,
  limit: number,
  windowSec: number,
): Promise<RateLimiter> {
  const key = `${endpoint}:${limit}:${windowSec}`;
  const cached = limiterCache.get(key);
  if (cached) return cached;

  const limiter = (async (): Promise<RateLimiter> => {
    const { sql } = await import("./db");
    return createDatabaseLimiter(sql, endpoint, limit, windowSec);
  })();

  limiterCache.set(key, limiter);
  return limiter;
}