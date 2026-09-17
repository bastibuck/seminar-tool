# Making Vercel Preview deployments work with a working env set and isolated data

**Date:** 2026-09-16
**Scope:** Researched against primary sources — vercel.com/docs (fetched 2026-09-16), nextjs.org/docs (v16.3.5), supabase.com/docs and the `t3-oss/t3-env` GitHub repo — for the question: how should this repo's six required environment variables be provided to Vercel Preview deployments without overlapping or interfering with production Supabase data and the prod cron job? Tailored to seminar-tool's fail-fast env design.

---

## Repo context

seminar-tool reads all configuration through `lib/env.ts`, a zod-validated `@t3-oss/env-nextjs` module with **no code-side defaults** — all six variables must be present or the first import throws. `next.config.ts` imports `./lib/env` (line 3), so `next build` fails fast when any variable is missing. See [`lib/env.ts`](../../lib/env.ts), [`next.config.ts`](../../next.config.ts), [`.env.example`](../../.env.example), [`docs/adr/0010-t3-env-for-environment-configuration.md`](../adr/0010-t3-env-for-environment-configuration.md), and the [README](../../README.md).

The six variables split into server-only secrets (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `MUTATIONS_ENABLED`) and two build-inlined public values (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Because `MUTATIONS_ENABLED` is fail-closed (any value other than the literal `"true"`/`"false"` fails validation; non-`true` makes mutation routes return 503) and `CRON_SECRET` authorizes the nightly Vercel Cron cleanup, every environment — including previews — needs a full, self-consistent set.

---

## 1. How Vercel environment variables work

### Scopes: Production / Preview / Development on one project
"Environment variables are key-value pairs configured outside your source code so that each value can change depending on the Environment." For each variable you select one or more target environments — **Production**, **Preview**, or **Development** — and the value for that target is what deployments in it receive. Each environment can define its own values (e.g. "database connection information or API keys"). — [Vercel docs: Environment variables](https://vercel.com/docs/environment-variables) (fetched 2026-09-16).

- **Production** applies to deployments from the Production Branch (usually `main`) and `vercel --prod`. — [Vercel docs: Environments](https://vercel.com/docs/deployments/environments) (fetched 2026-09-16).
- **Preview** applies to "deployments from any Git branch that does not match the Production Branch". You can scope a preview variable to *all* non-production branches or to a **specific branch**; "any branch-specific variables will override other preview environment variables with the same name", so you only add the values that differ (branch-scoped overrides need Vercel CLI ≥ 22). — [Vercel docs: Environment variables → Preview](https://vercel.com/docs/environment-variables).
- **Development** applies only to local `vercel dev` and `vercel env pull`. — [Vercel docs: Environments → Local Development](https://vercel.com/docs/deployments/environments).

Variables are set at team or project level (team-level values are shared across the team's projects). Dashboard: **Project → Settings → Environment Variables**, choosing the target scope for each. CLI: `vercel env add NAME <production|preview|development>`. **Any change only applies to new deployments**, never retroactively. — [Vercel docs: Managing/Environment variables](https://vercel.com/docs/environment-variables).

### NEXT_PUBLIC_* values are inlined at build time, per build
Next.js inlines `process.env.NEXT_PUBLIC_*` references into the client JS **at build time**, replacing them with the value from the environment that ran `next build`; "after being built, your app will no longer respond to changes to these environment variables". — [Next.js docs: environment variables](https://nextjs.org/docs/app/guides/environment-variables) (v16.3.5, fetched 2026-09-16). Vercel builds every deployment separately with the env scope of that target, so each Preview build embeds whatever `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` exist under the **Preview** scope at build time — i.e. per-target inlining works exactly because the scope gives each build its own value. The `@t3-oss/env-nextjs` wrapper relies on the same mechanism (client variables must be `NEXT_PUBLIC_`-prefixed and are manually destructured in `runtimeEnv` so they survive bundling) — [t3-env README](https://github.com/t3-oss/t3-env), [t3-env Next.js docs](https://env.t3.gg/docs/nextjs).

### System environment variables
Vercel also automatically populates `VERCEL_ENV` (value `production`|`preview`|`development`), `VERCEL_TARGET_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_ID`, git variables (`VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_PULL_REQUEST_ID`, …), and `VERCEL_GIT_PREVIOUS_SHA` (build-time only, exposed only when an Ignored Build Step is set). These are flags/flows, **not** empty credential slots — they must be enabled by ticking "Enable access to System Environment Variables" in the project's Environment Variables settings. There is **no** Vercel feature that auto-creates database credentials for previews; providing working Supabase values is the app's own job. — [Vercel docs: System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

---

## 2. Why previews fail today

This repo has production-scoped values only (`README → Production deployment → Production environment variables`, and `scripts/deploy-production.sh` Stage 9 writes all six with `vercel env add KEY production`). A preview deployment therefore builds with no `DATABASE_URL`, no Supabase keys, etc. `next.config.ts` imports `lib/env` at config load, so `next build` aborts on the first missing variable instead of deploying a half-configured site — the intended fail-fast signal from [ADR 0010](../adr/0010-t3-env-for-environment-configuration.md). So a **preview build cannot succeed until all six variables exist under the Preview scope** (or preview builds are skipped — see §7).

The options below differ in *where* those six values come from, and in whether previews touch production data.

---

## 3. Option A — Vercel-native targeting, same Supabase project (Preview scope → prod)

The minimal fix: set all six vars again under the **Preview** scope (dashboard or `vercel env add KEY preview`), pointing at the **existing production Supabase project** (pooled `DATABASE_URL`, prod URL/anon/service-role keys), plus a `CRON_SECRET` and `MUTATIONS_ENABLED=true`. Previews would then build and run.

This makes preview deployments **overlap production data**, which is exactly what the project wants to avoid: previews would read/write the same Project URL, same Realtime/Broadcast channels, same Storage bucket, and — with `MUTATIONS_ENABLED=true` — mutate real production rows. Vercel gives no data isolation here; the environment is just a build/config bucket. — [Vercel docs: Environments](https://vercel.com/docs/deployments/environments). **Not recommended** unless preview data overlap is explicitly acceptable.

Per-branch overrides (Vercel CLI ≥ 22, [Preview env vars](https://vercel.com/docs/environment-variables)) let you point *one* branch at other values, but every other preview branch still hits production.

---

## 4. Option B — Separate Supabase project for previews ("staging" database)

Give previews their own Supabase project and point the six variables (under **Preview** scope) at it, while Production scope keeps the current project. Two physically distinct backend stacks; no shared data plane at all.

**What it entails**
- **Second project:** create a new Supabase project (staging/preview). Supabase's plan structure is per-organization: the **Free** plan includes **two projects** (500 MB each, paused after a week of inactivity) — "You can create two projects, one for development and one for production — the Free Plan includes two free projects"; **Pro** ($25/mo) has no project cap, no pausing, 8 GB. — [supabase.com/pricing](https://supabase.com/pricing).
- **Schema:** the same `supabase/migrations/` reach the staging project via `supabase link --project-ref <ref>` + `supabase db push` (or the SQL Editor) — exactly the prod path documented in [`scripts/deploy-production.sh`](../../scripts/deploy-production.sh) Stage 4 and the [README](../../README.md). `seed.sql` is dev/test-only by design; for preview demos you can seed the staging DB manually or via the admin UI.
- **Var mapping — same six names, new values** (this is the whole point of keeping names fixed):
  - `DATABASE_URL` → staging project's **pooled** connection string (host `*.pooler.supabase.com`, port 6543) — production requires pooling from Vercel Functions (see README troubleshooting), and previews have the same constraint.
  - `NEXT_PUBLIC_SUPABASE_URL` → `https://<staging-ref>.supabase.co` (root URL; `lib/env.ts` rejects `/rest/v1` suffixes).
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` → the staging project's publishable/anon and secret keys.
  - `CRON_SECRET` → a distinct value. Vercel Cron fires an HTTP GET only against the **production deployment** URL (`https://*.vercel.app/api/...`) — [Vercel docs: Cron Jobs](https://vercel.com/docs/cron-jobs) — so previews never receive cron invocations; a Preview `CRON_SECRET` just satisfies fail-fast validation.
  - `MUTATIONS_ENABLED` → `true` is safe here because mutations land in the staging DB, not production.
- **NEXT_PUBLIC inlining:** automatic — every preview build is a separate `next build` with the Preview scope (see §1), so the staging project's URL/anon key get inlined per preview. The **branch-scoped** preview override ([Preview env vars](https://vercel.com/docs/environment-variables)) can selectively point at yet another project for a specific branch.

**Overlap risk:** previews share the single staging database with each other (two open previews interleave data in *staging*), but never touch production. Risk is limited to config mistakes (a Preview var accidentally re-pointed at prod, or a wrongly scoped `vercel env add`), which is cheap to check because the two scopes show side by side in the dashboard.

**Concrete wiring (mirrors the wizard already used for production):** capture the staging project's values, then

```bash
vercel env add DATABASE_URL preview                 # staging pooled URI (host *.pooler.supabase.com:6543)
vercel env add NEXT_PUBLIC_SUPABASE_URL preview     # https://<staging-ref>.supabase.co
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
vercel env add SUPABASE_SERVICE_ROLE_KEY preview
vercel env add CRON_SECRET preview                  # distinct value from prod
vercel env add MUTATIONS_ENABLED preview            # true (mutations land in staging, not prod)
```

The `preview` target is the documented CLI scope name ([Environment variables](https://vercel.com/docs/environment-variables), and the production wizard already uses the identical `vercel env add KEY production` pattern — [scripts/deploy-production.sh](../../scripts/deploy-production.sh) Stage 9). Because each new deployment re-reads these scopes, a subsequent push to any non-`main` branch builds against the staging project.

---

## 5. Option C — Supabase Database Branching (branch-per-preview) + Vercel integration

The canonical per-PR isolation answer: a dedicated preview database *per pull request*, wired to Vercel preview deployments.

**How it works**
- "Supabase branches create separate environments that spin off from your main project." **Preview branches** are ephemeral — "automatically deleted when a PR is merged or closed"; **persistent branches** (staging/QA) live on. — [Supabase docs: Branching](https://supabase.com/docs/guides/platform/branching).
- Branches are created via the **GitHub integration**: enable "Automatic branching" and every new GitHub branch (or only branches touching `supabase/` files, via "Supabase changes only") gets a corresponding Supabase branch. The branch's database is **built from the migrations in your repo**, not cloned — branches are "data-less by default" to protect production data, with optional seeding via `seed.sql`. A comment with deploy status appears on the PR. — [Supabase docs: Branching GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration).
- On merge, with "Deploy to production" enabled, new migrations are applied to the production project. — [Supabase docs: Branching GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration).

**Vercel integration (documented):** "Install the Vercel integration" (Vercel marketplace), which also needs the Vercel GitHub integration and a connected Supabase project. Then "Supabase automatically updates your Vercel project with the correct environment variables for the corresponding preview branches. The synchronization happens at the time of Pull Request being opened, not at the time of branch creation." Because the sync rides on Vercel Preview Deployments, **race conditions** are possible, and "Supabase is always automatically re-deploying the most recent deployment of the given pull request" to correct them. — [Supabase docs: Branching → Integrations → Vercel](https://supabase.com/docs/guides/deployment/branching/integrations).

**Plan & cost:** Branching is **not on Free** — the pricing table lists it under "Feature comparison": Free = *Not included*; Pro/Team = **$0.01344 per branch, per hour**; the pricing FAQ echoes "available on the Pro Plan and above". — [supabase.com/pricing](https://supabase.com/pricing).
- "There is no fixed fee for a Preview branch. You only pay for the usage it incurs. A branch running on the default Micro Compute size starts at $0.01344 per hour." Branch compute is charged as "Branching Compute Hours" on your invoice. — [Supabase docs: Manage Branching usage](https://supabase.com/docs/guides/platform/manage-your-usage/branching).
- **Cost control caveat:** "Usage by Preview branches counts toward your subscription plan's quota. Branches are **not** covered by the Spend Cap", and "Compute Credits do not apply to Branching Compute." — [Manage Branching usage](https://supabase.com/docs/guides/platform/manage-your-usage/branching). A branch that outlives its PR keeps billing until deleted.

**Limitations relevant to this repo:**
- Requires the Pro plan (or Team), plus the per-branch hourly meter that the Spend Cap and Compute Credits do not cover (see above).
- The synchronization timing note (env vars arrive "at the time of Pull Request being opened") plus the auto-re-deploy means the *first* preview build that races the sync can be wrong — that's why Supabase re-deploys. Supabase's own integration then overwrites your Preview-scope vars per branch.
- **Which env var names it writes (verified vs unverified):** the Supabase Vercel marketplace integration's full installed set is enumerated on the Vercel marketplace page as: `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` — [Vercel marketplace: Supabase](https://vercel.com/marketplace/supabase/supabase) (fetched 2026-09-16). This overlaps this repo's six exactly once: only `NEXT_PUBLIC_SUPABASE_URL` has a matching name. `DATABASE_URL` (vs `POSTGRES_URL`), `SUPABASE_SERVICE_ROLE_KEY` (vs `SUPABASE_SECRET_KEY`), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (vs `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), `CRON_SECRET`, and `MUTATIONS_ENABLED` do not exist in the set. What the *branching* integration specifically injects per preview branch is **not enumerated in the current primary docs** — the branching → Vercel integration page only states "Supabase automatically updates your Vercel project with the correct environment variables for the corresponding preview branches" (it lists the sync timing and race-condition + auto-redeploy behavior, not the names) — [Supabase docs: Branching → Integrations → Vercel](https://supabase.com/docs/guides/deployment/branching/integrations) (fetched 2026-09-16). So before relying on auto-sync, confirm the actual injected names against this repo's key set (on a live project or via the Supabase integration), and meanwhile either alias the integration's names in `lib/env.ts` or fill `DATABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`CRON_SECRET`/`MUTATIONS_ENABLED` in the Preview scope by hand. Do not deploy this repo against branching until that mapping is confirmed.
- Note (observed, not in the fetched docs): the Vercel integration only syncs at PR-open; persistent-branch setups have been a source of mismatch — Supabase's troubleshooting page for the Vercel integration explains environment mapping (Production/preview/Development) and how to set up a dedicated staging *environment* instead — [Supabase docs: Vercel Integration env vars troubleshooting](https://supabase.com/docs/guides/troubleshooting/vercel-integration-environment-variables-not-syncing-for-persistent-git-branches-b9191e).

---

## 6. Option D — PR workflow with Vercel CLI (`vercel pull`) and Git-connected previews

With the GitHub integration, Vercel automatically preview-deploys every branch push and every PR (per-PR comments with preview URLs; PRs from forks require authorization), and the Production Branch (default `main`) is the single production source. — [Vercel docs: Deploying Git Repositories](https://vercel.com/docs/git), [Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github).

`vercel pull` fetches current **Environment Variables and Project Settings** into `.vercel/.env.<target>.local` for offline `vercel build`/`vercel dev` work; target is chosen with `--environment=production|preview|development` (and `--git-branch=` for branch-specific preview values). "If you aren't using those commands, you don't need to run `vercel pull`." The documented GitHub Actions pattern is `vercel pull --yes --environment=preview`, then `vercel build`, then `vercel deploy --prebuilt`. — [Vercel docs: `vercel pull`](https://vercel.com/docs/cli/pull), [Vercel for GitHub → GitHub Actions](https://vercel.com/docs/git/vercel-for-github).

How env vars flow: they don't travel with the commit — each build reads them from the target's scope on Vercel (§1). `vercel pull` only *mirrors* that scope locally so a local build matches the remote target. This option doesn't add isolation by itself; it's a *mechanism* (useful for reproducing preview builds locally, and for teams that deploy from CI rather than the native GitHub integration). Combine with Option B or C if isolation is needed.

---

## 7. Option E — Fallbacks: don't build previews at all (Ignore Build Step)

The **Ignored Build Step** (Project → Settings → Build and Deployment) runs a command during each build attempt; **exit code 1 → build proceeds, exit code 0 → build aborted and the deployment is set to `CANCELED`**. Presets include **"Only build production"**, "Only build preview", "Only build if there are changes (in a folder)", and **"Don't build anything"**; or provide a custom command / `vercel.json` `ignoreCommand` that overrides the dashboard setting. The command runs in the Root Directory with access to all System Environment Variables (so you can branch on `VERCEL_ENV`). — [Vercel docs: Project settings → Ignored Build Step](https://vercel.com/docs/project-configuration/project-settings), [`vercel.json` → `ignoreCommand`](https://vercel.com/docs/project-configuration/vercel-json).

Consequences for this repo:
- With "Only build production" (or "Don't build anything"), **preview builds never run `next build`**, so the missing Preview-scope vars never trigger the fail-fast `lib/env` validation (§2) — the six-variable requirement stops applying to previews entirely.
- Canceled builds are **counted as full deployments** against the Hobby deployment quota and occupy a concurrent-build slot, so you trade build failures for quota usage instead. — [Vercel docs: Project settings](https://vercel.com/docs/project-configuration/project-settings).
- Simplest, zero-data-risk posture for teams that don't want live previews: skip them and rely on `npm test` + local builds for verification.

---

## 8. Comparison at a glance

| Option | Previews build? | Isolates from prod data? | Per-PR isolation? | Cost/plan | Effort |
|---|---|---|---|---|---|
| **A.** Preview scope → prod project | Yes | **No** (shared prod DB/Realtime/Storage) | No | Free/Hobby | Minimal (re-add 6 vars to Preview scope) |
| **B.** Second Supabase project, Preview scope | Yes | **Yes** (separate project; previews share one staging DB) | No (shared staging) | Free tier includes a 2nd project; no per-branch charge | Low — new project + `db push` + 6 Preview-scoped vars |
| **C.** Supabase Database Branching + Vercel integration | Yes | Yes | **Yes** (branch deleted on PR merge/close) | Pro ($25/mo) + $0.01344/branch/hour | Medium — needs Pro, GitHub integration, env-var-name verification (§5) |
| **D.** `vercel pull` / GitHub-Actions previews | Yes (when invoked) | Per whatever env scope you feed it | Only if combined with B/C | Free/Hobby | Mechanism, not isolation |
| **E.** Ignore Build Step ("Only build production") | **No** (previews canceled) | N/A (nothing runs) | N/A | Free/Hobby; canceled builds hit the deployment quota | Trivial (one project setting or `vercel.json` `ignoreCommand`) |

---

## Recommendation (tailored to seminar-tool)

Given a single production Supabase project, a fail-fast six-variable env schema, a prod-only Vercel Cron, and `MUTATIONS_ENABLED` as a deployment-time safety lock:

1. **Default: Option B — a second, isolated "staging" Supabase project, six variables under Vercel's Preview scope.** This is the option with the **least overlap risk for the least machinery**, and the only one that works on the current Free tier (two projects included per the [pricing page](https://supabase.com/pricing)). Previews get a physically separate Postgres, Realtime, Auth, and Storage — anything a preview writes is impossible for production to see, and vice versa. Migrations reach it with the same `supabase db push` flow already in [`scripts/deploy-production.sh`](../../scripts/deploy-production.sh); the six names stay identical so `lib/env.ts` needs no changes, and `NEXT_PUBLIC_*` inlining is automatic per-build (§1). Path of least resistance: extend the deploy wizard with a second "Configure preview (staging) environment" stage that captures the staging project's pooled `DATABASE_URL`, root URL, publishable/anon + service-role keys, a distinct `CRON_SECRET`, and `MUTATIONS_ENABLED=true`, then writes them with `vercel env add KEY preview` (preserving the existing `production` scope untouched).
2. **Caveat to state explicitly:** multiple simultaneous previews share the staging DB with each other. Acceptable for this project's demo workflow; if true **per-PR** isolation is later wanted, **Option C — Supabase Branching is a valid, documented, primary-source-confirmed option** (Pro plan and above, $0.01344/branch/hour, preview branches auto-deleted on PR merge/close, data-less by default so they never carry prod rows, env sync + auto-redeploy handled by the documented Vercel integration — §5). The only reason it isn't the default recommendation is cost (Pro plan + unbilled-by-spend-cap branch meter) and the **one verified gap**: the integration's env-var set overlaps this repo's six names only at `NEXT_PUBLIC_SUPABASE_URL` (§5), so you must confirm exactly what branching injects and alias/remap `lib/env.ts` or hand-fill the other five names before the fail-fast build will pass.
3. **If live previews simply aren't needed:** set the Ignored Build Step to **"Only build production"** (Option E). Preview commits become `CANCELED` instead of failing with missing-env errors; they count against the deployment quota but never touch production. This is the zero-effort fallback until Option B is configured.
4. **Never** choose Option A (preview scope → production project) with `MUTATIONS_ENABLED=true`: it builds fine but makes previews read/write and broadcast against live production data, which is precisely the failure mode this investigation is avoiding.

The concrete signals that the chosen setup is working: a preview build passes `lib/env` validation, its browser bundle embeds the staging project's URL (check the built page's websocket to `wss://<staging-ref>.supabase.co`), and production logs/rows are untouched while previews are exercised.