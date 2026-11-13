# kernel

**kernel**: the platform toolkit every module builds on. It holds no business rules: no Tasks, Events or Families logic. Data shape is the one domain-worded exception: the table definitions live in [db/tables](db/tables), one file per owning module (ownership in [scripts/arch/registry.mjs](../../../scripts/arch/registry.mjs) `TABLE_OWNERS`), because Drizzle needs a single schema. Use the kernel instead of re-solving a cross-cutting problem inside a module.

Domain words come from [CONTEXT.md](../../../CONTEXT.md). Architecture rules: [docs/architecture/rules.md](../../../docs/architecture/rules.md).

## Purpose

- **Owns:** the dependency bag (`Ctx`) and caller identity (`Actor`); the one error type; boundary validation; the HTTP builders (`endpoint`, `pageLoad`, `formAction`); clock, ids and hashing; the rate limiter; structured logs; db/transaction helpers; the Drizzle table definitions in `db/tables` (one file per owning module, `TABLE_OWNERS` in `scripts/arch/registry.mjs`) with their row types; the test harness.
- **Does not own:** any business rule. Something like "who may edit a task" belongs in the module that owns the concept (`tasks`), even when several modules need it.
- **Also owns:** the date formatting and month math in `kernel/time` (K-06), and the shared UI primitives in `kernel/ui`: sheet, confirm action, pill, skeleton, toaster, brand mark, day nav, mention input, colour hashes. Screens and domains import them by path; they never import a domain or `$app/*`.
- **Client pieces** (K-07) live in `client/`: the api client, toasts, device preferences, debounced search and the offline queue; `time/ticker` is the reactive "now" for countdowns.
- **Later kernel tasks** (see [LEDGER](../../../docs/rewrite/LEDGER.md)) add the page and perf harnesses (K-10/K-11).

## Files

| file | role | what it does, and why it exists | tested by |
|---|---|---|---|
| [client/apiClient.ts](client/apiClient.ts) | client | `createApiClient(fetcher)`: one JSON request shape returning `ApiResult<T>` instead of throwing. Error copy: the server's `error`, else the legacy `actionErrorCopy` per-status text; a rejected fetch is "Network problem. Try again.". | [apiClient.test.ts](client/apiClient.test.ts) |
| [client/apiClient.test.ts](client/apiClient.test.ts) | test | JSON body/content-type, 204 → `data: undefined`, server copy, 401/403, 5xx, unexplained 4xx, network rejection, non-JSON error body | — |
| [client/localPref.ts](client/localPref.ts) | client | Versioned device preference over an injectable `Storage` (`{v, value}`). Wrong version, junk JSON, a `parse` rejection, SSR or a refusing storage all fall back; never throws. Legacy `calendarVisibility.ts:31` stores a raw array under `familyplanz:hiddenCalendars:<id>`, so the calendar port must read that shape once (or accept a one-time reset — owner call). | [localPref.test.ts](client/localPref.test.ts) |
| [client/localPref.test.ts](client/localPref.test.ts) | test | round trip, version mismatch, junk JSON, rejected parse, refusing storage, absent storage, clear | — |
| [client/offlineQueue.ts](client/offlineQueue.ts) | client | IndexedDB mutation queue and replay policy (2xx drop, 401/403 keep for re-auth, other 4xx drop, 5xx/network keep). IndexedDB, navigator, window, fetch and `now` are injectable; defaults are the globals plus `systemClock`. Window-listener state is module-level: the first subscribed environment wins (one window per app). | [offlineQueue.test.ts](client/offlineQueue.test.ts) |
| [client/offlineQueue.test.ts](client/offlineQueue.test.ts) | test | replay order and conflict policy, wire format, no-IndexedDB guards, online subscription — fake IndexedDB, fake fetch, fixed `now` | — |
| [client/searchBox.svelte.ts](client/searchBox.svelte.ts) | client | `SearchBox<T>` runes class: debounced query (250 ms, min two trimmed characters) with an AbortController stale-response guard; reports `failed` and `searchedFor` so a picker can tell "the search broke" from "no match", folding the three hand-rolled pickers. | [searchBox.test.ts](client/searchBox.test.ts) |
| [client/searchBox.test.ts](client/searchBox.test.ts) | test | debounce, replaced debounce, abort, late reply, trimmed minimum length, clear, failure state and clearing, `searchedFor`, whitespace-only — shared manual scheduler | — |
| [client/shareText.ts](client/shareText.ts) | client | `copyOrShare` ladder (share sheet → clipboard → selection → failed), moved from legacy `client/share.ts`; navigator and document are injectable. | [shareText.test.ts](client/shareText.test.ts) |
| [client/shareText.test.ts](client/shareText.test.ts) | test | the legacy nine cases, driven through an injected navigator/document | — |
| [client/toasts.svelte.ts](client/toasts.svelte.ts) | client | `createToasts({schedule})`: runes toast list, max four visible (oldest dropped), 6 s auto-dismiss, optional `action` (`{label, run}`) for Undo-style buttons; `memoryToasts()` records `{kind, text, action?}` for state-class tests. `Scheduler` lives in `time/scheduler.ts`. | [toasts.test.ts](client/toasts.test.ts) |
| [client/toasts.test.ts](client/toasts.test.ts) | test | ids, four-toast cap, six-second dismissal, timers for dropped toasts, action kept, memory recorder — shared manual scheduler | — |
| [ctx/actor.ts](ctx/actor.ts) | type | `Actor` (who is calling: id, email, isAdmin, via) + `actorFromUser`. Small on purpose: anything else about the person is asked of `identity`. | [endpoint.test.ts](http/endpoint.test.ts) |
| [ctx/ctx.server.ts](ctx/ctx.server.ts) | type | `Ctx`: db, clock, ids, log, limiter, faults, config. Services take it as their first argument, so tests swap any dependency without `vi.mock`. | via every test that uses `testCtx` |
| [db/database.server.ts](db/database.server.ts) | infra | `Db` (pool or transaction), `connectDb`, `withTx`. Nested transactions become savepoints. | [testDb.db.test.ts](testing/testDb.db.test.ts) |
| [db/migrations/bundledMigrations.server.ts](db/migrations/bundledMigrations.server.ts) | infra | The `sql/migrations/*.sql` files imported as `?raw`, sorted by numeric prefix: the exact set the cold-start runner replays. Must equal the files on disk. | [bundledMigrations.test.ts](db/migrations/bundledMigrations.test.ts) |
| [db/migrations/bundledMigrations.test.ts](db/migrations/bundledMigrations.test.ts) | test | parity gate: every `sql/migrations/` file is bundled, byte-identical, ascending numeric order | — |
| [db/migrations/migrationRunner.db.test.ts](db/migrations/migrationRunner.db.test.ts) | test | runner is a no-op on the already-migrated test DB; a failing file rolls back and is reported by name | — |
| [db/migrations/migrationRunner.test.ts](db/migrations/migrationRunner.test.ts) | test | `splitStatements` table: blank-line split, multi-line statements kept whole, comments-only chunks kept, blanks dropped | — |
| [db/migrations/migrationRunner.server.ts](db/migrations/migrationRunner.server.ts) | infra | `runMigrations(db, migrations?)` at cold start: `__schema_migrations` tracking, `hashtext('family-calendar:migrate')` advisory lock with a 3-attempt retry, one transaction per file, stop on first failure. Returns `{ ok: true, applied }` or `{ ok: false, applied, failed }` and never throws. Exports `splitStatements`, the split `vitestGlobalSetup.db.ts` and the db scripts follow. | [migrationRunner.db.test.ts](db/migrations/migrationRunner.db.test.ts) |
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
| [db/tables/tasks.tables.server.ts](db/tables/tasks.tables.server.ts) | schema | `tasks`'s tables, moved verbatim from the legacy schema; row types `TaskRow`, `TaskTagRow`, `TaskCompletionRow`, `TaskCategoryRow`, `TaskfocusCommandRow`, `TaskfocusSessionRow`. | schema diff ([scripts/db-schema-diff.ts](../../../scripts/db-schema-diff.ts)) |
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
| [testing/manualScheduler.ts](testing/manualScheduler.ts) | test infra | `manualScheduler()`: a `Scheduler` that records its callbacks and a `fireAll()` the test calls, so no unit test waits on real timers. One copy for every kernel client/time test. | used by [toasts.test.ts](client/toasts.test.ts), [searchBox.test.ts](client/searchBox.test.ts), [ticker.test.ts](time/ticker.test.ts) |
| [testing/seedRows.server.ts](testing/seedRows.server.ts) | test infra | `seedUser`, `uniqueSuffix`. Module-specific builders live in `<module>.fixtures.server.ts`. | [testDb.db.test.ts](testing/testDb.db.test.ts) |
| [testing/testCtx.server.ts](testing/testCtx.server.ts) | test infra | `testCtx({ db?, now?, cronSecret? })`: fixed clock, sequential ids, memory log/faults/limiter; no-db guard. | used by every test |
| [testing/testDb.server.ts](testing/testDb.server.ts) | test infra | `rollbackTest` (default: one rolled-back transaction per test), `inRollback`, `testDb`, `truncateAll` (committed mode: one transaction, FK triggers off, one `DELETE FROM` per table in one batch — a few ms idle, 70–110 ms measured on a saturated machine), lane guard. | [testDb.db.test.ts](testing/testDb.db.test.ts) |
| [testing/testDb.db.test.ts](testing/testDb.db.test.ts) | test | migrations applied, rollback isolation, savepoints, truncate, reset under 250 ms, FKs enforced after a reset, `timestamptz` rendered in UTC | — |
| [testing/testDbConfig.ts](testing/testDbConfig.ts) | test infra | Test DB URL + lane guard (kept apart from testDb because globalSetup must not import vitest). `V2_TEST_DB` picks a per-worktree database (`familycalendar_v2_test_<id>`) for parallel runs. | — |
| [testing/utcEnvironment.test.ts](testing/utcEnvironment.test.ts) | test | the unit/db/ui workers run in UTC (July offset 0 and `TZ=UTC`), the zone production's Node runs in | — |
| [testing/vitestGlobalSetup.db.ts](testing/vitestGlobalSetup.db.ts) | test infra | Rebuilds `familycalendar_v2_test` from `sql/migrations` each run, the way production's runner does, sets `synchronous_commit = off` on the throwaway database so reset commits are cheap, and pins its default `timezone = 'UTC'` so `timestamptz` renders like production on any machine. | every db run |
| [testing/vitestSetup.db.ts](testing/vitestSetup.db.ts) | test infra | Points `DATABASE_URL` (and so the legacy singleton) at the test DB; closes the pool. | every db run |
| [testing/vitestSetup.unit.ts](testing/vitestSetup.unit.ts) | test infra | Points `DATABASE_URL` at a closed port, so unit tests fail fast if they touch a database. | every unit run |
| [time/clock.ts](time/clock.ts) | infra | `Clock` port, `systemClock`, `fixedClock` (set/advance). The only source of "now" (rule R5). | [clock.test.ts](time/clock.test.ts) |
| [time/clock.test.ts](time/clock.test.ts) | test | default instant, advance/set, copy semantics | — |
| [time/dates.test.ts](time/dates.test.ts) | test | format tables, DST in New York and London, month ends, leap years, UTC+14, grouping, month math, timestamp normalisation | — |
| [time/dates.ts](time/dates.ts) | rules | `formatUsDate`, `formatClockTime`, `formatDayMonth`, `formatLongDate`, `formatShortDate`, `dayKey`, `formatDateTimeMinute`, `relativeFromNow`, `groupByDay`, `addMonthsClamped`, `startOfDayIn`, `isValidZone`, `toInstantString`. Every legacy date formatter's one home; the zone (and `now` when relative) is always a parameter, so nothing reads the clock. | [dates.test.ts](time/dates.test.ts) |
| [time/scheduler.ts](time/scheduler.ts) | infra | `Scheduler` port and `systemScheduler` (setTimeout/clearTimeout): the one home for client timers — toasts, debounced search and the ticker; tests inject `manualScheduler` instead. | through [toasts.test.ts](client/toasts.test.ts) |
| [time/ticker.svelte.ts](time/ticker.svelte.ts) | client | `Ticker`: reactive `now` refreshed from a `Clock` every N ms for countdowns and elapsed-time bands; injectable `Scheduler`, idempotent `start`/`stop`. | [ticker.test.ts](time/ticker.test.ts) |
| [time/ticker.test.ts](time/ticker.test.ts) | test | initial instant, a tick per interval, repeated ticks, stop, start twice — manual scheduler | — |
| [ui/BrandMark.svelte](ui/BrandMark.svelte) | ui | The calendar wordmark glyph, one copy (issue 095): sized by prop, `currentColor` so call sites keep their text colour, hidden from assistive tech unless given a label. | [BrandMark.svelte.test.ts](ui/BrandMark.svelte.test.ts) |
| [ui/BrandMark.svelte.test.ts](ui/BrandMark.svelte.test.ts) | test | glyph geometry, size/class/label props | — |
| [ui/DayNav.svelte](ui/DayNav.svelte) | ui | One date navigator for the dashboard header and the calendar toolbar (118, #119): links when given hrefs (an href beats a callback), buttons with callbacks when the caller navigates in place (disabled without one), and an optional leading period label inside the same pill. Members carry `daynav-today\|prev\|next`. No `$app/*`. | [DayNav.svelte.test.ts](ui/DayNav.svelte.test.ts) |
| [ui/DayNav.svelte.test.ts](ui/DayNav.svelte.test.ts) | test | one pill, labelled links/buttons, `aria-current`, leading segment, member test ids, href over callback, disabled without a callback | — |
| [ui/MentionInput.svelte](ui/MentionInput.svelte) | ui | Textarea offering `@` suggestions from a roster prop plus the caller's optional group row; inserts the picked name as text, Escape/insert lock the list. Enter belongs to the picker only while the list is open (pick, else `onsubmit`); closed or mid-composition it is left alone, so a multi-line caller keeps its newline. Text is a writable `$derived(value)`. Props in, callbacks out; no fetch, no group words. | [MentionInput.svelte.test.ts](ui/MentionInput.svelte.test.ts) |
| [ui/MentionInput.svelte.test.ts](ui/MentionInput.svelte.test.ts) | test | open/close, insert by Enter/Tab/click, Escape lock, Enter closed = newline, Enter mid-composition, submit with nothing highlighted, row test ids | — |
| [ui/colorHash.ts](ui/colorHash.ts) | rules | `nameColor` (the one #115 name hash store and contact colours take modulo their palette), `idColor` (the avatar hash, deliberately different), `initials(first, last?)`. | [colorHash.test.ts](ui/colorHash.test.ts) |
| [ui/colorHash.test.ts](ui/colorHash.test.ts) | test | pinned legacy outputs per name/id, initial rules | — |
| [ui/mentionFilter.ts](ui/mentionFilter.ts) | rules | The pure mention suggestion filter (prefix, case-insensitive, capped at a private 8) plus the prop types `MentionPerson` and `MentionEveryoneOption`. | [mentionFilter.test.ts](ui/mentionFilter.test.ts) |
| [ui/mentionFilter.test.ts](ui/mentionFilter.test.ts) | test | prefix/case/full-name matches, caps, empty cases | — |
| [ui/ConfirmAction.svelte](ui/ConfirmAction.svelte) | component | Two-step destructive control: first click asks (`ask`, default `${label}?`), cancel returns, confirm fires once; focus moves to Cancel while asking and back to the trigger after. The ask is a `role="group"` named by the question, and Esc ends at it. `variant` picks the toolbar row (`default`), a row's trash trigger with compact Yes/No (`icon`) or a form POST of `formAction` + `formFields` (`form`); a Promise from `onconfirm` keeps the ask open, disabled, on `pendingLabel`. Test ids default to `confirm-action`, `-confirm`, `-cancel`. Folds the five legacy copies. | [ConfirmAction.svelte.test.ts](ui/ConfirmAction.svelte.test.ts) |
| [ui/ConfirmAction.svelte.test.ts](ui/ConfirmAction.svelte.test.ts) | test | ask → cancel → confirm, group name, test ids, custom/default ask copy, focus round-trip, caller labels, disabled, icon variant, form variant, promised confirm, Esc | — |
| [ui/Pill.svelte](ui/Pill.svelte) | component | The one rounded chip for tags, categories and status words, with the legacy tone colours: `neutral`, `accent`, `warning`, `danger`, `success`, plus `category`/`categoryMuted` (teal, #280), `family` (indigo) and `doneCount` (orange 🔥, bold). `size="compact"` is the row chip (`text-[10px] px-1.5`), `truncate` clips to `max-w-[10rem]`. Optional `testid`. | [Pill.svelte.test.ts](ui/Pill.svelte.test.ts) |
| [ui/Pill.svelte.test.ts](ui/Pill.svelte.test.ts) | test | base shape, neutral default, tone colours, category/family/done-count legacy pairs (bold count), compact size, truncate, title hint | — |
| [ui/Sheet.svelte](ui/Sheet.svelte) | component | Modal / bottom-sheet shell: required `title` names the dialog, optional `subtitle`, focus trap, Esc (ignored once a child handled it), backdrop close, swipe-down close (`swipeToClose={false}` vetoes it), parent-owned `open`, every close path resets the drag. `testid` defaults to `sheet` and names the dialog, `-close` and `-backdrop`. Folds `EventModalShell` + `BottomSheetHandle`. | [Sheet.svelte.test.ts](ui/Sheet.svelte.test.ts) |
| [ui/Sheet.svelte.test.ts](ui/Sheet.svelte.test.ts) | test | closed/open, Esc (and a child's handled Esc), backdrop vs inside click, footer, subtitle, swipe and its veto, testids and per-sheet backdrops, focus return on `open = false`, reopen after a mid-swipe close | — |
| [ui/Skeleton.svelte](ui/Skeleton.svelte) | component | Animated placeholder rows, so a loading section keeps its height (skeletons, not blank cards). Shapes reproduce the three legacy blocks: `lines` (default), `toggle`, `row`, `chips`. `role="status"` named by `label`, and `testid` defaults to `skeleton`. | [Skeleton.svelte.test.ts](ui/Skeleton.svelte.test.ts) |
| [ui/Skeleton.svelte.test.ts](ui/Skeleton.svelte.test.ts) | test | default line count, custom count, status + label, test id, caller class, the three legacy shapes | — |
| [ui/Toaster.svelte](ui/Toaster.svelte) | component | Renders the K-07 toast list (`ToastItem` imported from `client/toasts.svelte.ts`) in one polite live region with the legacy card look, a dismiss button, and the legacy action button (`action.label` → `action.run()` then dismiss). | [Toaster.svelte.test.ts](ui/Toaster.svelte.test.ts) |
| [ui/Toaster.svelte.test.ts](ui/Toaster.svelte.test.ts) | test | empty list, every item, dismiss by id, action runs once then dismisses, a real `createToasts` list | — |
| [ui/sheetSwipe.ts](ui/sheetSwipe.ts) | rules | Pure swipe-to-close maths (legacy 100 px threshold, upward drags clamp at 0), so the sheet component holds no transitions. | [sheetSwipe.test.ts](ui/sheetSwipe.test.ts) |
| [ui/sheetSwipe.test.ts](ui/sheetSwipe.test.ts) | test | legacy threshold table, clamping, idle state | — |
| [ui/trapFocus.ts](ui/trapFocus.ts) | action | `use:trapFocus` Svelte action: Tab/Shift+Tab cycle inside the node, focus returns on destroy. Disabled, `hidden` and `inert` subtrees and `input[type=hidden]` are skipped by walking the DOM (no layout APIs). Moved from `utils/focusTrap.ts`. | [trapFocus.svelte.test.ts](ui/trapFocus.svelte.test.ts) |
| [ui/trapFocus.svelte.test.ts](ui/trapFocus.svelte.test.ts) | test | forward/backward wrap, native Tab, focus restore and listener removal, unreachable controls skipped | — |
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

Client timers (toasts, debounced search, the ticker) go through the `Scheduler` port in `time/scheduler.ts`: `systemScheduler` in real code, `manualScheduler()` (kernel/testing) in tests. Never `setInterval` in a component.
Every function parses strings by one rule (shared by the formatters and `toInstantString`):

- `yyyy-MM-dd` is that calendar day in the zone (its local midnight).
- A date-time **without** an offset is a UTC instant — Postgres `timestamp` without time zone stores UTC — then converted into the zone. `2026-10-07 13:00:00+00` and `2026-10-07T13:00:00` mean the same moment.
- A date-time **with** an offset keeps it, then converts into the zone.

`relativeFromNow` counts calendar days in the zone, so the legacy `lastUsedLabel` wording does not survive: it said "last used yesterday" for one day and bucketed elapsed 24 h blocks. The account port must keep its own legacy copy of that wording.

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
- `runMigrations` never throws. It returns `{ ok: true, applied }` when every pending file applied, or `{ ok: false, applied, failed }` when one failed: `applied` lists the files committed before it, and `failed` names the file that broke — or is `null` when the run failed outside a file (advisory lock, tracking table, unlock). A failed file is rolled back, and the next cold start retries it.
- One in-flight run is shared process-wide: a concurrent `runMigrations` call joins the first run's promise whatever `db` it passes, so only the first caller's connection is used.

### Testing

`testCtx`, `invoke*`, `rollbackTest`, `truncateAll`, `seedUser`, `manualScheduler`. The full guide is [docs/architecture/testing.md](../../../docs/architecture/testing.md).

The v2 projects pin UTC themselves: `unit`, `db` and `ui` set `test.env: { TZ: 'UTC' }` in [vite.config.ts](../../../vite.config.ts), which vitest writes into each worker before any test file loads, and the db project's globalSetup makes the test database's default time zone UTC. That is production parity (Node there runs in UTC, so Postgres renders `timestamptz` as `'2026-10-07 13:00:00+00'`), so a `npm run gate` or `npx vitest --project db` on a non-UTC machine behaves the same.

### Client

Browser-side pieces in `kernel/client`, plus `Ticker` and the `Scheduler` in `kernel/time`. They take their browser globals as injectable parameters with real defaults, so tests need no DOM and no `vi.mock`.

- `createApiClient(fetcher)` → `{ request(method, path, body?) }` returning `ApiResult<T>`; a module's `*.api.ts` wraps it with typed methods.
- `createToasts({ schedule })` → `success/error/info(text, action?)`, where `action` is `{ label, run }` for an Undo button; pass it to a state class and render `items` with kernel/ui's `Toaster` (K-08a). `memoryToasts()` records `{kind, text, action?}` for tests.
- `localPref({ key, version, fallback, parse, storage? })` → `read/write/clear` for one device preference.
- `new SearchBox(search, { debounceMs?, minLength?, schedule? })` → `query`, `results`, `failed`, `searchedFor`, `pending`, `setQuery`, `clear`.
- `new Ticker(clock, everyMs, schedule?)` → reactive `now`; call `start()` on mount and `stop()` on destroy.
- `copyOrShare(text, options, env?)` → `'shared' | 'copied' | 'cancelled' | 'failed'`.
- The offline mutation queue: `queueMutation`, `getPendingCount`, `replayPending`, `isOnline`, `subscribeToOnlineStatus`, `initOfflineSync`, plus its replay-policy helpers `sortReplayQueue`, `getReplayDisposition` and `shouldDropAfterReplay`.

### UI

Components and helpers in `kernel/ui`, imported by path. Props in, callbacks out: no `$app/*`, no domain module, no fetch.

- `Sheet` — `{ open, onclose, title, subtitle?, variant?: 'modal' | 'bottom', swipeToClose?, testid?, children, footer? }`: the dialog/sheet shell. `onclose` fires for Esc, the backdrop, the header button and a downward swipe; a child that already handled Esc (`preventDefault()`) keeps the sheet open. Test ids `testid` (default `sheet`), `${testid}-close`, `${testid}-backdrop`.
- `ConfirmAction` — `{ label, ask?, confirmLabel?, cancelLabel?, onconfirm?, variant?: 'default' | 'icon' | 'form', formAction?, formFields?, pendingLabel?, disabled?, testid? }`: the two-step destructive control. The first click only asks; `onconfirm` fires once, and a Promise it returns keeps the ask open with both buttons disabled until it settles. `variant="icon"` is a row's trash trigger, `variant="form"` POSTs `formAction` with `formFields`. Test ids `testid` (default `confirm-action`), `-confirm`, `-cancel`.
- `Pill` — `{ tone?, size?: 'default' | 'compact', truncate?, title?, testid?, children }`: the one chip. Tones `neutral | accent | warning | danger | success | category | categoryMuted | family | doneCount` (the count bold); `compact` is the row chip, `truncate` clips long names.
- `Skeleton` — `{ shape?: 'lines' | 'toggle' | 'row' | 'chips', lines?, label?, class?, testid? }`: `role="status"` placeholder named by `label` ("Loading checklist"); each shape is one legacy copy.
- `Toaster` — `{ items: ToastItem[], ondismiss: (id: number) => void }`: renders `createToasts(...).items` in one polite live region; an item's action runs, then dismisses.
- `trapFocus` — `use:trapFocus`: Tab/Shift+Tab cycle inside the node, the first control takes focus, destroy returns focus; disabled, `hidden` and `inert` subtrees and `input[type=hidden]` are skipped.
- `sheetSwipe` — `createSheetSwipe`, `startSheetSwipe`, `moveSheetSwipe`, `endSheetSwipe(state)`: pure swipe maths; `endSheetSwipe` reports `closed` past the legacy 100 px.
- `BrandMark` — `{ size?, class?, label? }`: the inline calendar glyph in `currentColor`, `aria-hidden` unless given a label.
- `DayNav` — `{ period?, isToday?, todayHref?, previousHref?, nextHref?, onToday?, onPrevious?, onNext?, leading? }`: one pill of Today/previous/next, each a link when given an href (an href beats a callback) and a disabled-until-it-has-a-callback button otherwise.
- `MentionInput` — `{ value, people?, everyone?, onsubmit?, onchange?, placeholder?, class?, id?, 'aria-label'?, testid? }`: the `@`-suggest textarea; Enter picks the highlighted row or submits while the list is open and is left alone when it is closed.
- `mentionFilter` — `filterMentions(fragment, people)` plus the prop types `MentionPerson` and `MentionEveryoneOption`.
- `colorHash` — `nameColor(name)`, `idColor(id)`, `initials(first, last?)`.

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
- `unit`, `db` and `ui` run in UTC (production's Node zone), and the test database's default `timezone` is UTC, so `timestamptz` renders as `'2026-10-07 13:00:00+00'` on any machine. Pinned by `utcEnvironment.test.ts › runs in UTC, like production` and `testDb.db.test.ts › renders timestamptz in UTC, the way production does`.
- Every `rollbackTest` leaves no rows behind, and service transactions inside it are savepoints. Pinned by `testDb.db.test.ts`.
- truncateAll resets in under 250 ms (median of 5); pinned by `testDb.db.test.ts › resets in under 250 ms`.
- truncateAll switches FK checks off only for its own transaction, so the next test's inserts are enforced again. Pinned by `testDb.db.test.ts › leaves foreign keys enforced …`.
- The migration runner is a no-op on an up-to-date database: `{ ok: true, applied: [] }`. Pinned by `migrationRunner.db.test.ts › applies nothing to the already-migrated test database …`.
- `ConfirmAction`'s first click only asks: nothing is confirmed until the confirm button is pressed. Pinned by `ConfirmAction.svelte.test.ts › asks before acting …`.
- `ConfirmAction` fires the caller's action exactly once and closes the ask in the same breath. Pinned by `ConfirmAction.svelte.test.ts › confirm calls onconfirm exactly once …`.
- A bottom sheet closes on a downward swipe of more than 100 px, and not at exactly 100. Pinned by `sheetSwipe.test.ts › tracks the downward offset and closes past the legacy 100 px threshold`, its `drag …` table and `Sheet.svelte.test.ts › closes the bottom variant on a downward swipe past the threshold`.
- Closing a sheet returns focus to the element that opened it. Pinned by `Sheet.svelte.test.ts › returns focus to the previously focused element when it closes`.
- `colorHash`'s pinned outputs never change: a name keeps its store and contact colour, and an id its avatar, across the rewrite. Pinned by `colorHash.test.ts › pins the name hash for …` and `› pins the avatar colour for …` (literals taken from the legacy functions, `colorHash.test.ts:4-7`).

## Depends on

- **May import:** kernel only (rule R1). The table files under `db/tables/` follow it too: they import their sibling tables plus the id and clock ports by relative path; [db/tables.server.ts](db/tables.server.ts) stays the one public import path.
- **Owns tables:** none: each table belongs to the module named for it in [scripts/arch/registry.mjs](../../../scripts/arch/registry.mjs) `TABLE_OWNERS`, even though its definition lives under `db/tables/`.
- **Called by:** every module, `src/lib/app`, and route files.
