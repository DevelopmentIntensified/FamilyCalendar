# Port sheet: kernel

**kernel** · kernel tasks K-04..K-08 · home: `src/lib/kernel/` · README after the port: [src/lib/kernel/README.md](../../../src/lib/kernel/README.md)

Platform toolkit: ctx ports (db, clock, ids, log, limiter, faults), errors, validation, HTTP builders, test harness, shared client/UI primitives.

- **May import:** kernel only.
- **Owns tables:** none.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
- **Playbook:** [kernel-tasks.md](../playbooks/kernel-tasks.md).

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- 401 body exactly `{"error":"Unauthorized"}`; 403 `{"error":"Forbidden"}` (Android error table).
- Rate-limit keys `${scope}:${ip}` identical to legacy `clientKey` (shared buckets).
- Row ids stay 15-char a-z0-9; secret hashes byte-identical (sha256 hex).
- Service worker cache keys bump rule (AGENTS.md) when brand assets / manifest / app.html change.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| none | — | — | — | — | — | kernel owns no `src/routes/api/**/+server.ts` (census route list is empty) |

### Rules the module must keep
**Dates and times — exact output formats**
- `formatDate(DateTime | ISO string | Date)` → `MM-dd-yyyy`, e.g. `01-15-2024`, `05-03-2024`; the ISO branch only checks "is a string", so junk renders `Invalid DateTime` — `src/lib/utils/dateUtils.ts:46-55` · test: `src/lib/utils/dateUtils.test.ts` › "formats date as MM-dd-yyyy"
- `formatEventTime(...)` → `h:mm a`, e.g. `2:05 PM`; `''` for null/undefined/unparseable/invalid — `src/lib/utils/eventTime.ts:17-23`
- `formatDateTimeInZone(dt, zone)` → Luxon `toISO()` in that zone, e.g. `2024-06-15T10:00:00.000-04:00` (offset kept), `''` when invalid — `src/lib/utils/dateUtils.ts:66-68` · test › "preserves timezone in ISO string"
- `parseDateTimeInZone('2024-03-15 10:00', zone)` accepts the space separator, swaps it for `T`, parses in the given zone — `dateUtils.ts:62-64` · test › "parses datetime string with user timezone"
- `getTimeZoneOffset(zone)` → Luxon `ZZ`, e.g. `-04:00` (matches `/^[+-]\d{2}:\d{2}$/`) — `dateUtils.ts:79-81` · test › "returns offset string for valid timezone"
- `relativeTime(iso)` → Luxon `toRelative()`, e.g. `12 minutes ago`; `''` for null/undefined/empty/invalid — `dateUtils.ts:88-91` · tests › "renders a past timestamp as a relative stamp", "returns an empty string rather than \"Invalid DateTime\" for junk input"
- `isValidTimeZone` rejects unknown zones and fixed-offset zones (`zoneName === 'fixed'`) — `dateUtils.ts:74-77` · test › "returns false for invalid timezone"
- `parseDate('01-15-2024')` splits on `-` as month-day-year into a local `Date` at midnight — `dateUtils.ts:57-60` · test › "parses date string in MM-dd-yyyy format"
- calendar grid is 1-based (`Monday=1 … Sunday=7`); `getDaysInMonth` falls back to 30 and the first-weekday helpers to 7 when Luxon yields nothing — `dateUtils.ts:5-18` · test › "returns 1 for January 2024 (Monday)"
- `startOfWeekFor(date, weekStart)`: `"monday"` (case-insensitive) → ISO week start; any other value → Sunday-first (`minus({ days: weekday % 7 })`) — `dateUtils.ts:27-30`
- `convertToUserTimeZone` is `setZone` (same instant, new zone); kept as a named wrapper — `dateUtils.ts:70-72` · test › "converts datetime to specified timezone"

**Toasts**
- `pushToast` appends at most 4 toasts (`slice(-3)` plus the new one), ids increase from 1, each auto-dismisses after 6000 ms — `src/lib/client/toasts.ts:14-21`
- Toast is `{ id, message, actionLabel?, onAction? }`; the action runs first, then the toast is dismissed — `toasts.ts:3-9`, `src/lib/components/Toaster.svelte:4-7`
- `dismissToast(id)` filters by id from the Svelte `writable<Toast[]>` — `toasts.ts:11,23-25`

**Offline mutation queue (IndexedDB)**
- Storage: db `familyplanz-offline` v1, store `mutationQueue`, `keyPath: 'id'` autoIncrement, `createdAt` index; record `{ id?, url, method, body, createdAt }` — `src/lib/utils/offline.ts:1-11,54-62`
- Replay is oldest-first by `id` (missing id sorts as 0, input not mutated) — `offline.ts:21-23` · test: `src/lib/utils/offline.test.ts` › "sortReplayQueue replays oldest-first by id"
- Status policy: 2xx `applied` (drop); 401/403 `retry` (keep for re-auth); other 4xx `discarded` (drop, never retried); 3xx/5xx `retry`; network throw counts failed and keeps the record — `offline.ts:36-46,130-163` · tests › "getReplayDisposition treats 401/403 as retry (auth failure, not permanent)", "network errors keep the record for a later attempt"
- Replay wire format: `content-type: application/json` and `JSON.stringify(body)` only when body is neither `null` nor `undefined`; a queued explicit `null` body sends neither — `offline.ts:139-145` · tests › "sends no content-type/body when the queued body is null"
- No IndexedDB (SSR/node): `queueMutation` no-op, `getPendingCount` 0, `replayPending` `{applied:0,failed:0}` — `offline.ts:101-111,131` · test › "queueMutation is a no-op, getPendingCount is 0, replayPending is empty"
- `isOnline()` is true when `navigator` is absent, else `navigator.onLine`; `subscribeToOnlineStatus` calls back immediately then on every online/offline change, returning an unsubscribe — `offline.ts:166-196` · test › "reflects navigator.onLine and calls back immediately"
- `initOfflineSync` registers one `online` listener, replays once at startup, and calls `onChange` after each replay — `offline.ts:207-224`

**Share / copy ladder**
- `copyOrShare(text, {share?,title?,text?})` returns `'shared' | 'copied' | 'cancelled' | 'failed'`: share sheet only when `share` is true and present; a dismissed sheet (`AbortError`) is `'cancelled'`, not failure; any other share throw falls through to the clipboard — `src/lib/client/share.ts:26,64-77` · test: `src/lib/client/share.test.ts` › "reports a share the person cancelled as cancelled, not as a failure"
- Clipboard path uses `navigator.clipboard.writeText`; denied/absent falls to a throwaway fixed, opacity-0, readonly textarea + `execCommand('copy')`, always removed; otherwise `'failed'` — `share.ts:46-61,79-89` · tests › "does not leave the throwaway field behind when the copy is refused", "says it failed rather than claiming a copy it did not make"

**Focus trap**
- `trapFocus(container)` cycles Tab/Shift+Tab among `a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])`; wraps from last→first and first→last — `src/lib/utils/focusTrap.ts:1-32`
- Initial focus goes to the container when `tabindex="-1"`, else the first focusable; teardown restores the previously focused element only while still connected — `focusTrap.ts:34-45`
- `trapFocusAction` is the Svelte action form (`destroy` = teardown) — `focusTrap.ts:48-50`

**Rate limiting**
- In-process sliding window per `key`; `rateLimit(key, limit, windowMs)` prunes stamps older than the window, returns false at the limit, otherwise records now — `src/lib/server/utils/rateLimit.ts:3-22`
- `clientKey(request, scope)` → exactly `${scope}:${ip}`; ip = `x-real-ip`, else first hop of `x-forwarded-for`, else `local`; blank trims to `local` — `rateLimit.ts:28-35`
- `clearRateLimitState()` is test-only; buckets are per-server-instance module state — `rateLimit.ts:39-41`

**Logging**
- One line per event: `JSON.stringify({ ts: <UTC ISO>, level, event, ...context })`; `error`→`console.error`, `warn`→`console.warn`, both others `console.log` — `src/lib/server/services/logger.ts:19-44` · test: `src/lib/server/services/logger.test.ts` › "always parses back as exactly one line (no formatting embedded)"
- `captureError(err, ctx)` logs level `error`, event `captured_error`, with `error_type`/`message`/`stack` for an `Error` else `message: String(err)` — `logger.ts:50-58` · tests › "forwards an Error as structured console.error with type/message/stack", "handles non-Error throwables without crashing"

**Auth guards**
- `requireUser(locals)` throws SvelteKit `error(401, 'Unauthorized')`; `requireUserJson` returns `json({error:'Unauthorized'},{status:401})`; `requireUserAction` returns `fail(401,{success:false,error:'Not signed in'})` — `src/lib/server/utils/requireUser.ts:8-12,27-33,47-53`
- `guard(label, fallback, fn)` catches any throw, logs `[load] section "<label>" failed, serving fallback:`, returns `{data:fallback, error:label}`; success is `{data, error:null}` — `src/lib/server/utils/guard.ts:9-20` · test: `src/lib/server/utils/guard.test.ts` › "returns the fallback plus the label when the loader throws"

**Boundary and id helpers**
- `readJsonObject`: empty/whitespace body → `{ok:true,value:{}}`; malformed JSON, `null`, array, or non-object → `400 {"error":"Invalid JSON"}` — `src/lib/server/utils/jsonBody.ts:8-29`
- `generateId(n)` is `@oslojs/crypto` random over `abcdefghijklmnopqrstuvwxyz0123456789`; rows use 15, invite codes 10 — `src/lib/server/utils/generateId.ts:11-21`
- `clampCount(value,min,max,fallback)` falls back on null/undefined/`''`/non-finite, truncates, then clamps — `src/lib/server/utils/clampCount.ts:8-13`
- `pickWritableFields(data, fields)` drops every key outside the allow-list and every key whose value is `undefined` — `src/lib/server/utils/pickWritableFields.ts:3-11`
- `safeRedirectPath(raw, fallback='/calendar')` accepts only a single-slash relative path; rejects `//`, `\`, control chars, encoded CR/LF, and cross-origin URLs — `src/lib/utils/safeRedirect.ts:7-22` · test: `src/lib/utils/safeRedirect.test.ts` › "same-origin relative paths only"
- `actionErrorCopy(action, serverMessage?, status?)` returns the server message verbatim when present; else the per-action prefix plus: 401/403 "Your session expired. Sign in, then try again."; undefined/5xx "Check your connection (a VPN can block it), then try again."; other 4xx "Check the details you entered, then try again." — `src/lib/utils/actionError.ts:3-31` · test: `src/lib/utils/actionError.test.ts` › "says to sign in again when the session was rejected"
- Two deterministic colour hashes, deliberately distinct: `avatarColor` sums char codes over an 8-entry Tailwind palette; `hashName` uses `charCode + ((hash<<5)-hash)` for name→colour — `src/lib/utils/avatarColor.ts:1-17`, `src/lib/utils/hashName.ts:10-13` · tests › "always returns a member of the palette", "is deterministic for the same name"
- `getUrl()` hardcodes `https://familyplanz.com`, dev `http://localhost:5173`, test `https://test.familyplanz.com` — `src/lib/utils/getUrl.ts:3-10`
- `sendEmail` returns `{success:true,error:undefined,data}` or `{success:false,error}` from Resend; it does not throw on a provider error — `src/lib/utils/sendEmail.ts:12-23`

**Migrations runner** (moved by K-05 to `src/lib/kernel/db/migrations/`; the line references below cite the pre-move legacy files at `a88c086`)
- Runs at cold start from `hooks.server.ts` unless `DATABASE_DISABLE_MIGRATIONS`; in-process `inFlight` dedupes concurrent calls — `src/lib/server/db/migrations/runner.ts:41-54`, `src/hooks.server.ts:19-21`
- Advisory lock `pg_advisory_lock(hashtext('family-calendar:migrate'))`, 3 attempts with 1500 ms × attempt backoff, always unlocked in `finally` — `runner.ts:58-75,105-109`
- Tracking table `__schema_migrations(name text primary key, appliedAt timestamptz default now())`; pending = bundled files whose `name` is absent — `runner.ts:23-33,77-81`
- One transaction per file: every statement split on blank lines, executed in order, then the tracking insert; a failure logs and `break`s the remaining queue — `runner.ts:84-101,112-118`
- Bundled migrations are imported as `?raw` and sorted by numeric prefix (`localeCompare(..., {numeric:true})`); 27 files, `0000-baseline-tables.sql` … `025-taskfocus-sessions.sql` — `src/lib/server/db/migrations/scripts.ts:6-75`
- `getLastMigrationRun()` exposes `{key, ok, applied, error?}` — `runner.ts:120-122` — removed in K-05 (no caller)

**Schema (`schema.ts`, 1227 LOC)**
- 44 `pgTable`s: users, userSettings, discounts, userDiscounts, subscriptions(`activeSubscriptions`), subscriptionTypes, accounts, codes, authSession, authAccount, authVerification, familyMembers, familyInviteCodes, families, dashboardModuleSwitches, meals, calendars, eventAttendance, aiUsageTracking, events, eventExceptions, claimTokens, apiTokens, taskfocusCommands, taskfocusSessions, tasks, taskCategories, bills, receiptItems, itemTags, taskTags, taskCompletions, notifications, adEvents, adConsentRecords, childConsentRecords, waitlist, unmatchedPhrases, bugReports, groceryItems, groceryStoreMemory, groceryStoreColours, pushSubscriptions, deviceTokens — `src/lib/server/db/schema.ts:18-1220`
- Row ids are `text` primary keys defaulting to `generateId(15)`; compound keys: `familyMembers(user_id,family_id)`, `userDiscounts(user_id,discount_id)`, `accounts(provider,providerAccountId)` — `schema.ts:18-21,105-118,197-215,282-297`
- No pg enums: closed vocabularies are plain `text` — `tasks.visibility` default `'public'` with `TASK_VISIBILITIES = ['public','private']`, `tasks.priority` default `'normal'`, `tasks.assignmentStatus` default `'none'`, `notifications.type` (set owned by `src/lib/utils/notificationTypes.ts`) — `schema.ts:627-646,695,862-880`
- Timestamps mix `mode:'date'` and `mode:'string'`; event/task/notification instants use `withTimezone: true`; `users.roles` is `json` default `[]` notNull; `users.email` is unique but nullable (Anonymous Accounts have none) — `schema.ts:18-45,430-470,615-655`
- `schema.ts` re-exports `BILL_CATEGORIES`/`BillCategory` from `$lib/data/categories`; no table uses them (census note) — `schema.ts:703-707`

### Page and UI behaviour worth keeping
- Toaster renders only when non-empty: fixed bottom bar (`bottom-20`, `md:bottom-6`), `z-[70]`, `print:hidden`, `role="region"` + `aria-label="Notifications"`; each toast is `role="status"` with the message, an optional action button (e.g. "Undo") and a close button labelled "Dismiss notification" — `src/lib/components/Toaster.svelte:9-40`
- Toast messaging (including Undo) is caller-owned; the toast layer owns mechanics and the 6 s dismissal — `src/lib/client/toasts.ts:1-2`, `share.ts:9-12` (same principle for copy outcomes)

### Probably accidental (candidates to drop, owner to confirm)
- `formatDate` treats every string as an ISO date, so a junk string renders the literal `Invalid DateTime` instead of `''` — `src/lib/utils/dateUtils.ts:46-49` — inconsistent with `relativeTime`/`formatEventTime`, which guard for `''`
- `initOfflineSync` returns a no-op cleanup and never removes its `online` listener; `syncInitialized` makes later calls only sync, so a caller cannot unsubscribe — `src/lib/utils/offline.ts:207-224` — cleanup contract implied by the return type
- `pushToast` keeps only the last 4 toasts but still schedules a dismissal timer for every dropped toast — `src/lib/client/toasts.ts:17-19` — timers for objects no longer rendered
- `rateLimit` mutates the stored array in place and never evicts a key whose traffic stopped — `src/lib/server/utils/rateLimit.ts:8-21` — unbounded map growth per distinct IP
- `runInLock` logs a failed migration, skips all remaining files, yet returns `{ok:true}` and records `lastRun.ok = true` — `src/lib/server/db/migrations/runner.ts:97-103` — a partial schema reports success
- `splitStatements` splits on blank lines only, so a statement containing a blank line (function body, multi-line string) would be cut in half — `runner.ts:112-118` — file-format assumption not enforced
- `logger` stamps `ts` from wall clock rather than the kernel clock port; `guard` logs through `console.error` rather than the `Log` port — `src/lib/server/services/logger.ts:36-38`, `src/lib/server/utils/guard.ts:17` — K-05 seam bypass
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#029](../../archive/issues/029-privacy-audit.md) PII (emails, ids) in server logs; adEvents retention ruling; unmatched-phrase URL redactio… | SECURITY | FIX-IN-PORT for new code (kernel log rule: never log emails/bodies); retention + redaction stay tickets |
| [#122](../../archive/issues/122-port-approved-prototype-changes.md) Verify every approved prototype mark shipped, one pinning test per mark. | DESIGN | keep markup |
| [#137](../../archive/issues/137-parity-worst-route-first.md) Parity harness loop on the worst route. | DESIGN | keep markup |
| [#170](../../archive/issues/170-two-orange-fork.md) Terracotta vs primary orange. | OWNER | owner |
| [#171](../../archive/issues/171-tracking-gray-drift.md) Tracking/gray/radius drift. | DESIGN | keep markup |
| [#172](../../archive/issues/172-touch-targets-below-44px.md) Touch targets below 44px. | DESIGN | keep markup; kernel/ui components keep legacy sizes |
| [#173](../../archive/issues/173-focus-rings-missing.md) Missing focus-visible rings. | DESIGN | keep markup |
| [#178](../../archive/issues/178-no-soft-deletes.md) Soft deletes or a recorded waiver. | SCHEMA | owner |
| [#179](../../archive/issues/179-db-structural-risks.md) Pooled URL + max connections, CONCURRENTLY, timezone normalization, RTL/emoji round-trip. | SCHEMA | keep; kernel connectDb keeps max 10 like the legacy pool |
| [#182](../../archive/issues/182-no-schema-validation.md) Schema validation at every boundary. | SECURITY | FIX-IN-PORT: zod schemas on every endpoint/action as each module ports; close when census is 0 |
| [#183](../../archive/issues/183-no-observability.md) Sentry + uptime monitor. | OWNER | owner; kernel Log is the seam |
| [#192](../../archive/issues/192-muted-text-contrast.md) Muted text contrast ≥ 4.5:1, 12px floor. | DESIGN | keep markup |
| [#193](../../archive/issues/193-emoji-as-ui.md) Emoji as meaning-bearing UI. | OWNER | owner |
| [#322](../../archive/issues/322-desktop-theme-prototype.md) Desktop theme prototype variants. | DESIGN | prototype branch only |

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# kernel: 6% ported

legacy source files left (41/44, 3727 LOC):
  - src/lib/client/share.ts (90 LOC, client) importers: 3
  - src/lib/client/toasts.ts (26 LOC, client) importers: 24
  - src/lib/components/DayNav.svelte (126 LOC, ui) importers: 2
  - src/lib/components/MentionInput.svelte (280 LOC, ui) importers: 4
  - src/lib/components/MentionInputHarness.svelte (17 LOC, ui) importers: 0
  - src/lib/components/Toaster.svelte (51 LOC, ui) importers: 6
  - src/lib/components/brand/Mark.svelte (57 LOC, ui) importers: 3
  - src/lib/components/calendar/BottomSheetHandle.svelte (22 LOC, ui) importers: 2
  - src/lib/components/calendar/bottomSheetSwipe.ts (74 LOC, ui) importers: 2
  - src/lib/conformance/collect.ts (57 LOC, testing/conformance) importers: 1
  - src/lib/conformance/rules.ts (154 LOC, testing/conformance) importers: 2
  - src/lib/conformance/tokens.ts (97 LOC, testing/conformance) importers: 2
  - src/lib/server/db/index.ts (9 LOC, db) importers: 5
  - src/lib/server/db/schema.ts (1227 LOC, db) importers: 87
      NOTE: Only re-exports BILL_CATEGORIES (no table uses it). Task K-04 splits tables into src/lib/kernel/db/tables/<module>.tables.ts and drops the re-export; bills owns the vocabulary.
  - src/lib/server/db/testHarness.ts (52 LOC, testing) importers: 0
  - src/lib/server/services/fcmService.ts (250 LOC, push) importers: 2
  - src/lib/server/services/llm.ts (64 LOC, ai) importers: 4
  - src/lib/server/services/logger.ts (59 LOC, log) importers: 3
  - src/lib/server/utils/clampCount.ts (14 LOC, http) importers: 1
  - src/lib/server/utils/generateId.ts (22 LOC, ids) importers: 7
  - src/lib/server/utils/guard.ts (21 LOC, http) importers: 6
  - src/lib/server/utils/jsonBody.ts (29 LOC, http) importers: 16
  - src/lib/server/utils/pickWritableFields.ts (12 LOC, http) importers: 2
  - src/lib/server/utils/rateLimit.ts (42 LOC, ratelimit) importers: 28
  - src/lib/server/utils/requireUser.ts (54 LOC, http) importers: 61
  - src/lib/server/utils/svixVerify.ts (68 LOC, http) importers: 1
  - src/lib/utils/actionError.ts (31 LOC, client) importers: 2
  - src/lib/utils/avatarColor.ts (17 LOC, util) importers: 11
  - src/lib/utils/contactColors.ts (32 LOC, util) importers: 3
  - src/lib/utils/dateUtils.ts (92 LOC, time) importers: 10
  - src/lib/utils/eventTime.ts (24 LOC, time) importers: 14
  - src/lib/utils/focusTrap.ts (51 LOC, ui) importers: 11
  - src/lib/utils/getUrl.ts (12 LOC, env) importers: 10
  - src/lib/utils/hashName.ts (14 LOC, util) importers: 2
  - src/lib/utils/mentionFilter.ts (28 LOC, ui) importers: 1
  - src/lib/utils/offline.ts (225 LOC, client) importers: 5
  - src/lib/utils/safeRedirect.ts (21 LOC, util) importers: 3
  - src/lib/utils/sendEmail.ts (23 LOC, mail) importers: 11
  - src/lib/utils/testDom.ts (51 LOC, testing) importers: 0
  - src/lib/utils/touchTarget.ts (115 LOC, ui) importers: 0
  - src/lib/utils/typeGuards.ts (17 LOC, util) importers: 4

route files not yet wiring-only (0/0):

legacy test files left (21/22) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/client/share.test.ts [pure, 9 tests]
  - src/lib/components/DayNav.svelte.test.ts [component, 7 tests]
  - src/lib/components/MentionInput.svelte.test.ts [component, 14 tests]
  - src/lib/components/brand/Mark.svelte.test.ts [component, 6 tests]
  - src/lib/components/calendar/BottomSheetHandle.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/bottomSheetSwipe.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/bottomSheetSwipe.test.ts [pure, 3 tests]
  - src/lib/conformance/rules.test.ts [pure, 13 tests]
  - src/lib/conformance/tokens.test.ts [pure, 12 tests]
  - src/lib/server/services/fcmService.test.ts [pure, 18 tests]
  - src/lib/server/services/logger.test.ts [pure, 4 tests]
  - src/lib/server/utils/guard.test.ts [pure, 3 tests]
  - src/lib/server/utils/svixVerify.test.ts [pure, 8 tests]
  - src/lib/utils/actionError.test.ts [pure, 8 tests]
  - src/lib/utils/avatarColor.test.ts [pure, 3 tests]
  - src/lib/utils/dateUtils.test.ts [pure, 45 tests]
  - src/lib/utils/hashName.test.ts [pure, 4 tests]
  - src/lib/utils/mentionFilter.test.ts [pure, 12 tests]
  - src/lib/utils/offline.test.ts [pure, 24 tests]
  - src/lib/utils/safeRedirect.test.ts [pure, 1 tests]
  - src/lib/utils/touchTarget.test.ts [pure, 4 tests]
```
<!-- census:end -->
