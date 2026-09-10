# Upstash Redis rate limiting on viewer and cockpit endpoints

The viewer code join endpoint (`POST /api/viewer`), viewer read endpoint (`GET /api/viewer/:code`), and cockpit read endpoint (`GET /api/cases/:cockpitId`) are rate-limited per client IP using Upstash Redis-backed sliding-window counters.

Viewer codes are 8 characters from a 30-character alphabet (~39.3 bits of entropy). Without throttling, an attacker can try codes far faster than their entropy justifies. Rate limiting makes brute-forcing impractical.

**Limits (per IP, per 60-second sliding window):**

| Endpoint | Max | Rationale |
|---|---|---|
| `POST /api/viewer` (join) | 30 | Primary guessing surface. 30/min accommodates several classrooms sharing one IP (each room joining once) while blocking automated bulk attempts. |
| `GET /api/viewer/:code` (read) | 300 | Legitimate refetch traffic: ~1s refetches on each release event across multiple rooms on a shared classroom network. 5 rooms × 5 viewers × 1 refetch/s = 300/min sustained. |
| `GET /api/cases/:cockpitId` (cockpit) | 120 | Doctor steering traffic: periodic polling plus release actions. Generous for normal use; blocks sustained automated reads. |

**Mechanism:** `@upstash/ratelimit` with `Ratelimit.slidingWindow`, backed by Upstash Redis (`@upstash/redis`). Chosen because:
- **Consistent across Vercel serverless containers.** Each request hits the same Redis, so rate limits are enforced regardless of cold starts or container parallelism.
- **Zero infrastructure to manage.** Upstash is a managed Redis with a generous free tier (10,000 commands/day). No servers to provision or monitor.
- **Sliding window** provides smoother limiting than fixed windows, avoiding burst spikes at window boundaries.

**Local dev fallback:** When `UPSTASH_REDIS_REST_URL` is not set, the rate limiter falls back to an in-memory `Map`. This means local dev has no cross-container rate limiting, which is fine — local traffic is low and not attack-exposed. Tests use the same in-memory fallback.

**IP extraction:** `x-forwarded-for` (first entry), falling back to `x-real-ip`, then `"unknown"`.

**Response:** 429 JSON with `{ ok: false, error: "..." }` and `Retry-After: 60` for GET endpoints. The join POST returns a redirect to `/viewer?error=...` (browser form UX).

**Production setup required:** Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to Vercel environment variables (from the Upstash Console → Redis → REST API).
