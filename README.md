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

The Supabase client reads two vars. Copy `.env.example` to `.env.local` (already gitignored) and fill them in. The anon key is a **publishable** key — public by design when paired with RLS — so it is safe in the browser bundle, but it is **environment-specific**:

- **Local stack:** run `supabase status`; use the anon key it prints (a JWT beginning `eyJ...`).
- **Hosted project:** Supabase Dashboard → Project Settings → API Keys (the `sb_publishable_...` or legacy anon key).

`NEXT_PUBLIC_SUPABASE_URL` defaults to the local stack (`http://127.0.0.1:54321`) when unset, so only the anon key strictly needs setting. If it is missing, the app fails loudly instead of falling back to a hardcoded key. Realtime integration tests read the same vars, so set them before running `npm test`.

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

Schema lives in version-controlled migrations under `supabase/migrations/`; the app connects directly to Postgres via `DATABASE_URL` (default: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, overridable in `.env.local`).
