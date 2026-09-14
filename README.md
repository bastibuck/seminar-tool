# Seminar Tool

A live-teaching companion for medical roleplay workshops: doctors steer a patient case live from the cockpit, releasing findings to students who work through the case in the seminar room.

See [CONTEXT.md](CONTEXT.md) for domain vocabulary and [docs/adr/](docs/adr/) for architecture decisions.

## Requirements

- Node.js (via [Volta](https://volta.sh) or ≥ 24)
- Docker Desktop (running)
- npm

## Setup

```sh
npm install          # install dependencies (includes the Supabase CLI)
npm run db:start     # start the local Supabase stack (Postgres on :54322)
npm run dev          # start the app at http://localhost:3000
```

### Environment variables

All environment variables are read through `lib/env.ts`, a single zod-validated, type-safe module that fails fast when configuration is missing or malformed. None of the six variables has a code-side default: copy `.env.example` to `.env.local` (already gitignored) and fill in real values, or the app refuses to start.

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are read by the Supabase client. The anon key is a **publishable** key — public by design when paired with RLS — so it is safe in the browser bundle, but it is **environment-specific**:

  - **Local stack:** run `supabase status`; use the anon key it prints (a JWT beginning `eyJ...`).
  - **Hosted project:** Supabase Dashboard → Project Settings → API Keys (the `sb_publishable_...` or legacy anon key).

  It must be the project **root** URL (e.g. `https://<ref>.supabase.co`, locally `http://127.0.0.1:54321`) — never the Data API URL with a `/rest/v1` suffix. The Supabase client builds its REST, auth, storage **and Realtime websocket** endpoints on top of this value, so a `/rest/v1` suffix silently breaks the viewer's broadcast subscription (`CHANNEL_ERROR`, extraneous `/rest/v1/` in the websocket path). `lib/env.ts` now rejects such values at build time.

`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` are server-only secrets. `CRON_SECRET` authorizes the nightly finding-image cleanup endpoint; generate a local value with `openssl rand -base64 32`.

`MUTATIONS_ENABLED` is a fail-closed deployment safety lock for user-triggered writes and must be exactly `true` or `false` — any other value fails validation. Set it to `true` for local development or a demo deployment where writes are intentionally enabled, and to `false` in production to return `503 Service Unavailable` from mutation routes. Changing the Vercel environment variable requires a redeploy; this is not a runtime toggle. The integration test server sets it explicitly to `true`.

Realtime integration tests read the same vars, so set them before running `npm test`.

The home page is the cockpit start page: pick a Case Type (the database is seeded with an example, and admins can author more), name the Case, and you land on a private, unguessable cockpit URL showing the case name, the type's findings as a checklist (with their optional notes), and the short case code viewers will use to join. Each finding has a release toggle: releasing inserts a timestamped release record, un-releasing deletes it without a trace. When the roleplay is done, "Fall beenden" confirms and ends the case: the server rejects any further release or un-release, and viewers see a quiet "Fall beendet" banner while every released finding stays readable.

## Seeding

`supabase/seed.sql` ships one example Case Type ("Akuter Thoraxschmerz") with its findings. It runs automatically on `npm run db:reset` / `npm test` and is idempotent: re-running it never duplicates rows. Edits to already-seeded content only take effect after `npm run db:reset`.

## Testing

```sh
npm test
```

One command runs the whole verification: it starts the Supabase stack if needed, resets the database (applying all migrations), builds the app, boots the production server, and runs the integration tests as plain HTTP requests against it (`tests/integration/`). This is the harness pattern all feature tickets copy: assert external behavior at the HTTP seam, never internals.

Useful extras:

- `npm run typecheck` — TypeScript, no emit
- `npx vitest run tests/integration/create-case.test.ts` — a single integration test file against an already-prepared stack
- `npx vitest run tests/unit/case-code.test.ts` — pure unit tests (no database or server needed)
- `npm run db:reset` — re-apply migrations from scratch
- `npm run db:stop` — stop the Supabase stack

## Database

Schema lives in version-controlled migrations under `supabase/migrations/`; the app connects directly to Postgres via the required `DATABASE_URL`. For local development, set it in `.env.local` to the connection details for the Supabase stack started by `npm run db:start` (normally `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

## Production deployment

### Quick start

Run the interactive deployment wizard:

```sh
bash scripts/deploy-production.sh
```

The wizard walks through every step: creating the Supabase project, applying migrations, configuring Vercel, setting environment variables, and running the smoke test. It stages captured values in a gitignored `.env.deploy` file (never loaded by Next.js and independent of your local `.env.local`), and can be re-run if interrupted.

### Deployment path (merge to production)

1. Merge to `main` — Vercel auto-deploys if the GitHub integration is linked.
2. Apply any new migrations to the production database (`npx supabase db push` or SQL Editor).
3. Verify Vercel Cron jobs in the dashboard (Settings → Cron Jobs).
4. Create or update Case Types and Findings via the admin interface (`/admin`).
5. Run the smoke test checklist.

### Production environment variables

All six variables from `.env.example` are required in Vercel (Settings → Environment Variables, scope: Production):

| Variable | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase Dashboard → Settings → Database → **Pooler** URI | Must use the pooled connection string, not the direct connection — the app runs in concurrent serverless functions |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → Project API keys → anon / publishable | Publishable by design when paired with RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → Project API keys → service_role (secret) | Server-only; used for Storage operations and Broadcast |
| `CRON_SECRET` | Generate with `openssl rand -base64 32` | Authorizes the nightly Vercel Cron cleanup endpoint |
| `MUTATIONS_ENABLED` | Set to `true` | Fail-closed safety lock; `false` returns 503 on all write routes. Changing requires a redeploy |

### Production database

- **Migrations:** All files in `supabase/migrations/` must be applied. Use `npx supabase db push` (after linking) or paste each file into the SQL Editor in order.
- **Seed:** `supabase/seed.sql` is **not** run against production. It is for local development and integration tests only. Production Case Types and Findings are created through the admin interface at `/admin`.
- **pg_cron:** The migrations install two scheduled jobs:
  - `delete-expired-cases` — daily at 03:00 UTC, deletes ended Cases (>24h) and inactive Cases (>72h)
  - `purge-rate-limits` — every 10 minutes, cleans up stale rate limit rows
  - Verify both in Dashboard → Database → Cron Jobs after applying migrations.

### Production storage

The `finding-images` bucket is created by migration `20260904000001_finding_images.sql` with:

- **Visibility:** Private (signed URLs required)
- **File size limit:** 10 MB
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`

Verify the bucket exists in Dashboard → Storage after applying migrations.

### Vercel Cron

The nightly finding-image cleanup is configured in `vercel.json` and registered automatically when the project is linked. Verify in Dashboard → Settings → Cron Jobs:

- **Path:** `/api/internal/finding-image-cleanup`
- **Schedule:** `0 3 * * *` (daily at 03:00 UTC)
- **Auth:** The endpoint requires `Authorization: Bearer <CRON_SECRET>` — Vercel injects this automatically

### Smoke test checklist

After deploying, verify:

- [ ] Cockpit creates a Case and shows the private cockpit URL
- [ ] Viewer joins with case code and sees hidden findings
- [ ] Releasing a Finding makes it visible to the Viewer in real time
- [ ] Finding images load via signed URLs and support zoom/pan
- [ ] Un-releasing a Finding hides it from the Viewer
- [ ] Ending a Case shows the "Fall beendet" banner to the Viewer
- [ ] Released findings remain readable after the Case ends
- [ ] `/api/internal/finding-image-cleanup` returns 401 without the auth header
- [ ] Local development still works (`npm run db:start && npm run dev`)

### Troubleshooting

**App refuses to start / env validation fails:**
All six variables must be set. Check Vercel → Settings → Environment Variables. Changing a variable requires a redeploy.

**Pages fail with `getaddrinfo ENOTFOUND db.<ref>.supabase.co`:**
`DATABASE_URL` uses the direct connection hostname, which does not resolve from Vercel functions. Replace it with the **pooled** connection string: Supabase Dashboard → Settings → Database → Connection string → URI (Transaction/Pooler tab, host `.pooler.supabase.com`, port `6543`), then redeploy. The deployment wizard validates this at capture time.

**Viewer never updates in real time (no broadcasts on the live app):**
Check `NEXT_PUBLIC_SUPABASE_URL` in Vercel. It must be the project **root** URL (`https://<ref>.supabase.co`), not the Data API URL shown on the Supabase "API" page (`https://<ref>.supabase.co/rest/v1`) which is a common copy-paste mistake. Both the browser viewer and the server-side publisher (`lib/broadcast.ts`) build their websocket endpoint from this value, so a `/rest/v1` suffix breaks Realtime entirely while HTTP still works — the symptom is a clipboard/app that only updates on page reload. `lib/env.ts` now rejects the bad value at build time; fix the variable and redeploy.

**Migrations fail with "pg_cron already exists":**
The `create extension if not exists pg_cron` in migration `20260904000000` is idempotent. If pg_cron is already installed (e.g. Supabase enables it by default), the migration continues.

**Finding images return 403:**
Ensure `SUPABASE_SERVICE_ROLE_KEY` is set correctly. The service role key is used to mint signed URLs for the private `finding-images` bucket.

**Vercel Cron returns 401:**
Ensure `CRON_SECRET` is set in Vercel and matches the value staged in `.env.deploy` (or the value the deployment wizard displayed).

## Nightly cleanup

Both cleanup jobs run daily at 03:00:

- Supabase `pg_cron` deletes expired Cases from the database. Ended Cases expire after 24 hours; active Cases expire after 72 hours without Case Activity.
- Vercel Cron runs `/api/internal/finding-image-cleanup` to remove obsolete, unreferenced Finding images from Supabase Storage. The endpoint requires the `CRON_SECRET` environment variable.

The two jobs have separate responsibilities: database cleanup stays in `pg_cron`, while Storage cleanup runs through the application because it needs the Supabase Storage API.
