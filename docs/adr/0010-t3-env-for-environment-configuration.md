# T3 env for environment configuration

Environment access is centralized in a single zod-validated, type-safe module (`lib/env.ts`) built on `@t3-oss/env-nextjs`, replacing the scattered `process.env` reads that previously lived in `lib/supabase-config.ts`, `lib/db.ts`, `lib/mutation-safety.ts`, and the finding-image-cleanup route.

Previously each variable was read directly where used, with ad-hoc local fallbacks and checks: a hardcoded localhost default for `NEXT_PUBLIC_SUPABASE_URL`, a silent `=== "true"` string comparison for `MUTATIONS_ENABLED`, and per-file throw-on-missing errors. Behavior was lenient — a missing or misspelled variable degraded silently.

**The schema has no defaults.** All six variables are required:

- `client`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `server`: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `MUTATIONS_ENABLED`

Missing, empty, or (for `MUTATIONS_ENABLED`) anything other than the exact lowercase `"true"`/`"false"` throws at first import. Local-dev values belong in `.env.example` and `.env.local`, never in the schema — a fallback default in code would hide the exact fail-fast signal the module exists to produce. This includes `CRON_SECRET`, which is now hard-required and assigned a locally-generated value in `.env.local`; before, its absence only made the cleanup route return 401 in dev.

The env module is imported by `next.config.ts` so `next build` fails fast on a missing variable instead of some route 500ing later. `NODE_ENV` and the test harness (`vitest.config.ts`, `tests/setup/*`, `tests/support/*`) intentionally keep reading `process.env` directly — they are build/plumbing concerns, not product runtime.

**Why strict instead of lenient:** catching a misspelled `MUTATIONS_ENABLED` or a dropped `CRON_SECRET` at build/import time is cheaper than discovering it as silent misbehavior in production. The old loose-parsing test (`"1"`, `"TRUE"`, `" true"` all resolve to false) encoded the exact failure mode this change eliminates.

**Why `@t3-oss/env-nextjs` over hand-rolled validation:** the Next-aware wrapper handles the client/server split — `NEXT_PUBLIC_`-prefixed vars validated on the client and statically inlined, server-only secrets validated only on the server — and enforces the `NEXT_PUBLIC_` prefix rule. A hand-rolled reader would reimplement the same graph without the ecosystem support.