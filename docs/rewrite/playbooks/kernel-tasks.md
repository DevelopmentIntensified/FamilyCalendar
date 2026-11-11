# Playbook: kernel tasks (K-04 … K-10)

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
- `ConfirmAction.svelte`: the two-step "Delete?" → "Yes, delete" / "Cancel" control. Folds 8 copies.
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
3. Add `testDb.db.test.ts` › "resets in under 50 ms": seed one row in five tables, time `truncateAll()`, assert under 50 ms (median of 5).
4. In the kernel README, update the testing row and the Invariants.

**Done when:** `npm run test:mod -- kernel` is green and the timing test passes.

## k-10

**K-10: visual baseline harness**, the acceptance tool for every UI rebuild (S7).

1. Add `e2e/visual/visual.spec.ts`. It is a Playwright spec that, for each page listed in `e2e/visual/pages.ts` (`{ module, path, seed }`), signs in a seeded user and screenshots the page at 390×844 and 1280×800. For login it reuses the session-cookie fixture in `e2e/testUtils.ts`. Seeds create deterministic data: fixed names and dates via a fixed clock, so screenshots are stable.
2. Add npm scripts:
   - `visual:baseline -- <module>` runs the spec with `--update-snapshots`, filtered to the module's pages, against a local build of the current code (`npm run build:safe && npm run preview` against the local DB).
   - `visual:check -- <module>` runs the same pages and compares with `maxDiffPixelRatio: 0.01`.

   Baselines live in `e2e/visual/__screenshots__/<module>/` and are committed.
3. Seed `pages.ts` with every page in the census route lists, grouped by module.
4. Document it in [testing.md](../../architecture/testing.md#what-to-test-where) and add the scripts to the kernel README.

**Done when:** `npm run visual:baseline -- feedback` then `npm run visual:check -- feedback` passes twice in a row on an unchanged tree (stable screenshots).
