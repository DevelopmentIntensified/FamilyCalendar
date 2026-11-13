# Testing

Tests sit at seams (public interfaces), so a change can be checked one section at a time. File names decide which vitest project runs a test, and projects decide the environment.

## Projects (vite.config.ts)

| file name | project | environment | has a database? |
|---|---|---|---|
| `src/lib/{kernel,domains,screens,app}/**/*.test.ts` | `unit` | node | no. `DATABASE_URL` points at a closed port, so a stray query fails fast |
| `…/**/*.db.test.ts` | `db` | node | yes: `familycalendar_v2_test` on the local Docker Postgres (or `familycalendar_v2_test_<id>` when `V2_TEST_DB` is set, one per parallel worktree), rebuilt from `sql/migrations` at the start of every run, one file at a time |
| `…/**/*.svelte.test.ts` | `ui` | jsdom | no; kept for component rendering only (jsdom costs ~0.3–0.7 s per legacy component test) |
| anything else under `src/` | `server` / `client` | legacy suites | the legacy harness (`familycalendar_test`) |

## Time zone

The `unit`, `db` and `ui` projects pin UTC themselves, for parity with production, where Node runs in UTC and Postgres renders `timestamptz` as `'2026-10-07 13:00:00+00'`:

- `vite.config.ts` sets `test.env: { TZ: 'UTC' }` on those three projects. Vitest writes `test.env` into the worker at the top of its run, before setup files and test imports, and Node re-reads `process.env.TZ` when it is assigned, so the first `Date` a v2 test touches already sees UTC on any machine.
- The db project's `vitestGlobalSetup.db.ts` sets the rebuilt test database's default `timezone` to UTC right after `synchronous_commit = off`, so every connection the tests open renders `timestamptz` with `+00` — the strings the `/api` goldens assert — instead of a `+01`-style local render.

The legacy `client`/`server` projects are untouched: they keep the developer's zone. Pinned by `utcEnvironment.test.ts › runs in UTC, like production` (project `unit`) and `testDb.db.test.ts › renders timestamptz in UTC, the way production does` (project `db`).

## Legacy tests are reference, not a gate

This is a near-rewrite, so the ~3,700 legacy tests do not gate v2 work. A full legacy run took over 15 minutes on 2026-11-11, and the groceries page test file alone takes 12 s. Legacy tests have exactly two jobs:

1. **Reference.** At S1 of a module rebuild, skim the module's legacy tests to write its behaviour inventory (README Invariants). `npm run census -- <m>` lists them with their kind. Keep the rules, drop the mechanism.
2. **Safety net for live legacy code.** Unported modules still run from this branch, so a change that edits a legacy file runs the legacy tests that import it, and only those. That is what `npm run test:affected` (`vitest --changed`) does inside `npm run gate`.

Nobody runs the whole legacy suite in the loop. `npm run test:legacy` exists for a one-off check after a big `sync-with-test` merge. Each module's legacy tests are deleted at S8, and the legacy projects at APP-05.

What each kind of legacy test file is worth (kind detected by `npm run census -- <m>`):

| kind | worth | do |
|---|---|---|
| `pure`: no mocks, no DOM, no DB | often encodes real rules (phrase tables, cursor dates, rankings) | copy the cases that encode a rule into `*.rules.test.ts`. NLP phrase tables and parse vectors carry over intact |
| `stub-db`: mocks the db singleton / drizzle | pins query shapes, not results | read the titles for rules, then write `rollbackTest` service tests from the rule |
| `real-db`: legacy harness, truncate per test | real behaviour, slow | re-express as `rollbackTest` (ms instead of ~0.5 s per reset) |
| `route`: drives a `+server.ts` / `+page.server.ts` | for `/api`, the contract | becomes S2 golden cases; page-route tests are dropped (page data is redesigned) |
| `component`: renders `.svelte` in jsdom | mostly UI logic tangled with fetch | move the logic to rules and state tests in node; keep a few render tests |
| `mocked`: other module mocks | varies | read the titles for rules; rewrite at the right seam |
| `dead`: prototype/diagnostic code | none | delete |

## Run one module

- **One module:** `npm run test:mod -- tasks` runs that module's v2 tests. Add `--legacy` to also run the legacy tests it still owns, and `--watch` while iterating.
- **Tests that depend on a file:** `npx vitest related src/lib/domains/tasks/tasks.cursor.rules.ts --run`.
- **One test file:** `npx vitest run src/lib/domains/tasks/tasks.repo.db.test.ts`.
- **One test:** add `-t "title substring"`.

DB tests need the local Postgres container `familycalendar-db` on 127.0.0.1:5433. Start it with `docker start familycalendar-db`, once per boot. `npm run db:up` from the main checkout creates it if it is missing.

## What to test where

| seam | file | how | example |
|---|---|---|---|
| pure rules | `x.rules.test.ts` | Table-driven `it.each` of input → expected output. Expected values come from the spec ([CONTEXT.md](../../CONTEXT.md), the ticket, a worked example), never from re-running the code's own formula. | cursor dates, ranking, permission predicates |
| repo | `x.repo.db.test.ts` | `rollbackTest('…', async (db) => { … })`. Seed rows, call the repo, assert rows or results. | the right rows filtered by visibility |
| service | `x.service.db.test.ts` | `rollbackTest` + `testCtx({ db, now })`. Call the service with an actor; assert the result, the rows it wrote, and `ctx.faults` / `ctx.log`. Assert `AppError` codes for refusals. | assignee can complete, outsider gets `forbidden` |
| http contract | `x.http.db.test.ts` | Committed mode (`beforeEach(truncateAll)`). `invoke(routeModule.POST, { ctx, user, body })` and assert status plus the full JSON body. Written against the legacy handler first and kept green through the port. | `POST /api/tasks` → 201 `{ success, task }` |
| client state | `x.state.test.ts` (project `unit`, node) | Construct the state class with a fake api and the memory toaster. Assert transitions: optimistic, success, failure plus rollback, pending flags. No DOM. State classes keep `$effect` out (side effects are explicit methods), so they need no component context. | toggle → optimistic → server error → rolled back + toast |
| component | `ui/X.svelte.test.ts` (project `ui`, jsdom) | Keep these few and synchronous: render with props/callbacks, assert what the user sees and which callback fired. Components take data as props (no fetch), so there is no `waitFor` polling. | row shows the meta line, calls `onComplete` |
| visual | `e2e/pages/` (Playwright, [README](../../e2e/pages/README.md)) | Screenshot every catalog page at 390 px and 1280 px and compare against the committed baseline in `e2e/pages/__screenshots__/`. One catalog (`catalog.ts`), one seed per page shape (`seeds.ts`), one throwaway database and a real `vite preview` (`serve.ts`). Run `npm run pages:build`, then `npm run visual:baseline -- <module>` and `npm run visual:check -- <module>`; baseline and check must be on the same day, because pages show today's date. | groceries page matches its approved look |
| end to end | `e2e/**` (Playwright) | A few journeys per screen, run before cutover. | sign in → add task → see it on the dashboard |

## Golden contract tests (characterization)

Every `/api/**` endpoint is a public contract. The Android app and TaskFocus parse its responses (spec: [docs/guides/task-api-spec.md](../guides/task-api-spec.md)). Before an endpoint is ported, write a golden test against the legacy handler:

1. Seed real rows with `seedUser` and the module's fixtures.
2. `invoke` the route module's handler with `user` set. `invoke` sets both `locals.user` (legacy) and `locals.actor` (v2), so the same test runs before and after the port.
3. Assert status and the full body. Replace generated values with matchers (`expect.any(String)` for ids, ISO-string regex for timestamps). Do not loosen anything else.
4. Cover the success case, every documented error (400 messages, 401, 403, 404, 409 extras) and absent-vs-null input rules.

The test must pass on legacy code before the port starts, and must keep passing, unchanged, after the route file points at the new module. The full procedure is in [characterize-endpoints.md](../rewrite/playbooks/characterize-endpoints.md).

Golden tests build their ctx with `goldenCtx` from `$lib/app/testing/goldenCtx.server`, not `testCtx`: it is `testCtx` plus the real cross-module adapters wired in [ports.server.ts](../../src/lib/app/ports.server.ts), so a ported handler's `ctx.calendarAccess` reads and writes the rows the other module owns, exactly as production does. Create one ctx per test; a rate-budget test reuses one ctx for its whole burst.

## Test doubles

- **Database:** real Postgres, never a query-builder stub (rule R9 bans `vi.mock`).
- **Clock, ids, log, faults, limiter:** `testCtx()` fakes. Inspect `ctx.log.entries`, `ctx.faults.reports`, and move time with `ctx.clock.set()` / `advanceMs()`.
- **Outbound effects** (mail, push, AI, HTTP): add a port with a memory adapter ([add-a-port.md](../rewrite/playbooks/add-a-port.md)) and assert on its outbox.
- **Browser API calls:** pass a fake api object into state classes or components. Don't stub global `fetch` in v2 tests.

## Do not write

- Tests of wiring, re-exports, or a mock echoing what it was told.
- Tautologies, where the expectation recomputes the code's own formula.
- Bare "does not throw" checks, or checks that a list is non-empty or got longer.
- Snapshot dumps of whole components.
- Tests pinned to the real date. Pin time with `testCtx({ now })` or a `now` parameter.

## Natural-language parsing

Any change to a parser (event quick-add, task quick-add, date vocabulary, new keywords) is test-first, using table-driven phrase suites. Cover many phrasings, colloquial variants and word orders. Existing phrase suites are the floor, not the ceiling.

`shared/parse-vectors.json` drives both the web and the Android task quick-add suites (145 vectors). Its count must change in lockstep on both sides, or both suites fail.

## Gates

| command | what it proves | when |
|---|---|---|
| `npm run arch` | rules R1–R15 | after every edit batch (about 5 s) |
| `npm run docs:check` | module READMEs cover their files, and links resolve | after every edit batch |
| `npm run test:mod -- <m>` | the module you touched | after every edit batch (seconds) |
| `npm run test:affected [-- <base>]` | only the tests whose imports reach a changed file: the changed module's tests and everything downstream of it. Without a base it looks at uncommitted changes; with one, at everything since that commit | after every edit batch |
| `npm run typecheck` | zero type errors in v2 code; legacy count ≤ baseline | before commit (~40 s) |
| `npm run gate` | arch + docs + typecheck + `test:affected`. It never runs the whole suite (owner directive 2026-11-11) | before commit |
| `npm run gate:push` | gate + `npm run build:safe` (placeholder secrets, local DB, migrations off) | before push (never push a broken build) |
| `npm run perf:check -- <m>` | the module's pages within their load budgets ([ADR 0010](../adr/0010-performance-budget.md)) | S7, before the module is done |
| `npm run test:v2` | every v2 test | rarely: after changing sql/migrations or the db test infrastructure (not import-reachable), and before cutover |

Playwright: run it directly (`npx playwright test`). Don't use the deprecated `playwright-cli` skill.
