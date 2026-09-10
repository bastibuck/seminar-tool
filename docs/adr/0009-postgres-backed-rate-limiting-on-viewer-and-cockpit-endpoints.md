# Postgres-backed rate limiting on viewer and cockpit endpoints

The viewer code join endpoint (`POST /api/viewer`), viewer read endpoint (`GET /api/viewer/:code`), and cockpit read endpoint (`GET /api/cases/:cockpitId`) are rate-limited per client IP using a Postgres-backed sliding-window counter.

Viewer codes are 8 characters from a 30-character alphabet (~39.3 bits of entropy). Without throttling, an attacker can try codes far faster than their entropy justifies. Rate limiting makes brute-forcing impractical.

**Limits (per IP, per 60-second sliding window):**

| Endpoint | Max | Rationale |
|---|---|---|
| `POST /api/viewer` (join) | 30 | Primary guessing surface. 30/min accommodates several classrooms sharing one IP (each room joining once) while blocking automated bulk attempts. |
| `GET /api/viewer/:code` (read) | 300 | Legitimate refetch traffic: ~1s refetches on each release event across multiple rooms on a shared classroom network. 5 rooms × 5 viewers × 1 refetch/s = 300/min sustained. |
| `GET /api/cases/:cockpitId` (cockpit) | 120 | Doctor steering traffic: periodic polling plus release actions. Generous for normal use; blocks sustained automated reads. |

**Mechanism:** A `rate_limits` table (ip, endpoint, created_at) with an index on `(ip, endpoint, created_at)`. Each request calls the `check_rate_limit(ip, endpoint, limit, window)` SQL function, which atomically prunes entries older than the window, counts the remaining entries for that ip+endpoint, inserts the current entry, and returns whether the request is allowed plus how many remain. The function is `security definer` with `revoke` from public — direct table access is denied; the function (which writes its own rate-limit rows) is the only reachable path, so it runs with the privileges it needs.

**Why Postgres instead of Redis/Upstash:**

- **Single code path.** One implementation runs in production, local dev, and tests. No env-variable branching. (A tiny in-memory fallback exists only when `DATABASE_URL` is entirely absent, e.g. running the unit tests without a database — see "Local dev" below; production, local dev, and integration tests all use the Postgres path.)
- **No new infrastructure.** Supabase Postgres (with its connection pooler) is already the app's data store. Upstash would add a second service and two env vars to Vercel.
- **Fast enough.** A single indexed query per check; the viewer read endpoint scans at most 300 rows per check. Sub-millisecond with the index on a warm table.
- **Consistent across serverless containers.** On Vercel, every function instance shares the same database, so cold starts and container parallelism do not weaken the limit (the failure mode of an in-memory counter).

**Local dev:** `supabase db reset` applies the migration, so local dev and integration tests exercise the real Postgres-backed limiter with no extra setup. A pure in-memory fallback exists only for when `DATABASE_URL` is entirely absent (e.g. running tests without a database).

**IP extraction:** `x-forwarded-for` (first entry), falling back to `x-real-ip`, then `"unknown"`.

**Response:** 429 JSON with `{ ok: false, error: "..." }` and `Retry-After: 60` for GET endpoints. The join POST returns a redirect to `/viewer?error=...` (browser form UX).
