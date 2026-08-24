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

The home page is the cockpit start page: pick a seeded Case Type, name the Case, and you land on a private, unguessable cockpit URL showing the case name, the type's findings as a checklist (with their optional notes), and the short case code viewers will use to join.

## Seeding

`supabase/seed.sql` ships one example Case Type ("Akuter Thoraxschmerz") with its findings. It runs automatically on `npm run db:reset` / `npm test` and is idempotent: re-running it never duplicates rows.

## Testing

```sh
npm test
```

One command runs the whole verification: it starts the Supabase stack if needed, resets the database (applying all migrations), builds the app, boots the production server, and runs the integration tests as plain HTTP requests against it (`tests/integration/`). This is the harness pattern all feature tickets copy: assert external behavior at the HTTP seam, never internals.

Useful extras:

- `npm run typecheck` — TypeScript, no emit
- `npx vitest run tests/integration/create-case.test.ts` — a single integration test file against an already-prepared stack
- `npx vitest run tests/unit/short-code.test.ts` — pure unit tests (no database or server needed)
- `npm run db:reset` — re-apply migrations from scratch
- `npm run db:stop` — stop the Supabase stack

## Database

Schema lives in version-controlled migrations under `supabase/migrations/`; the app connects directly to Postgres via `DATABASE_URL` (default: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, overridable in `.env.local`).
