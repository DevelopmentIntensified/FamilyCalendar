# Architecture Deepening Plan

Six deepening opportunities identified via the `improve-codebase-architecture` skill
(2026-09-02). Each was gated through a grilling design tree; the resolved design is
recorded below. Terminology follows `LANGUAGE.md` (module / interface / depth / seam /
locality / leverage) and `CONTEXT.md` domain vocabulary.

Scope note: all changes preserve behaviour unless stated. Each numbered item is
independent and can be done (and committed) separately.

---

## 1. Event access scope — one deep "can this user touch this Event" seam

**Friction (confirmed):** the authz rule *"a user may read/write an Event if they own it
or its Calendar is in their accessible set"* is implemented in 4 places:

| Location | Mechanism | Notes |
|---|---|---|
| `src/lib/server/utils/calendarScope.ts:10` `getAccessibleCalendarIds` | SQL query | doc-comment says "canonical" |
| `src/lib/server/utils/calendarScope.ts:25` `eventAccessFilter` | SQL WHERE fragment | used by `updateEventById:216` |
| `src/routes/api/events/[id]/+server.ts:17` `isAccessibleEvent` | in-memory predicate | private, own cal lookup |
| `src/routes/api/events/[id]/rsvp/+server.ts:11` `requireEventAccess` | DB lookup + predicate | private, re-fetches event |
| `src/routes/api/events/bulk/+server.ts:44-50,52-63` | **inline copy** of both | worst drifter |

`bulk/+server.ts` copies `getAccessibleCalendarIds` and `eventAccessFilter` verbatim
instead of importing them. No test file for `calendarScope.ts`.

**Resolved design (fork B+C):**
- Add a self-fetching `canTouchEvent(userId, eventId)` that all **single-event** routes
  call (replaces `isAccessibleEvent` + `requireEventAccess` and their duplicated lookups).
- Keep `getAccessibleCalendarIds` + `eventAccessFilter` for the batch/bulk path.
- **Move** the module from `src/lib/server/utils/calendarScope.ts` to
  `src/lib/server/db/actions/calendarScope.ts` (it hits `db` directly — the `utils/`
  home was a naming inconsistency). Update all ~7 importers.
- Keep the invariant *"accessible calendar = personal + first family"* as-is (out of
  scope to revisit multi-family membership).
- Add unit tests (the DB seam is mockable with an in-memory Calendar set).

---

## 2. Occurrence identity — one two-way module for the composite id convention

**Friction (confirmed):** the composite **Occurrence** id `${masterId}~${occurrenceISO}`
is built in one layer and parsed in others without a single owner:

| Direction | Location | Form |
|---|---|---|
| Construct (display) | `eventDisplayService.ts:68` | `${e.id}~${occ.toISOString()}` |
| Exception key build | `eventDisplayService.ts:35` | `${x.eventId}~${new Date(x.originalDate).toISOString()}` |
| Exception key lookup | `eventDisplayService.ts:51` | `${e.id}~${occIso}` |
| Parse (validated) | `eventIds.ts:6` `resolveMasterId` | split + regex — **only used by bulk** |
| Parse (raw) | `[id]/+server.ts:38,114` | `params.id.split('~')[0]` — PUT + DELETE, unvalidated |
| "this" originalDate | `[id]/+server.ts:137` `normalizeOccurrence` | `toDateTime(...).toUTC().toISO()` — 3rd ISO rendering |

The non-recurring 404 bug earlier this session lived exactly here (client id the raw
split didn't reconcile). Exception-key ISO renderings are independent and must agree or
Override matching silently breaks.

**Resolved design (fork A+B+round-trip):**
- Deepen `src/lib/server/utils/eventIds.ts` into a two-way module:
  `buildOccurrenceId(masterId, occIso)` and `resolveOccurrenceId(id)` →
  `{ masterId, occurrenceIso? }`, plus a single shared ISO-normalization helper.
- Route **both** `eventDisplayService` construction AND the `[id]` PUT/DELETE parsing
  through it (replaces raw `split('~')[0]` at `[id]/+server.ts:38,114`).
- The "this-scope" exception path derives `originalDate` **from `params.id`** (the id
  the server itself generated), not from the client-sent `body.occurrenceDate`. This
  closes the trust-in-client gap and removes `normalizeOccurrence`'s third rendering.
  (`body.occurrenceDate` kept only as a compat fallback; id is authoritative.)
- Add round-trip tests in `eventIds.test.ts`: construct→resolve exactly; non-recurring
  id (no `~`) resolves with no occurrence; malformed → null; ISO normalisation matches
  `expandRecurrence` output so override keying can't drift.

---

## 3. Personal-calendar provisioning — one `ensurePersonalCalendar`

**Friction (confirmed):** "ensure the user's **Personal Calendar** (own, no family)
exists" is hand-rolled with slightly different shapes:

| Location | Shape |
|---|---|
| `createNewUser.ts:32` | uses generic `createCalendar({ ownerId })` |
| `guestMergeService.ts:66-77` | inline select + `tx.insert` + re-select (excludes family cals, in tx) |
| `calendar/+page.server.ts:60-71` | inline select + `createUserCalendar` + re-select |
| (`families.ts:44-46`) | creates a **FAMILY** calendar — **different concept, out of scope** |

`createUserCalendar` (`calendar.ts:33`) exists but is a bare insert — it can't express
"ensure exists", so create-if-absent callers re-roll the pattern.

**Resolved design:** deepen `createUserCalendar` → **`ensurePersonalCalendar(userId, tx?)`**:
create-if-absent, filters `isNull(familyId)`, transactional, and **tx-aware** (because
`guestMergeService` must run on the same transaction — precedent: `updateEventById`
takes optional context params). Route `createNewUser`, `guestMergeService`, and
`calendar/+page.server.ts` through it. `families.createFamily` untouched.

---

## 4. Task mutation permission + recurring-vs-oneoff branch

**Friction (confirmed):** in `src/lib/server/db/actions/tasks.ts`:

- Full permission predicate (owned OR assigned OR member of task's family) duplicated
  **verbatim** in `advanceTaskToNext:439-450` and `undoRecurringCompletion:483-492`.
- Two simpler SQL-only variants in `toggleTaskComplete:364-367` (creator/assignee) and
  `toggleTaskCompleteFamily:413-416` (family).
- Recurring-vs-oneoff toggle branch (`!completedAt && recurrenceFrequency → advance,
  else toggle`) duplicated in `toggleTaskComplete:372-375` and
  `toggleTaskCompleteFamily:419-422`.
- `advanceRecurringTask` (advance-on-complete) vs `advanceTaskToNext` (skip) are
  semantically different — **do not** merge those.

**Resolved design (fork "unify rule, keep 2 entry points"):**
- Extract ONE predicate `canMutateTask(task, userId)` (owned OR assigned OR member of
  task's family; family-membership is the only DB-backed leg) used by
  `advanceTaskToNext`, `undoRecurringCompletion`, AND both toggles.
- `toggleTaskCompleteFamily` stays a separate exported entry (the route decides which
  to call) but reuses the same predicate.
- Extract the shared recurring-vs-oneoff toggle branch into one helper both toggles call.

---

## 5. Day Dashboard god-route — composition + extract inline db

**Friction (confirmed):** `src/routes/(calendar)/calendar/dashboard/+page.server.ts`
(~306 lines) mixes raw `db` calls beside actions-layer imports, orchestrates ~10
domains, and gates some fetches by **Dashboard Module** visibility inconsistently.
Registry truth (`src/lib/dashboardModules.ts:7-15`): events are **not** a toggleable
module, so family events must stay ungated (they feed the always-shown day list).

The exploration flagged `setFamilyModuleSwitch` as a "dead export" — **verified FALSE**:
it is called by `family/[familyId]/+page.server.ts:181`. Do not remove it.

**Resolved design:**
- Refactor `load` into a thin composition; extract inline raw `db` blocks into named
  data-retrieval functions in `src/lib/server/db/actions/dashboard.ts` (unit-testable
  like the existing pure `rankTop3`):
  - `getFamilyCalendarEvents(familyId)` (110-115)
  - attendance rows for family event ids (174-184)
  - Kids' Schedule child-attendance rows (206-220)
  - `getCompletionTimestamps(userId)` (272-277)
- Keep base family-events fetch **ungated** (correct by registry truth).
- Tighten the attendance/kids gating to use `modules.*` consistently.
- Keep `setFamilyModuleSwitch` (it is called).

---

## 6. Shared NLP date/recurrence vocabulary

**Friction (confirmed):** `taskQuickAdd.ts` (client) and `naturalLanguageService.ts`
(server) carry parallel month/weekday/recurrence vocabulary. `naturalLanguageService`
already delegates to `src/lib/server/utils/dateParsing.ts` (`MONTH_ALT`, `MONTH_MAP`,
`DAY_MAP`, `DAY_ALT`, `normalizeTime`, `applyPeriod`, `escapeRegExp`), but
`taskQuickAdd.ts` re-declares all of it inline:

- `escapeRegExp` duplicated verbatim (`dateParsing.ts:30` vs `taskQuickAdd.ts:169`).
- Month tables differ (`dateParsing.MONTH_ALT/MAP` vs `taskQuickAdd.MONTH_NAME/INDEX`).
- Weekday tables differ (`DAY_ALT` has no short forms; `taskQuickAdd.WEEKDAY_TOKEN` does).

**Constraint:** the parsers differ in date arithmetic (native `Date` end-of-day-local
vs Luxon zoned `DateTime`) and output shapes (`TaskFrequency + interval` vs loose
string like `'every_2_weeks'`) — those are **not** shareable.

**Resolved design (fork "shared client-safe vocab only"):**
- Create a client-safe shared module `src/lib/utils/dateVocab.ts` with: month names,
  weekday names (incl. short forms), recurrence unit words, and `escapeRegExp`.
- Both `taskQuickAdd.ts` and `naturalLanguageService.ts` (via `dateParsing.ts`
  re-exporting from it, or importing directly) build on it.
- Do NOT unify Date-vs-Luxon arithmetic or the differing recurrence output shapes —
  share only the input grammar.
- TDD: exhaustive vocabulary table tests (per AGENTS.md NLP rule: table-driven,
  many colloquial/word-order variants).

---

## Cross-cutting notes

- **NLP rule keeps the floor:** any change touching `naturalLanguageService` /
  `taskQuickAdd` must keep the existing ~94-phrase suite green, and adds its own
  exhaustive vocab table tests.
- Each item is independently committable; `npm run build` + unit + e2e must pass before
  pushing to `test`.
- No ADR re-litigation: none of these contradict ADR-0001.
