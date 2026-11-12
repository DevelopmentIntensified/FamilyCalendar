# kernel

**kernel**: the platform toolkit every module builds on. It contains no domain words: no Tasks, Events or Families. Use it instead of re-solving a cross-cutting problem inside a module.

Domain words come from [CONTEXT.md](../../../CONTEXT.md). Architecture rules: [docs/architecture/rules.md](../../../docs/architecture/rules.md).

## Purpose

- **Owns:** the dependency bag (`Ctx`) and caller identity (`Actor`); the one error type; boundary validation; the HTTP builders (`endpoint`, `pageLoad`, `formAction`); clock, ids and hashing; the rate limiter; structured logs; db/transaction helpers; the test harness.
- **Does not own:** any business rule. Something like "who may edit a task" belongs in the module that owns the concept (`tasks`), even when several modules need it.
- **Also owns:** the date formatting and month math in `kernel/time` (K-06), and the shared UI primitives in `kernel/ui`: sheet, confirm action, pill, skeleton, toaster, brand mark, day nav, mention input, colour hashes. Screens and domains import them by path; they never import a domain or `$app/*`.
- **Later kernel tasks** (see [LEDGER](../../../docs/rewrite/LEDGER.md)) add the browser client pieces (K-07: api client, toast store, local preferences, search box, offline queue) and the page and perf harnesses (K-10/K-11).

## Files

| file | role | what it does, and why it exists | tested by |
|---|---|---|---|
| [ctx/actor.ts](ctx/actor.ts) | type | `Actor` (who is calling: id, email, isAdmin, via) + `actorFromUser`. Small on purpose: anything else about the person is asked of `identity`. | [endpoint.test.ts](http/endpoint.test.ts) |
| [ctx/ctx.server.ts](ctx/ctx.server.ts) | type | `Ctx`: db, clock, ids, log, limiter, faults, config. Services take it as their first argument, so tests swap any dependency without `vi.mock`. | via every test that uses `testCtx` |
| [db/database.server.ts](db/database.server.ts) | infra | `Db` (pool or transaction), `connectDb`, `withTx`. Nested transactions become savepoints. | [testDb.db.test.ts](testing/testDb.db.test.ts) |
| [db/migrations/bundledMigrations.server.ts](db/migrations/bundledMigrations.server.ts) | infra | The `sql/migrations/*.sql` files imported as `?raw`, sorted by numeric prefix: the exact set the cold-start runner replays. Must equal the files on disk. | [bundledMigrations.test.ts](db/migrations/bundledMigrations.test.ts) |
| [db/migrations/bundledMigrations.test.ts](db/migrations/bundledMigrations.test.ts) | test | parity gate: every `sql/migrations/` file is bundled, byte-identical, ascending numeric order | — |
| [db/migrations/migrationRunner.db.test.ts](db/migrations/migrationRunner.db.test.ts) | test | runner is a no-op on the already-migrated test DB; `splitStatements` table | — |
| [db/migrations/migrationRunner.server.ts](db/migrations/migrationRunner.server.ts) | infra | `runMigrations(db)` at cold start: `__schema_migrations` tracking, `hashtext('family-calendar:migrate')` advisory lock with a 3-attempt retry, one transaction per file, stop on first failure. Exports `splitStatements`, the split `vitestGlobalSetup.db.ts` and the db scripts follow. | [migrationRunner.db.test.ts](db/migrations/migrationRunner.db.test.ts) |
| [db/tables.server.ts](db/tables.server.ts) | barrel | The one import path for Drizzle tables: one `export *` per module table file, in `TABLE_OWNERS` order. Importers did not change. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/access.tables.server.ts](db/tables/access.tables.server.ts) | schema | `access`'s tables, moved verbatim from the legacy schema; row types `ClaimTokenRow`/`NewClaimTokenRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/alerts.tables.server.ts](db/tables/alerts.tables.server.ts) | schema | `alerts`'s tables, moved verbatim from the legacy schema; row types `NotificationRow`, `PushSubscriptionRow`, `DeviceTokenRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/billing.tables.server.ts](db/tables/billing.tables.server.ts) | schema | `billing`'s tables, moved verbatim from the legacy schema; row types `DiscountRow`, `UserDiscountRow`, `SubscriptionRow`, `SubscriptionTypeRow`, `AiUsageTrackingRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/bills.tables.server.ts](db/tables/bills.tables.server.ts) | schema | `bills`'s tables, moved verbatim from the legacy schema; row types `BillRow`, `ReceiptItemRow`, `ItemTagRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/calendar.tables.server.ts](db/tables/calendar.tables.server.ts) | schema | `calendar`'s tables, moved verbatim from the legacy schema; row types `CalendarRow`, `EventRow`, `EventExceptionRow`, `EventAttendanceRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/dashboardModules.tables.server.ts](db/tables/dashboardModules.tables.server.ts) | schema | `dashboardModules`'s table, moved verbatim from the legacy schema; row types `DashboardModuleSwitchRow`/`NewDashboardModuleSwitchRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/family.tables.server.ts](db/tables/family.tables.server.ts) | schema | `family`'s tables, moved verbatim from the legacy schema; row types `FamilyRow`, `FamilyMemberRow`, `FamilyInviteCodeRow`, `ChildConsentRecordRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/feedback.tables.server.ts](db/tables/feedback.tables.server.ts) | schema | `feedback`'s tables, moved verbatim from the legacy schema; row types `BugReportRow`, `UnmatchedPhraseRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/groceries.tables.server.ts](db/tables/groceries.tables.server.ts) | schema | `groceries`'s tables, moved verbatim from the legacy schema; row types `GroceryItemRow`, `GroceryStoreMemoryRow`, `GroceryStoreColourRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/identity.tables.server.ts](db/tables/identity.tables.server.ts) | schema | `identity`'s tables, moved verbatim from the legacy schema; row types `UserRow`, `UserSettingsRow`, `AccountRow`, `CodeRow`, `AuthSessionRow`, `AuthAccountRow`, `AuthVerificationRow`, `ApiTokenRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/marketing.tables.server.ts](db/tables/marketing.tables.server.ts) | schema | `marketing`'s table, moved verbatim from the legacy schema; row types `WaitlistEntryRow`/`NewWaitlistEntryRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/meals.tables.server.ts](db/tables/meals.tables.server.ts) | schema | `meals`'s table, moved verbatim from the legacy schema; row types `MealRow`/`NewMealRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/sponsored.tables.server.ts](db/tables/sponsored.tables.server.ts) | schema | `sponsored`'s tables, moved verbatim from the legacy schema; row types `AdEventRow`, `AdConsentRecordRow` (plus `AdConsentDecision`). | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [db/tables/tasks.tables.server.ts](db/tables/tasks.tables.server.ts) | schema | `tasks`'s tables, moved verbatim from the legacy schema; row types `TaskRow`, `TaskTagRow`, `TaskCompletionRow`, `TaskCategoryRow`, `TaskfocusCommandRow`, `TaskfocusSessionRow` (plus `TASK_VISIBILITIES`/`TaskVisibility`). | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
| [errors/appError.ts](errors/appError.ts) | rules | `AppError` with codes mapped to HTTP status; constructors `invalid`, `notFound`, `forbidden`, `conflict(msg, extra)`, and so on. Expected failures only. | [appError.test.ts](errors/appError.test.ts) |
| [errors/appError.test.ts](errors/appError.test.ts) | test | status mapping, extra fields cannot override `error` | — |
| [http/endpoint.server.ts](http/endpoint.server.ts) | infra | `endpoint({ auth, query, body, params, rateLimit, failMessage, handle })` → `{ handler }` for `+server.ts`. Owns auth, parsing, the `{error}` shape, 429/500 and fault filing. | [endpoint.test.ts](http/endpoint.test.ts) |
| [http/endpoint.test.ts](http/endpoint.test.ts) | test | auth modes incl. cron, parsing, Invalid JSON, AppError/extra, 500 + fault, rate limit | — |
| [http/pageHandlers.server.ts](http/pageHandlers.server.ts) | infra | `pageLoad` (redirects to /login or /calendar) and `formAction` (`fail(...)` with `{ success: false, error }`), `formFields`. | [pageHandlers.test.ts](http/pageHandlers.test.ts) |
| [http/pageHandlers.test.ts](http/pageHandlers.test.ts) | test | redirect rules, legacy `requireUserAction` failure shape, AppError mapping, fault filing | — |
| [ids/ids.ts](ids/ids.ts) | infra | `Ids` port, `systemIds` (the existing 15-char row-id format), `sequentialIds` for tests, `sha256Hex`, the one hash for stored secrets. | [ids.test.ts](ids/ids.test.ts) |
| [ids/ids.test.ts](ids/ids.test.ts) | test | id format, FIPS vector, byte-equality with the legacy node:crypto hashes | — |
| [log/jsonLog.ts](log/jsonLog.ts) | infra | `Log` port + JSON-lines adapter (same line format as the legacy logger, so Vercel log search keeps working). | [jsonLog.test.ts](log/jsonLog.test.ts) |
| [log/jsonLog.test.ts](log/jsonLog.test.ts) | test | line shape | — |
| [ratelimit/rateLimiter.ts](ratelimit/rateLimiter.ts) | infra | `RateLimiter` port, in-memory sliding window driven by the clock, `clientKeyOf` (same keys as legacy). | [rateLimiter.test.ts](ratelimit/rateLimiter.test.ts) |
| [ratelimit/rateLimiter.test.ts](ratelimit/rateLimiter.test.ts) | test | window edges, independent buckets, key derivation | — |
| [testing/invokeHandlers.server.ts](testing/invokeHandlers.server.ts) | test infra | `invoke`, `invokeLoad`, `invokeAction`: call route handlers without a server; sets `locals.user` (legacy) and `locals.actor` (v2), so one golden test covers both. | used by every http test |
| [testing/seedRows.server.ts](testing/seedRows.server.ts) | test infra | `seedUser`, `uniqueSuffix`. Module-specific builders live in `<module>.fixtures.server.ts`. | [testDb.db.test.ts](testing/testDb.db.test.ts) |
| [testing/testCtx.server.ts](testing/testCtx.server.ts) | test infra | `testCtx({ db?, now?, cronSecret? })`: fixed clock, sequential ids, memory log/faults/limiter; no-db guard. | used by every test |
| [testing/testDb.server.ts](testing/testDb.server.ts) | test infra | `rollbackTest` (default: one rolled-back transaction per test), `inRollback`, `testDb`, `truncateAll` (committed mode: one transaction with FK triggers off, one `DELETE FROM` per table — a few ms), lane guard. | [testDb.db.test.ts](testing/testDb.db.test.ts) |
| [testing/testDb.db.test.ts](testing/testDb.db.test.ts) | test | migrations applied, rollback isolation, savepoints, truncate, reset under 250 ms | — |
| [testing/testDbConfig.ts](testing/testDbConfig.ts) | test infra | Test DB URL + lane guard (kept apart from testDb because globalSetup must not import vitest). `V2_TEST_DB` picks a per-worktree database (`familycalendar_v2_test_<id>`) for parallel runs. | — |
| [testing/vitestGlobalSetup.db.ts](testing/vitestGlobalSetup.db.ts) | test infra | Rebuilds `familycalendar_v2_test` from `sql/migrations` each run, the way production's runner does, and sets `synchronous_commit = off` on the throwaway database so reset commits are cheap. | every db run |
| [testing/vitestSetup.db.ts](testing/vitestSetup.db.ts) | test infra | Points `DATABASE_URL` (and so the legacy singleton) at the test DB; closes the pool. | every db run |
| [testing/vitestSetup.unit.ts](testing/vitestSetup.unit.ts) | test infra | Points `DATABASE_URL` at a closed port, so unit tests fail fast if they touch a database. | every unit run |
| [time/clock.ts](time/clock.ts) | infra | `Clock` port, `systemClock`, `fixedClock` (set/advance). The only source of "now" (rule R5). | [clock.test.ts](time/clock.test.ts) |
| [time/clock.test.ts](time/clock.test.ts) | test | default instant, advance/set, copy semantics | — |
| [time/dates.test.ts](time/dates.test.ts) | test | format tables, DST in New York and London, month ends, leap years, UTC+14, grouping, month math, timestamp normalisation | — |
| [time/dates.ts](time/dates.ts) | rules | `formatUsDate`, `formatClockTime`, `formatDayMonth`, `formatLongDate`, `formatShortDate`, `dayKey`, `formatDateTimeMinute`, `relativeFromNow`, `groupByDay`, `addMonthsClamped`, `startOfDayIn`, `isValidZone`, `toInstantString`. Every legacy date formatter's one home; the zone (and `now` when relative) is always a parameter, so nothing reads the clock. | [dates.test.ts](time/dates.test.ts) |
| [ui/BrandMark.svelte](ui/BrandMark.svelte) | ui | The calendar wordmark glyph, one copy (issue 095): sized by prop, `currentColor` so call sites keep their text colour, hidden from assistive tech unless given a label. | [BrandMark.svelte.test.ts](ui/BrandMark.svelte.test.ts) |
| [ui/BrandMark.svelte.test.ts](ui/BrandMark.svelte.test.ts) | test | glyph geometry, size/class/label props | — |
| [ui/DayNav.svelte](ui/DayNav.svelte) | ui | One date navigator for the dashboard header and the calendar toolbar (118, #119): links when given hrefs, buttons with callbacks when the caller navigates in place, and an optional leading period label inside the same pill. No `$app/*`. | [DayNav.svelte.test.ts](ui/DayNav.svelte.test.ts) |
| [ui/DayNav.svelte.test.ts](ui/DayNav.svelte.test.ts) | test | one pill, labelled links/buttons, `aria-current`, leading segment | — |
| [ui/MentionInput.svelte](ui/MentionInput.svelte) | ui | Textarea offering `@` suggestions from a roster prop plus the caller's optional group row; inserts the picked name as text, Escape/insert lock the list, Enter picks or submits. Props in, callbacks out; no fetch, no group words. | [MentionInput.svelte.test.ts](ui/MentionInput.svelte.test.ts) |
| [ui/MentionInput.svelte.test.ts](ui/MentionInput.svelte.test.ts) | test | open/close, insert by Enter/Tab/click, Escape lock, submit | — |
| [ui/colorHash.ts](ui/colorHash.ts) | rules | `nameColor` (the one #115 name hash store and contact colours take modulo their palette), `idColor` (the avatar hash, deliberately different), `initials`. | [colorHash.test.ts](ui/colorHash.test.ts) |
| [ui/colorHash.test.ts](ui/colorHash.test.ts) | test | pinned legacy outputs per name/id, initial rules | — |
| [ui/mentionFilter.ts](ui/mentionFilter.ts) | rules | The pure mention suggestion filter (prefix, case-insensitive, capped) plus the prop types `MentionPerson` and `MentionEveryoneOption`. | [mentionFilter.test.ts](ui/mentionFilter.test.ts) |
| [ui/mentionFilter.test.ts](ui/mentionFilter.test.ts) | test | prefix/case/full-name matches, caps, empty cases | — |
| [ui/ConfirmAction.svelte](ui/ConfirmAction.svelte) | component | Two-step destructive control: first click asks (`ask`, default `${label}?`), cancel returns, confirm fires once; focus moves to Cancel while asking and back to the trigger after. Optional `testid` (`-confirm`/`-cancel` on the buttons). Folds the five legacy copies. | [ConfirmAction.svelte.test.ts](ui/ConfirmAction.svelte.test.ts) |
| [ui/ConfirmAction.svelte.test.ts](ui/ConfirmAction.svelte.test.ts) | test | ask → cancel → confirm, custom/default ask copy, focus round-trip, caller labels/testid, disabled | — |
| [ui/Pill.svelte](ui/Pill.svelte) | component | The one rounded chip for tags, categories and status words, with the legacy tone colours: `neutral`, `accent`, `warning`, `danger`, `success`, plus `category`/`categoryMuted` (teal, #280), `family` (indigo) and `doneCount` (orange 🔥). Optional `testid`. | [Pill.svelte.test.ts](ui/Pill.svelte.test.ts) |
| [ui/Pill.svelte.test.ts](ui/Pill.svelte.test.ts) | test | base shape, neutral default, tone colours, category/family/done-count legacy pairs, title hint | — |
| [ui/Sheet.svelte](ui/Sheet.svelte) | component | Modal / bottom-sheet shell: required `title` names the dialog, optional `subtitle`, focus trap, Esc, backdrop close, swipe-down close (`swipeToClose={false}` vetoes it), parent-owned `open`, optional `testid` (`-close` on the button). Folds `EventModalShell` + `BottomSheetHandle`. | [Sheet.svelte.test.ts](ui/Sheet.svelte.test.ts) |
| [ui/Sheet.svelte.test.ts](ui/Sheet.svelte.test.ts) | test | closed/open, Esc, backdrop vs inside click, footer, subtitle, swipe and its veto, testids, focus return | — |
| [ui/Skeleton.svelte](ui/Skeleton.svelte) | component | Animated placeholder rows, so a loading section keeps its height (skeletons, not blank cards). | [Skeleton.svelte.test.ts](ui/Skeleton.svelte.test.ts) |
| [ui/Skeleton.svelte.test.ts](ui/Skeleton.svelte.test.ts) | test | default line count, custom count, pulse + hidden, caller class | — |
| [ui/Toaster.svelte](ui/Toaster.svelte) | component | Renders the K-07 toast list in one polite live region with the legacy card look, a dismiss button, and the legacy action button (`action.label` → `action.run()` then dismiss). | [Toaster.svelte.test.ts](ui/Toaster.svelte.test.ts) |
| [ui/Toaster.svelte.test.ts](ui/Toaster.svelte.test.ts) | test | empty list, every item, dismiss by id, action runs once then dismisses | — |
| [ui/sheetSwipe.ts](ui/sheetSwipe.ts) | rules | Pure swipe-to-close maths (legacy 100 px threshold, upward drags clamp at 0), so the sheet component holds no transitions. | [sheetSwipe.test.ts](ui/sheetSwipe.test.ts) |
| [ui/sheetSwipe.test.ts](ui/sheetSwipe.test.ts) | test | legacy threshold table, clamping, idle state | — |
| [ui/trapFocus.ts](ui/trapFocus.ts) | action | `use:trapFocus` Svelte action: Tab/Shift+Tab cycle inside the node, focus returns on destroy. Moved from `utils/focusTrap.ts`. | [trapFocus.svelte.test.ts](ui/trapFocus.svelte.test.ts) |
| [ui/trapFocus.svelte.test.ts](ui/trapFocus.svelte.test.ts) | test | forward/backward wrap, native Tab, focus restore and listener removal | — |
| [validation/validators.ts](validation/validators.ts) | rules | zod plus shared fields: `requiredText`, `optionalText`, `isoDate`, `yearMonth`, `isoInstant`, `emailAddress`, `oneOf`, `wholeNumber`, `formList`, `clampedInt`, `firstIssueMessage`, `JsonValue`. | [validators.test.ts](validation/validators.test.ts) |
| [validation/validators.test.ts](validation/validators.test.ts) | test | one table per helper | — |

## Public interface

The kernel has no index file. Import the file you need directly; every basename is unique (rule R10).

### Ctx and actor

Services are written `fn(ctx: Ctx, actor: Actor, input: X)`. System jobs with no caller are written `fn(ctx, input)`. Production wiring is [src/lib/app/appCtx.server.ts](../app/appCtx.server.ts). Tests use `testCtx()`. To add a port, follow [add-a-port.md](../../../docs/rewrite/playbooks/add-a-port.md).

### Errors

Throw `AppError` (via `invalid`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `tooMany`, `unavailable`) for expected failures. Its message is user-facing copy and part of the API contract. Anything else you throw is a fault: it is logged, filed, and returned as a 500.

### Validation

Parse input once, at the boundary, through the `query`/`body`/`params`/`form` schemas of the HTTP builders. Keep legacy error wording when porting.

### HTTP

- `endpoint()` builds `+server.ts` handlers.
- `pageLoad()` builds `load`.
- `formAction()` builds `actions`.
- Response helpers: `ok`, `created`, `reply`.

Route files stay wiring-only (rule R8). Auth modes: `public`, `optional`, `user`, `admin`, `cron`.

### Time

Read `ctx.clock.now()`. Pass "now" into rules as a parameter. Format, key and group dates with [time/dates.ts](time/dates.ts) — pass the user's IANA zone (and `now` where the output is relative) explicitly; never write another formatter.

### Ids

- `ctx.ids.id()` for new rows.
- `sha256Hex(text)` for any stored secret (API token, email code, claim token).

### Rate limits

Declare `rateLimit: { scope, limit, windowMs, message }` on the endpoint. For custom flows, call `ctx.limiter.allow(clientKeyOf(request, scope), limit, windowMs)` directly.

### Log

`ctx.log.info|warn|error(event, fields)`. Never log request bodies or emails.

### Database

- Repos take `db: Db`.
- Services pass `ctx.db` and use `withTx(ctx, (txCtx) => ...)` for atomic work.
- Tables come from `$lib/kernel/db/tables.server`.
- `runMigrations(db)` brings a database up to date at cold start (`hooks.server.ts`). `splitStatements(sql)` is the one statement split; `scripts/db-apply.mjs` and `db-exec.mjs` mirror it.

### Testing

`testCtx`, `invoke*`, `rollbackTest`, `truncateAll`, `seedUser`. The full guide is [docs/architecture/testing.md](../../../docs/architecture/testing.md).

## How to test

- `npm run test:mod -- kernel` runs the unit, ui and db projects for this folder (ui tests are the `*.svelte.test.ts` files, in jsdom).
- The db tests need Postgres: run `docker start familycalendar-db` (127.0.0.1:5433). The test database is rebuilt from `sql/migrations` on every run.

## Invariants

- 401 body is exactly `{"error":"Unauthorized"}` and 403 is `{"error":"Forbidden"}`: Android maps them (task-api-spec "Universal responses"). Pinned by `endpoint.test.ts › answers 401 …` and `› answers 403 …`.
- A malformed JSON body gets `400 {"error":"Invalid JSON"}`, never a 500. Pinned by `endpoint.test.ts › answers 400 {"error":"Invalid JSON"} …`.
- An AppError's extra fields merge into the body, but can't replace `error` (the 409 `openSessionId` contract). Pinned by `endpoint.test.ts › maps AppError …` and `appError.test.ts › puts extra fields …`.
- Rate-limit keys are `${scope}:${ip}`, the same as legacy `clientKey`, so ported and unported endpoints share buckets. Pinned by `rateLimiter.test.ts › keys …`.
- Stored-secret hashes are byte-identical to the legacy ones. Pinned by `ids.test.ts › hashes UTF-8 bytes exactly like the legacy …`.
- New row ids keep the legacy 15-char a-z0-9 format. Pinned by `ids.test.ts › keeps the existing row-id format …`.
- db tests can only reach `127.0.0.1:5433/familycalendar_v2_test` (or `familycalendar_v2_test_<id>` via `V2_TEST_DB`), and unit tests can't reach any database (lane guards in `testDbConfig.ts`, `vitestSetup.unit.ts`).
- Every `rollbackTest` leaves no rows behind, and service transactions inside it are savepoints. Pinned by `testDb.db.test.ts`.
- truncateAll resets in under 250 ms (median of 5), even on a loaded machine; pinned by `testDb.db.test.ts › resets in under 250 ms`.
- The migration runner is a no-op on an up-to-date database: `{ ok: true, applied: [] }`. Pinned by `migrationRunner.db.test.ts › applies nothing to the already-migrated test database …`.

## Depends on

- **May import:** kernel only (rule R1). The [db/tables.server.ts](db/tables.server.ts) barrel is no exception any more: the tables live under `db/tables/` and import their siblings plus the id and clock ports.
- **Owns tables:** none. Table ownership is in [scripts/arch/registry.mjs](../../../scripts/arch/registry.mjs).
- **Called by:** every module, `src/lib/app`, and route files.
