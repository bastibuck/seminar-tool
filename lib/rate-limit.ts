import type { Sql } from "postgres";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export interface RateLimiter {
  check(request: Request): Promise<RateLimitResult>;
}

export type RateLimiterStore = "database" | "memory";

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

function createMemoryLimiter(
  endpoint: string,
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
      const key = `${ip}:${endpoint}`;

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

let dbPromise: Promise<Sql | null> | null = null;

async function getDb(): Promise<Sql | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const { sql } = await import("./db");
        return sql;
      } catch {
        return null;
      }
    })();
  }
  return dbPromise;
}

export async function createRateLimiter(
  endpoint: string,
  limit: number,
  windowSec: number,
  store: RateLimiterStore = "database",
): Promise<RateLimiter> {
  if (store === "memory") {
    return createMemoryLimiter(endpoint, windowSec * 1000, limit);
  }

  const sql = await getDb();
  if (!sql) {
    return createMemoryLimiter(endpoint, windowSec * 1000, limit);
  }
  return createDatabaseLimiter(sql, endpoint, limit, windowSec);
}