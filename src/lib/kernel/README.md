# kernel

**kernel**: the platform toolkit every module builds on. It contains no domain words: no Tasks, Events or Families. Use it instead of re-solving a cross-cutting problem inside a module.

Domain words come from [CONTEXT.md](../../../CONTEXT.md). Architecture rules: [docs/architecture/rules.md](../../../docs/architecture/rules.md).

## Purpose

- **Owns:** the dependency bag (`Ctx`) and caller identity (`Actor`); the one error type; boundary validation; the HTTP builders (`endpoint`, `pageLoad`, `formAction`); clock, ids and hashing; the rate limiter; structured logs; db/transaction helpers; the test harness.
- **Does not own:** any business rule. Something like "who may edit a task" belongs in the module that owns the concept (`tasks`), even when several modules need it.
- **Client pieces** (K-07) live in `client/`: the api client, toasts, device preferences, debounced search and the offline queue; `time/ticker` is the reactive "now" for countdowns.
- **Later kernel tasks** (see [LEDGER](../../../docs/rewrite/LEDGER.md)) add the shared UI primitives: sheet, confirm button, pill, skeleton.

## Files

| file | role | what it does, and why it exists | tested by |
|---|---|---|---|
| [client/apiClient.ts](client/apiClient.ts) | client | `createApiClient(fetcher)`: one JSON request shape returning `ApiResult<T>` instead of throwing. Error copy: the server's `error`, else the legacy `actionErrorCopy` per-status text; a rejected fetch is "Network problem. Try again.". | [apiClient.test.ts](client/apiClient.test.ts) |
| [client/apiClient.test.ts](client/apiClient.test.ts) | test | JSON body/content-type, 204 → `data: undefined`, server copy, 401/403, 5xx, unexplained 4xx, network rejection, non-JSON error body | — |
| [client/localPref.ts](client/localPref.ts) | client | Versioned device preference over an injectable `Storage` (`{v, value}`). Wrong version, junk JSON, a `parse` rejection, SSR or a refusing storage all fall back; never throws. | [localPref.test.ts](client/localPref.test.ts) |
| [client/localPref.test.ts](client/localPref.test.ts) | test | round trip, version mismatch, junk JSON, rejected parse, refusing storage, absent storage, clear | — |
| [client/offlineQueue.ts](client/offlineQueue.ts) | client | IndexedDB mutation queue and replay policy (2xx drop, 401/403 keep for re-auth, other 4xx drop, 5xx/network keep). IndexedDB, navigator, window, fetch and `now` are injectable; defaults are the globals plus `systemClock`. | [offlineQueue.test.ts](client/offlineQueue.test.ts) |
| [client/offlineQueue.test.ts](client/offlineQueue.test.ts) | test | replay order and conflict policy, wire format, no-IndexedDB guards, online subscription — fake IndexedDB, fake fetch, fixed `now` | — |
| [client/searchBox.svelte.ts](client/searchBox.svelte.ts) | client | `SearchBox<T>` runes class: debounced query (250 ms, min two characters) with an AbortController stale-response guard, folding the three hand-rolled pickers. | [searchBox.test.ts](client/searchBox.test.ts) |
| [client/searchBox.test.ts](client/searchBox.test.ts) | test | debounce, replaced debounce, abort, late reply, minimum length, clear, failed search — manual scheduler | — |
| [client/shareText.ts](client/shareText.ts) | client | `copyOrShare` ladder (share sheet → clipboard → selection → failed), moved from legacy `client/share.ts`; navigator and document are injectable. | [shareText.test.ts](client/shareText.test.ts) |
| [client/shareText.test.ts](client/shareText.test.ts) | test | the legacy nine cases, driven through an injected navigator/document | — |
| [client/toasts.svelte.ts](client/toasts.svelte.ts) | client | `createToasts({schedule})`: runes toast list, max four visible (oldest dropped), 6 s auto-dismiss; `memoryToasts()` records for state-class tests. | [toasts.test.ts](client/toasts.test.ts) |
| [client/toasts.test.ts](client/toasts.test.ts) | test | ids, four-toast cap, six-second dismissal, timers for dropped toasts, memory recorder — manual scheduler | — |
| [ctx/actor.ts](ctx/actor.ts) | type | `Actor` (who is calling: id, email, isAdmin, via) + `actorFromUser`. Small on purpose: anything else about the person is asked of `identity`. | [endpoint.test.ts](http/endpoint.test.ts) |
| [ctx/ctx.server.ts](ctx/ctx.server.ts) | type | `Ctx`: db, clock, ids, log, limiter, faults, config. Services take it as their first argument, so tests swap any dependency without `vi.mock`. | via every test that uses `testCtx` |
| [db/database.server.ts](db/database.server.ts) | infra | `Db` (pool or transaction), `connectDb`, `withTx`. Nested transactions become savepoints. | [testDb.db.test.ts](testing/testDb.db.test.ts) |
| [db/tables.server.ts](db/tables.server.ts) | bridge | The one import path for Drizzle tables. Re-exports the legacy schema until task K-04 splits it per module. | n/a (re-export) |
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
| [testing/testDb.server.ts](testing/testDb.server.ts) | test infra | `rollbackTest` (default: one rolled-back transaction per test), `inRollback`, `testDb`, `truncateAll` (committed mode), lane guard. | [testDb.db.test.ts](testing/testDb.db.test.ts) |
| [testing/testDb.db.test.ts](testing/testDb.db.test.ts) | test | migrations applied, rollback isolation, savepoints, truncate | — |
| [testing/testDbConfig.ts](testing/testDbConfig.ts) | test infra | Test DB URL + lane guard (kept apart from testDb because globalSetup must not import vitest). `V2_TEST_DB` picks a per-worktree database (`familycalendar_v2_test_<id>`) for parallel runs. | — |
| [testing/vitestGlobalSetup.db.ts](testing/vitestGlobalSetup.db.ts) | test infra | Rebuilds `familycalendar_v2_test` from `sql/migrations` each run, the way production's runner does. | every db run |
| [testing/vitestSetup.db.ts](testing/vitestSetup.db.ts) | test infra | Points `DATABASE_URL` (and so the legacy singleton) at the test DB; closes the pool. | every db run |
| [testing/vitestSetup.unit.ts](testing/vitestSetup.unit.ts) | test infra | Points `DATABASE_URL` at a closed port, so unit tests fail fast if they touch a database. | every unit run |
| [time/clock.ts](time/clock.ts) | infra | `Clock` port, `systemClock`, `fixedClock` (set/advance). The only source of "now" (rule R5). | [clock.test.ts](time/clock.test.ts) |
| [time/clock.test.ts](time/clock.test.ts) | test | default instant, advance/set, copy semantics | — |
| [time/ticker.svelte.ts](time/ticker.svelte.ts) | client | `Ticker`: reactive `now` refreshed from a `Clock` every N ms for countdowns and elapsed-time bands; injectable `Scheduler`, idempotent `start`/`stop`. | [ticker.test.ts](time/ticker.test.ts) |
| [time/ticker.test.ts](time/ticker.test.ts) | test | initial instant, a tick per interval, repeated ticks, stop, start twice — manual scheduler | — |
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

### Client

Browser-side pieces in `kernel/client`, plus `Ticker` in `kernel/time`. They take their browser globals as injectable parameters with real defaults, so tests need no DOM and no `vi.mock`.

- `createApiClient(fetcher)` → `{ request(method, path, body?) }` returning `ApiResult<T>`; a module's `*.api.ts` wraps it with typed methods.
- `createToasts({ schedule })` → `success/error/info`; pass it to a state class, render `items` with the kernel Toaster. `memoryToasts()` records for tests.
- `localPref({ key, version, fallback, parse, storage? })` → `read/write/clear` for one device preference.
- `new SearchBox(search, { debounceMs?, minLength?, schedule? })` → `query`, `results`, `pending`, `setQuery`, `clear`.
- `new Ticker(clock, everyMs, schedule?)` → reactive `now`; call `start()` on mount and `stop()` on destroy.
- `copyOrShare(text, options, env?)` → `'shared' | 'copied' | 'cancelled' | 'failed'`.
- `queueMutation/getPendingCount/replayPending/isOnline/subscribeToOnlineStatus/initOfflineSync` for the offline mutation queue.

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

## Depends on

- **May import:** kernel only (rule R1). The single exception is [db/tables.server.ts](db/tables.server.ts), which re-exports the legacy schema until K-04.
- **Owns tables:** none. Table ownership is in [scripts/arch/registry.mjs](../../../scripts/arch/registry.mjs).
- **Called by:** every module, `src/lib/app`, and route files.
