# 00 — Overview

Family calendar app (SvelteKit 2 + Svelte 5 + Drizzle/Postgres + Lucia sessions). Canonical language: `CONTEXT.md`.

## Stack

- App: SvelteKit 2.17.2, Svelte 5.20.1, Tailwind, Vite 6.1.0 (`package.json:48-116`, `svelte.config.js:1-20`, `tailwind.config.js` — primary ramp `DEFAULT #dd5822` vs marketing terracotta `#c45e38`, see #170).
- DB: Drizzle over `postgres` driver (`src/lib/server/db/index.ts:1-7`), Neon Lakebase Postgres in prod.
- Auth: Lucia sessions 90-day absolute, magic-link + password, anonymous guest accounts (claimable).
- Push: web-push VAPID (`src/lib/server/services/pushService.ts`). Email: Resend (`RESEND_API_KEY`, `NOREPLYEMAIL`).
- Native shell: Capacitor 7.0.1 via `scripts/build-capacitor.mjs` (advisory #157).

## Environments

- Local: Docker Postgres `:5433` (`db:up/down/reset/seed`, `.env.local`, `ADAPTER=node`).
- Preview: `test.familyplanz.com` ← branch `test` (`npm run deploy:test` → `vercel deploy --preview` + alias). Prod: `familyplanz.com` (`deploy:prod`).
- Neon project `hidden-resonance-16080139`: `main` = `br-holy-salad-a50xupa6`, `preview/test` = `br-misty-butterfly-a5mpnuxu` (`MEMORY.md:216-217`). Live probe 2026-10-15: main = 239 users (`docs/issues/144:32`).
- Build = `node scripts/publish-prototypes.mjs && vite build` (`package.json:8`). Prototypes publish to `/prototypes/...` on preview/local only, never production (`PUBLISH_PROTOTYPES` override).
- Cron: single weekly `GET /api/cron/cleanup` Mon 04:00 (`vercel.json:1-8`) — prunes stale anonymous (90d) + expired claim tokens only. Everything else unbounded → #029 M5.
- No CI gate: `.github/workflows/ci.yml` removed 2026-09-29. Local `build + test:unit + check + proto:check` is the gate. `ci:secrets*` scripts orphaned.

## Standing rules

- Caveman terse; correctness first; boring over clever (`AGENTS.md`).
- Push only to `test`; never push a broken build.
- Issue workflow: `docs/issues/NNN-slug.md`, `Status:` flips, `docs/STATUS.md` rollup mirrors.
- NLP changes MUST be test-driven with phrase tables.
- Irreversible DDL always asks the owner; genuine forks reported with options+costs, never decided alone.
- Bills `_attic/money/` archived 2026-09-25 — do not triage; meals parked — do not triage.
- Strict promotion gate (#143, confirmed 2026-10-15): nothing to `master` until the owner approves screenshots of every page and every finding is closed/waived.
