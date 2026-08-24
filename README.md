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

The home page performs a trivial read from the local database and shows the connection status.

## Testing

```sh
npm test
```

One command runs the whole verification: it starts the Supabase stack if needed, resets the database (applying all migrations), builds the app, boots the production server, and runs the integration tests as plain HTTP requests against it (`tests/integration/`). This is the harness pattern all feature tickets copy: assert external behavior at the HTTP seam, never internals.

Useful extras:

- `npm run typecheck` — TypeScript, no emit
- `npx vitest run tests/integration/app.test.ts` — a single test file against an already-prepared stack
- `npm run db:reset` — re-apply migrations from scratch
- `npm run db:stop` — stop the Supabase stack

## Database

Schema lives in version-controlled migrations under `supabase/migrations/`; the app connects directly to Postgres via `DATABASE_URL` (default: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, overridable in `.env.local`).
