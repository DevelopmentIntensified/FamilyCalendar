# Ledger

The rewrite's task list, in execution order. Work the first row whose status is `doing`, else the first `todo` ([start here](README.md)).

Statuses:

- `todo`: not started.
- `doing`: in progress. Set it when you start, so a new session resumes the same task.
- `blocked`: waiting on a question in [questions.md](questions.md). The note names the question.
- `done`: the commit column holds the sha.

Steps inside a module task (S1–S9) are ticked in that module's port sheet. Here you only track the whole task. Live progress per module: `npm run census`.

| id | task | playbook | sheet | status | commit | notes |
|---|---|---|---|---|---|---|
| K-01 | Kernel core: ctx/actor, AppError, validators, clock, ids, rate limiter, json log, db helpers, `endpoint`/`pageLoad`/`formAction`, test harness (testCtx, invoke, rollback DB rebuilt from migrations) | — | [kernel](modules/kernel.md) | done | 75066d6 | 74 tests; the golden approach was verified against legacy handlers |
| K-02 | Composition root `src/lib/app/appCtx.server.ts`; hooks set `locals.ctx` / `locals.actor` | — | [app](modules/app.md) | done | 75066d6 | Bridges listed in appCtx |
| K-03 | Tooling: `arch`, `census`, `docs:check`, `docs:gen`, `test:mod`, `test:affected`, `typecheck`, `new:module`, `build:safe`, `gate` | — | [kernel](modules/kernel.md) | done | 75066d6 | typecheck baseline: 89 legacy errors; gate measured at ~3 min (typecheck ~40 s, test:v2 ~8 s, test:affected ~22 s, build:safe ~72 s) |
| K-04 | Split `schema.ts` into `kernel/db/tables/<module>.tables.server.ts` | [kernel-tasks › K-04](playbooks/kernel-tasks.md#k-04) | [kernel](modules/kernel.md) | done | 1c2d294 | 44 tables verbatim, schema diff NO DRIFT; `schema.ts` keeps 33 compat type aliases until the modules port |
| K-05 | Migration runner + bundle into `kernel/db/migrations` | [kernel-tasks › K-05](playbooks/kernel-tasks.md#k-05) | [kernel](modules/kernel.md) | done | 25e0307 | stray `0001_add_password_hash.sql` deleted; unused `getLastMigrationRun()` removed; Vercel preview check pending [Q-004](questions.md) |
| K-06 | `kernel/time` dates: formats, day keys, month math | [kernel-tasks › K-06](playbooks/kernel-tasks.md#k-06) | [kernel](modules/kernel.md) | done | ba4ecdf | 13 functions, 96 hand-worked cases (DST, leap years, UTC+14); legacy callers switch at their module's port |
| K-07 | `kernel/client`: api client, toasts, localPref, searchBox, ticker, share, offline | [kernel-tasks › K-07](playbooks/kernel-tasks.md#k-07) | [kernel](modules/kernel.md) | done | 5192237 | toasts carry actions; searchBox has `failed`/`searchedFor`; `Ticker` and `Scheduler` live in kernel/time; R8 ignores imports of kernel/client, kernel/ui and kernel/time |
| K-08 | `kernel/ui`: Sheet, ConfirmAction, Pill, Skeleton, Toaster, BrandMark, DayNav, MentionInput, colorHash | [kernel-tasks › K-08](playbooks/kernel-tasks.md#k-08) | [kernel](modules/kernel.md) | done | 599779d | K-08a `4e37cd7` and K-08b `b16ff32` merged; Opus fix-forward B (kernel/ui) merged |
| K-09 | Test speed: fast committed-mode reset, `synchronous_commit=off` on the v2 test DB | [kernel-tasks › K-09](playbooks/kernel-tasks.md#k-09) | [kernel](modules/kernel.md) | done | 3e24dda | reset median 70–110 ms on a saturated machine (TRUNCATE took 10–12 s there); bound 250 ms |
| K-10 | Page harness (after K-05): shared page catalog, seeded users, session login, local build + preview on its own database; `visual:baseline` / `visual:check` per module (390 px + 1280 px) | [kernel-tasks › K-10](playbooks/kernel-tasks.md#k-10) | [kernel](modules/kernel.md) | doing | | merged `12f0a74` with the Opus fix-forward; the committed groceries baselines still show the offline banner: re-baseline with `--update-snapshots=all`, then done |
| K-11 | Perf harness (after K-10): `perf:check` per page (desktop + mobile profiles), legacy baseline report, budgets ([ADR 0010](../adr/0010-performance-budget.md)) | [kernel-tasks › K-11](playbooks/kernel-tasks.md#k-11) | [kernel](modules/kernel.md) | todo | | |
| K-12 | Golden ctx: `goldenCtx` (`src/lib/app/testing`) wires the real cross-module ports into `/api` goldens; R1 lets tests import `src/lib/app/testing`; every golden switches to it before its freeze | [kernel-tasks › K-12](playbooks/kernel-tasks.md#k-12) | [kernel](modules/kernel.md) | doing | | built on `rewrite/k12`; the golden sweep follows once the in-flight fix-forwards merge |
| M-feedback | Port **feedback**, the worked example. Also replaces the app faults bridge | [port-a-module](playbooks/port-a-module.md) | [feedback](modules/feedback.md) | doing | | S1+S2 merged; S2 sha `72d6395` (budget goldens share one ctx) |
| M-identity | Port **identity** | [port-a-module](playbooks/port-a-module.md) | [identity](modules/identity.md) | doing | | S1+S2 merged; S2 sha `4e6d125` |
| M-billing | Port **billing** | [port-a-module](playbooks/port-a-module.md) | [billing](modules/billing.md) | doing | | S1+S2 merged; S2 sha `a3dfdb0` |
| M-alerts | Port **alerts** (adds the `push` port) | [port-a-module](playbooks/port-a-module.md) | [alerts](modules/alerts.md) | doing | | S1+S2 merged; S2 sha `169ba91` |
| M-family | Port **family** (adds the `mail` port if invites need it first) | [port-a-module](playbooks/port-a-module.md) | [family](modules/family.md) | doing | | S1+S2 merged; S2 sha `72d6395` (budget goldens share one ctx) |
| M-dashboardModules | Port **dashboardModules** | [port-a-module](playbooks/port-a-module.md) | [dashboardModules](modules/dashboardModules.md) | doing | | S1+S2 merged; S2 sha `8779688` |
| M-bills | **bills**, delete-only ([Q-002](questions.md)): remove `parseBillQuickAdd`, the bill grammar and the bill category list; the tables stay in kernel (K-04) | [port-a-module › S8](playbooks/port-a-module.md#s8-rewire-delete-legacy) only | [bills](modules/bills.md) | todo | | |
| M-parsing | Port **parsing**, test-first (adds the `ai` port) | [port-a-module](playbooks/port-a-module.md) | [parsing](modules/parsing.md) | doing | | S1+S2 merged with the Opus fix-forward; S2 sha `8ecff4e`; owner questions Q-008…Q-013 |
| M-verse | **verse**, delete-only (owner, Q-031/Q-032 in [questions](questions.md)): remove `/api/daily-verse`, `dailyVerse` on `/api/dashboard`, `verseTranslation`/`verseTranslations` on `/api/me/settings`, the verse card, the translation picker and the bundled text; keep the `verse_translation` column | [port-a-module › S8](playbooks/port-a-module.md#s8-rewire-delete-legacy) only | [verse](modules/verse.md) | todo | | S1+S2 (`2c2c797`) superseded by the delete decision; the identity and dayDashboard goldens change first |
| M-groceries | Port **groceries** | [port-a-module](playbooks/port-a-module.md) | [groceries](modules/groceries.md) | doing | | S1+S2 merged; S2 sha `ffe9c94` |
| M-meals | **meals**, delete-only ([Q-002](questions.md)): remove `/api/meals`, `MealsCard` and the meal queries; keep the `meals` table and the `meals` Dashboard Module id | [port-a-module › S8](playbooks/port-a-module.md#s8-rewire-delete-legacy) only | [meals](modules/meals.md) | done | (this commit) | Done inline by the orchestrator (trivial deletion); census 100%. |
| M-sponsored | Port **sponsored**; S8 also deletes the blob store and `@vercel/blob` ([Q-003](questions.md): delete) | [port-a-module](playbooks/port-a-module.md) | [sponsored](modules/sponsored.md) | doing | | S1+S2 merged; S2 sha `c37f078` |
| M-calendar | Port **calendar** | [port-a-module](playbooks/port-a-module.md) | [calendar](modules/calendar.md) | doing | | S1+S2 merged; S2 sha `54bc85b` (after the Opus fix-forward) |
| M-tasks | Port **tasks** | [port-a-module](playbooks/port-a-module.md) | [tasks](modules/tasks.md) | doing | | S1+S2 merged; S2 sha `7246883` (after the Opus fix-forward) |
| M-access | Port **access** | [port-a-module](playbooks/port-a-module.md) | [access](modules/access.md) | doing | | S1+S2 merged; S2 sha `8ab8ff7` |
| M-marketing | Port **marketing**; the waitlist leaves the website (owner, Q-070): page, form and pricing links go, the `waitlist` table stays | [port-a-module](playbooks/port-a-module.md) | [marketing](modules/marketing.md) | doing | | S1+S2 merged; S2 sha `c33c078` |
| S-shell | Port screen **shell** | [port-a-module](playbooks/port-a-module.md) | [shell](modules/shell.md) | doing | | S1 merged; no S2 (shell owns no `/api` route) |
| S-account | Port screen **account** | [port-a-module](playbooks/port-a-module.md) | [account](modules/account.md) | doing | | S1+S2 merged; S2 sha `299a5b1` |
| S-admin | Port screen **admin** | [port-a-module](playbooks/port-a-module.md) | [admin](modules/admin.md) | doing | | S1+S2 merged; S2 sha `95c9edb` |
| S-familyHub | Port screen **familyHub** | [port-a-module](playbooks/port-a-module.md) | [familyHub](modules/familyHub.md) | doing | | S1+S2 merged; S2 sha `c933b70` |
| S-dayDashboard | Port screen **dayDashboard** | [port-a-module](playbooks/port-a-module.md) | [dayDashboard](modules/dayDashboard.md) | doing | | S1+S2 merged; S2 sha `6e7ab08` |
| S-calendarPage | Port screen **calendarPage** | [port-a-module](playbooks/port-a-module.md) | [calendarPage](modules/calendarPage.md) | doing | | S1 merged; no S2 (calendarPage owns no `/api` route) |
| APP-01 | Cron cleanup + health into app | [app-tasks › APP-01](playbooks/app-tasks.md#app-01) | [app](modules/app.md) | todo | | |
| APP-02 | Limiter swap to the kernel memory limiter | [app-tasks › APP-02](playbooks/app-tasks.md#app-02) | [app](modules/app.md) | todo | | |
| APP-03 | Session pipeline into app; hooks become wiring | [app-tasks › APP-03](playbooks/app-tasks.md#app-03) | [app](modules/app.md) | todo | | |
| APP-04 | e2e fixtures on v2 modules; Playwright green | [app-tasks › APP-04](playbooks/app-tasks.md#app-04) | [app](modules/app.md) | todo | | |
| APP-05 | Delete legacy folders and legacy vitest projects | [app-tasks › APP-05](playbooks/app-tasks.md#app-05) | [app](modules/app.md) | todo | | |
| APP-06 | Docs pass | [app-tasks › APP-06](playbooks/app-tasks.md#app-06) | [app](modules/app.md) | todo | | |
| APP-07 | Cutover package for the owner (the owner merges) | [app-tasks › APP-07](playbooks/app-tasks.md#app-07) | [app](modules/app.md) | todo | | |

## Sync log

`SYNC yyyy-mm-dd` rows from [sync-with-test.md](playbooks/sync-with-test.md) go here, newest last.

| date | merge commit | re-applied changes |
|---|---|---|
