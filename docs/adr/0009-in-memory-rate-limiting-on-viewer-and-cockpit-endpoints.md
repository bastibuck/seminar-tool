# In-memory sliding-window rate limiting on viewer and cockpit endpoints

The viewer code join endpoint (`POST /api/viewer`), viewer read endpoint (`GET /api/viewer/:code`), and cockpit read endpoint (`GET /api/cases/:cockpitId`) are rate-limited per client IP using an in-memory sliding-window counter.

Viewer codes are 8 characters from a 30-character alphabet (~39.3 bits of entropy). Without throttling, an attacker can try codes far faster than their entropy justifies. Rate limiting makes brute-forcing impractical.

**Limits (per IP, per 60-second sliding window):**

| Endpoint | Max | Rationale |
|---|---|---|
| `POST /api/viewer` (join) | 30 | Primary guessing surface. 30/min accommodates several classrooms sharing one IP (each room joining once) while blocking automated bulk attempts. |
| `GET /api/viewer/:code` (read) | 300 | Legitimate refetch traffic: ~1s refetches on each release event across multiple rooms on a shared classroom network. 5 rooms × 5 viewers × 1 refetch/s = 300/min sustained. |
| `GET /api/cases/:cockpitId` (cockpit) | 120 | Doctor steering traffic: periodic polling plus release actions. Generous for normal use; blocks sustained automated reads. |

**Mechanism:** In-memory `Map` keyed by `${ip}:${pathname}`, with timestamps pruned on each check. Chosen over edge middleware or Vercel platform rate limiting because:
- Zero new dependencies (no `@vercel/kv`, no Redis).
- Works within the existing route-handler pattern — each endpoint adds a 5-line guard at the top.
- Trade-off: the counter resets on Vercel cold starts (~100ms gaps). For a seminar tool with low overall traffic, this is acceptable — cold-start windows are too short for meaningful brute-forcing, and legitimate traffic warms the instance quickly.

**IP extraction:** `x-forwarded-for` (first entry), falling back to `x-real-ip`, then `"unknown"`.

**Response:** 429 JSON with `{ ok: false, error: "..." }` and `Retry-After: 60` for GET endpoints. The join POST returns a redirect to `/viewer?error=...` (browser form UX).
