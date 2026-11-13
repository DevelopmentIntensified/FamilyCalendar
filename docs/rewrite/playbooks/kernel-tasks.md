# Playbook: kernel tasks (K-04 … K-11)

Kernel tasks build shared pieces once, before the modules that need them. Each new kernel file gets a test and a row in the [kernel README](../../../src/lib/kernel/README.md) Files table, in the same commit.

**Do not mass-rewire legacy callers.** A legacy copy is replaced when its own module is ported (S8). The exceptions are spelled out in the task, as in K-04 and K-05.

Gates for every kernel task:

```bash
npm run test:mod -- kernel && npm run arch && npm run docs:check && npm run gate
```

## k-04

**K-04: Split `schema.ts` into per-module table files under kernel.**

1. For each module in `TABLE_OWNERS` ([registry.mjs](../../../scripts/arch/registry.mjs)), create `src/lib/kernel/db/tables/<module>.tables.server.ts`. Copy that module's `pgTable` definitions **verbatim**: same physical names, columns, indexes, defaults and foreign keys. Foreign keys import from sibling table files.
2. Replace the `generateId(15)` defaults with `systemIds.id()` from `kernel/ids` (same format).
3. Row types: export `<Thing>Row = typeof x.$inferSelect` and `New<Thing>Row = typeof x.$inferInsert`, for example `TaskRow` and `NewTaskRow`. The plain names (`Task`, `User`) are reserved for contract types (rule R11).
4. `kernel/db/tables.server.ts` becomes `export * from './tables/<module>.tables.server'` for every module.
5. The legacy `src/lib/server/db/schema.ts` becomes a compatibility re-export:
   - `export * from '$lib/kernel/db/tables.server'`;
   - type aliases for the old names (`export type { TaskRow as Task } …`);
   - the existing `BILL_CATEGORIES` re-export line, kept as is.

   Legacy code compiles unchanged. Legacy importing v2 is allowed.
6. Point `scripts/db-schema-diff.ts` at `src/lib/kernel/db/tables.server`. After running the db tests once, run:

   ```bash
   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/familycalendar_v2_test npx tsx scripts/db-schema-diff.ts
   ```

   It must print `NO DRIFT`.
7. Kernel README: add the table files (role: schema). Then run `npm run docs:gen`.

**Done when:** schema diff reports NO DRIFT, `npm run gate` passes, and `git grep -n "pgTable(" -- src/lib/server` finds nothing.

## k-05

**K-05: Move the migration runner and bundle into `kernel/db/migrations`.**

1. Move the two files:
   - `git mv src/lib/server/db/migrations/runner.ts src/lib/kernel/db/migrations/migrationRunner.server.ts`
   - `git mv src/lib/server/db/migrations/scripts.ts src/lib/kernel/db/migrations/bundledMigrations.server.ts`

   Fix the `?raw` relative paths (same depth: `../../../../../sql/migrations/...`). Move `scripts.test.ts` beside them as `bundledMigrations.test.ts`. The parity test must keep passing.
2. The runner takes `db: Db` as a parameter: `runMigrations(db)`. `src/hooks.server.ts` calls `runMigrations(appCtx.db)` under the same `DATABASE_DISABLE_MIGRATIONS` guard. Keep:
   - the tracking table name `__schema_migrations`;
   - the advisory lock key `hashtext('family-calendar:migrate')`;
   - the blank-line statement split;
   - one transaction per file;
   - stop-on-first-failure;
   - the 3x lock retry.

   Production depends on all of them.
3. Export `splitStatements` and use it in `vitestGlobalSetup.db.ts`, which can import it because it contains no vitest import. `scripts/db-apply.mjs` and `scripts/db-exec.mjs` stay as they are: plain Node can't import TS. Leave a comment pointing at the kernel copy.
4. Add `migrationRunner.db.test.ts`: running the runner on the already-migrated test DB applies 0 files and returns `ok: true`.
5. Delete the stray `src/lib/server/db/migrations/0001_add_password_hash.sql` only if `git grep 0001_add_password_hash` finds no reference.

**Done when:** `npm run gate` passes, including step 4's test. Previews are blocked by [Q-004](../questions.md); once the owner answers, also confirm that the pushed commit's preview serves `/api/health` and its Vercel logs show migrations ran at cold start without errors. Until then, write "preview check pending Q-004" in the ledger note.

## k-06

**K-06: `kernel/time` dates: one home for formatting, day keys and month math.**

1. Read each legacy copy listed under "date formatting" and "timestamp shape" in [conventions.md](../../architecture/conventions.md#one-home-per-concept). For each **distinct output format**, write one function in `src/lib/kernel/time/dates.ts`:
   - Every function takes the instant or date-string and the IANA zone as parameters, plus `now` where "relative" matters.
   - Use luxon.
   - Name the function by its output, for example `formatDayMonth` → "Nov 11", `formatClockTime` → "9:30 PM", `formatUsDate` → "11-11-2026", `dayKey` → "2026-11-11", `relativeFromNow`.
2. Also add:
   - `groupByDay(items, instantOf, zone)`;
   - `addMonthsClamped(dateString, months)`: Jan 31 + 1 month = Feb 28/29, and the clamped day never rolls over (the rule from `dateResolution.ts`);
   - `startOfDayIn(zone, instant)`;
   - `isValidZone(zone)`;
   - `toInstantString(value)`, which folds the timestamp normalizers.
3. `dates.test.ts`: tables with fixed instants. Cover DST transitions (America/New_York, Europe/London), month ends, leap years, and Pacific/Kiritimati (UTC+14). Each expected value comes from a worked example, not from the function.
4. Do not rewire legacy callers now. Modules switch at their S3/S7.

## k-07

**K-07: `kernel/client`: browser-side shared pieces.**

| file | what | folds |
|---|---|---|
| `client/apiClient.ts` | `createApiClient(fetcher = fetch)`: `request(method, path, body?)` → `ApiResult<T> = {ok:true,data} \| {ok:false,status,error}`. Error copy: the server's `error` when present, else per-status copy from legacy `actionErrorCopy` (#195); "Network problem…" when fetch rejects. | `utils/actionError.ts`, the "That didn't work. Try again." copies, `familyTaskActions` FetchLike |
| `client/toasts.svelte.ts` | `createToasts({ schedule })`: runes list, max 4, 6 s auto-dismiss (legacy behaviour), `success/error/info`; `memoryToasts()` for tests | `client/toasts.ts` |
| `client/localPref.ts` | typed, versioned device preference over an injectable `Storage` | `calendarVisibility` / `calendarAssignees` boilerplate |
| `client/searchBox.svelte.ts` | debounced query + stale-response guard (AbortController) | 3 hand-rolled pickers |
| `time/ticker.svelte.ts` | reactive "now" that ticks every N ms (kernel/time is exempt from R5) | TaskRow / TaskLoggedTimeBand intervals |
| `client/shareText.ts`, `client/offlineQueue.ts` | `git mv` of legacy `client/share.ts` and `utils/offline.ts`, adapted to take injected `navigator` / IndexedDB, with their tests moved and titles kept | the originals |

Tests use fake fetch, fake storage and a manual scheduler. There are no real timers and no `vi.mock`.

## k-08

**K-08: `kernel/ui`: shared components.**

Create `src/lib/kernel/ui/` with these components, each with `*.svelte.test.ts`. Port the legacy markup and `data-testid`s so screens look the same.

- `Sheet.svelte`: modal and bottom sheet with focus trap, Esc, backdrop click and swipe-to-close. Folds `EventModalShell`, `BottomSheetHandle`, `bottomSheetSwipe.ts` and `focusTrap.ts` (as the `trapFocus` action inside kernel/ui).
- `ConfirmAction.svelte`: the two-step "Delete?" → "Yes, delete" / "Cancel" control, plus the row's icon trigger with compact Yes/No and the family page's form POST. Folds 5 copies: TaskRow, TaskCompletedRow, FamilyOpenTaskRow, TaskDetailBar, and the family page's member-remove row.
- `Pill.svelte`, `Skeleton.svelte`, and `Toaster.svelte` (renders K-07 toasts).
- `BrandMark.svelte` (from `brand/Mark.svelte`), `DayNav.svelte`, `MentionInput.svelte` (with `mentionFilter` as a rules file).
- `colorHash.ts`:
  - `nameColor(name)`, the single name hash (#115), used for store and contact colours;
  - `idColor(id)`, the avatar hash, deliberately a different function;
  - `initials(first, last)`.

  Tests pin today's outputs for sample inputs, computed by the legacy functions before you delete anything.

kernel/ui components never import `$app/*` or any domain.

## k-09

**K-09: test speed.** Measured on 2026-11-11: one committed-mode reset (`truncateAll`, TRUNCATE of ~45 tables) takes about 0.5 s.

1. In `vitestGlobalSetup.db.ts`, right after `CREATE DATABASE`, run `ALTER DATABASE familycalendar_v2_test SET synchronous_commit = off`. This only affects the throwaway test database; a crash can lose the last test writes, which is irrelevant.
2. Rewrite `truncateAll()` as one transaction:
   - `SET LOCAL session_replication_role = replica`, so foreign-key triggers don't fire;
   - then `DELETE FROM` each discovered table except `__schema_migrations`.

   Keep the discovery query.
3. Add `testDb.db.test.ts` › "resets in under 250 ms": seed one row in five tables, time `truncateAll()`, assert under 250 ms (median of 5). The DELETE reset measured 70–110 ms on a saturated machine, and the old TRUNCATE about 500 ms idle, so the bound survives load and still catches a regression.
4. In the kernel README, update the testing row and the Invariants.

**Done when:** `npm run test:mod -- kernel` is green and the timing test passes.

## k-10

**K-10: page harness**, shared by the visual check (here) and the perf check (K-11). It needs K-05's `runMigrations`.

1. `e2e/pages/catalog.ts` lists every page route from `npm run census`, grouped by module. Each entry is `{ module, name, path, landsOn?, seed, ready, mask? }`:
   - `seed` names a function in `e2e/pages/seeds.ts`;
   - `ready` is the selector that appears when the page is usable **and its data arrived** — a `data-testid` inside the page's data-dependent content wherever the page has one (the dashboard's `h1` renders above its streaming `{#await}`, so it waits on the card band instead), for example `[data-testid="calendar-grid"]`;
   - `landsOn` is the landing path of a redirecting route (`/share-target` → `/calendar`);
   - `mask` lists selectors of regions that change on their own (clocks, "today", relative dates), which screenshots hide.
2. `e2e/pages/seeds.ts`: each seed creates its own user with a **fixed identity** (a stable address `visual+<seed>-<suffix>@example.invalid` and stable row ids, fixed names, zone `America/New_York`) and the rows the page shows. Dates are relative to today in that zone; open items due today sit at 23:59 so they never change state during the day, and explicit overdue examples sit on earlier days. Seeds write rows through the kernel test fixtures or plain inserts; they never call legacy services.
3. `e2e/pages/session.ts`: `openAs(page, seedName)` runs the seed and signs in by session cookie. Reuse `loginWithSession` from `e2e/testUtils.ts`. `gotoReady(page, entry, seed)` is the one navigation path for this harness and K-11: it navigates, waits for `ready`, asserts the landing path (`landsOn` when set) and asserts `GET /api/me` returns the seed's identity — a broken cookie does not redirect a protected route to `/login`, hooks.server.ts creates an anonymous user instead.
4. `e2e/pages/serve.ts` (run with `npx tsx`):
   - drop and create the database `familycalendar_pages` on 127.0.0.1:5433;
   - start `vite preview --port 4174` on the existing build with `DATABASE_URL` pointing at that database and migrations **enabled** (no `DATABASE_DISABLE_MIGRATIONS`), so the built server's hooks (`src/hooks.server.ts`) run the kernel `runMigrations` exactly as a production cold start does. Do not import `runMigrations` here: `bundledMigrations.server.ts` loads its SQL through Vite `?raw` imports, which plain `tsx` cannot resolve.
   - `e2e/pages/globalSetup.ts`, wired as the config's `globalSetup`, requests `baseURL` once (so the server loads its hooks), then polls `select count(*) from "__schema_migrations"` until it equals the number of `sql/migrations/*.sql` files — 60 s timeout, and the error names both counts — before any test seeds.
5. `playwright.pages.config.ts`: a separate config (the main `playwright.config.ts` stays as it is). `testDir: 'e2e/pages'`, webServer `npx tsx e2e/pages/serve.ts`, baseURL `http://localhost:4174`, and two projects: desktop (1280×800) and mobile (Pixel 7, 390 px wide). `use` pins `timezoneId: 'America/New_York'` and `locale: 'en-US'`, and the preview server runs with `TZ=UTC`, so neither depends on the host. The test process gets the same `DATABASE_URL`; the shared constants live in `e2e/pages/env.ts`.
6. `e2e/pages/visual.spec.ts`: for each catalog page of the module named by the `PAGES_MODULE` env (all pages when it is unset): `openAs`, `gotoReady`, `waitForLoadState('networkidle')` (here only — K-11 must not wait for idle), then `expect(page).toHaveScreenshot()` with the masks, animations disabled and `maxDiffPixelRatio: 0.01`. Baselines live in `e2e/pages/__screenshots__/` and are committed.
7. npm scripts:
   - `pages:build` runs `npm run build:safe` and records `git rev-parse HEAD` next to the build output (`.svelte-kit/pages-build-head`; `serve.ts` warns when HEAD has moved since);
   - `visual:baseline -- <module>` and `visual:check -- <module>` run the spec for that module, with `--update-snapshots` for the baseline. They go through a small node script that sets `PAGES_MODULE`.
8. `e2e/pages/README.md` lists every file (what, why, how it is tested). Add the harness to [testing.md](../../architecture/testing.md#what-to-test-where).

Baseline and check must run on the same day, because pages show today's date. If more time passes, recreate the baseline from the module's S2 commit in a temporary worktree.

**Done when:**
- `npx playwright test -c playwright.pages.config.ts --list` lists every catalog page in both projects;
- after `npm run pages:build`, `npm run visual:baseline -- groceries` and then `npm run visual:check -- groceries` pass twice in a row on an unchanged tree.

## k-11

**K-11: perf harness** ([ADR 0010](../../adr/0010-performance-budget.md)), on the K-10 page harness.

1. `e2e/pages/perf.spec.ts`: for each catalog page of `PAGES_MODULE` (all pages when it is unset), in two profiles:
   - desktop: 1280×800, no CPU throttle, network 50 Mbps down / 10 Mbps up / 20 ms RTT (CDP `Network.emulateNetworkConditions`);
   - mobile: Pixel 7 emulation, CPU 4× slowdown (CDP `Emulation.setCPUThrottlingRate`), 12 Mbps / 4 Mbps / 50 ms RTT.

   For each page and profile, take the median of 5 runs of:
   - **first visit:** a fresh browser context, so the cache is empty. Record ready time, TTFB (navigation timing), LCP (`PerformanceObserver`), and transferred bytes for initial JS, HTML and page data;
   - **repeat visit:** a second `page.goto` in the same context. Record ready time and LCP.
2. `e2e/pages/budgets.ts`: the ADR 0010 targets and hard limits, plus per-page JS ceilings read from `e2e/pages/perf-baseline.json`.
3. Output: a table per page on the console and `e2e/pages/perf-results/<module>.json` (gitignored). The run fails when a hard limit is exceeded:
   - desktop ready, first or repeat visit, above 1000 ms;
   - mobile ready, repeat visit, above 1000 ms;
   - TTFB above 300 ms;
   - initial JS above the page's baseline ceiling.
4. npm scripts:
   - `perf:check -- <module>`;
   - `perf:baseline`, which measures all pages and writes `e2e/pages/perf-baseline.json` plus `docs/rewrite/perf-baseline.md`: every page's numbers, slowest first, with the targets beside them.
5. Run `perf:baseline` on the current (legacy) code and commit both files. Legacy pages may already exceed the hard limits; that is what the rebuilds fix. Hard limits apply from each module's S7.
6. Document it in `e2e/pages/README.md` and [testing.md](../../architecture/testing.md#gates).

**Done when:** the baseline covers every catalog page, and two runs of `npm run perf:check -- groceries` give medians within 15% of each other.
