# kernel

**kernel**: the platform toolkit every module builds on. It contains no domain words: no Tasks, Events or Families. Use it instead of re-solving a cross-cutting problem inside a module.

Domain words come from [CONTEXT.md](../../../CONTEXT.md). Architecture rules: [docs/architecture/rules.md](../../../docs/architecture/rules.md).

## Purpose

- **Owns:** the dependency bag (`Ctx`) and caller identity (`Actor`); the one error type; boundary validation; the HTTP builders (`endpoint`, `pageLoad`, `formAction`); clock, ids and hashing; the rate limiter; structured logs; db/transaction helpers; the test harness.
- **Does not own:** any business rule. Something like "who may edit a task" belongs in the module that owns the concept (`tasks`), even when several modules need it.
- **Later kernel tasks** (see [LEDGER](../../../docs/rewrite/LEDGER.md)) add the shared client and UI primitives: the api client, toasts, sheet, confirm button, pill, skeleton, date formatting.

## Files

| file | role | what it does, and why it exists | tested by |
|---|---|---|---|
| [ctx/actor.ts](ctx/actor.ts) | type | `Actor` (who is calling: id, email, isAdmin, via) + `actorFromUser`. Small on purpose: anything else about the person is asked of `identity`. | [endpoint.test.ts](http/endpoint.test.ts) |
| [ctx/ctx.server.ts](ctx/ctx.server.ts) | type | `Ctx`: db, clock, ids, log, limiter, faults, config. Services take it as their first argument, so tests swap any dependency without `vi.mock`. | via every test that uses `testCtx` |
| [db/database.server.ts](db/database.server.ts) | infra | `Db` (pool or transaction), `connectDb`, `withTx`. Nested transactions become savepoints. | [testDb.db.test.ts](testing/testDb.db.test.ts) |
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

Read `ctx.clock.now()`. Pass "now" into rules as a parameter. Date formatting helpers arrive in task K-06.

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

### Testing

`testCtx`, `invoke*`, `rollbackTest`, `truncateAll`, `seedUser`. The full guide is [docs/architecture/testing.md](../../../docs/architecture/testing.md).

## How to test

- `npm run test:mod -- kernel` runs the unit and db projects for this folder.
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

## Depends on

- **May import:** kernel only (rule R1). The [db/tables.server.ts](db/tables.server.ts) barrel is no exception any more: the tables live under `db/tables/` and import their siblings plus the id and clock ports.
- **Owns tables:** none. Table ownership is in [scripts/arch/registry.mjs](../../../scripts/arch/registry.mjs).
- **Called by:** every module, `src/lib/app`, and route files.
