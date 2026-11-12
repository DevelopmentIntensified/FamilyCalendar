# calendar

**domain** — Calendars, Events, Recurring Event expansion, Exception Overrides, family mirrors, attendance/RSVP, ICS import/export, bulk edits, event UI.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- **Owns:** Calendars (the personal one and each family's); Events and their Recurring Event expansion into occurrences; Exception Overrides; the family mirror copy of a personal Event; attendance, RSVP and guest names; the .ics export and the parse → preview → commit (+ undo) import; bulk edits; the printable month; the location search behind the event form.
- **Does not own:** who the viewer is and their time zone/colour settings (`identity`); Family membership and the roster (`family`); the push transport that carries `events_changed` (`alerts`); natural-language date phrases (`parsing` — calendar owns only the bulk-edit plan and the recurrence vocabulary); Sponsored Events (`sponsored` — they render through this module's chip vocabulary but are served elsewhere); Tasks attached to an Event (`tasks`).

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [README.md](README.md) | doc | This file: the module's rules, interface and evidence. | — |
| [index.ts](index.ts) | entry | Public isomorphic interface: contract types, pure rules (occurrence ids, recurrence expansion, ICS text, range contract, bulk plan, import plan), client api. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: services and the `endpoint()` handlers the route files re-export. | — |
| [ui/index.ts](ui/index.ts) | entry | Public components: the event modal and its parts, RSVP row, export menu, attendee picker, location search. | — |
| [calendar.events.http.db.test.ts](calendar.events.http.db.test.ts) | test | Golden contract for `GET`/`POST /api/events`, `PUT`/`DELETE /api/events/[id]`, the rsvp pair and the .ics export (S2). | — |
| [calendar.bulk.http.db.test.ts](calendar.bulk.http.db.test.ts) | test | Golden contract for `POST /api/events/bulk`, `GET /api/calendars`, `GET /api/print`, `GET /api/location-search` (S2). | — |
| [calendar.import.http.db.test.ts](calendar.import.http.db.test.ts) | test | Golden contract for `GET /api/import` and `POST /api/import/{preview,commit,undo}` (S2). | — |

## Public interface

Designed before implementation (S1). Small and deep: each service hides one use-case whole, so no caller reassembles a rule.

**`index.ts` — rules and contracts** (pure: "now", the viewer's zone and the rows are parameters):

- `buildOccurrenceId` / `resolveOccurrenceId` / `normalizeOccurrenceIso` — the ONE occurrence-id format (`{masterId}~{UTC ISO}`). Deleting them would paste the separator and the ISO rendering into five callers, which is exactly how override keys drifted before.
- `expandRecurrence`, `scheduleStep`, `recurrenceUntilInstant` — a Recurring Event becomes occurrence instants in `[start, end)`; `scheduleStep` is the single frequency+interval stepper the rest of the app borrows.
- `normalizeEventRecurrence`, `describeRecurrence` — the recurrence write shape and its one human label ("every 2 weeks"); folding these into callers is what produced four `freqNoun` copies.
- `resolveEventRange`, `eventRangeWindow` — the ranged-read contract (both ends, ordered, ≤ 62 days) and its padded expansion window.
- `canMutateEventRow`, `eventAccessFilter` — the write leg and the read filter, as predicates over ids (the queries stay in the repo).
- `normalizeInvites`, `shiftException` — invite normalization and the exception-slot shift the master-move needs.
- `parseIcs`, `buildIcsEvent`, `buildIcsCalendar`, `escapeIcsText`, `buildRrule`, `icsFilename` — RFC 5545 in both directions.
- `dedupeKey`, `buildFilePreview`, `defaultSelection`, `planCommit`, `planUndo` — the import's plan: what is a duplicate, what is ticked, what undoes.
- `planBulkEdits`, `parseBulkPlan` — the deterministic bulk instruction parser and the re-validation of a client-posted plan.
- `printGrid` — the month grid arithmetic (weeks, padding, cell items) that the print service renders.
- `describeEventChip` / the chip vocabulary — one vocabulary for timed/allDay/task/sponsored (folded from `chipVocabulary`, `eventChip`, `eventRoster`).

**`index.server.ts` — services** (`(ctx, actor, input)`, authorization inside, one `withTx` per write):

- `listCalendars` — the viewer's calendars, personal first, named and coloured as every surface shows them.
- `listEventsInWindow` — scope → query → expand → exceptions → RSVP/attendance/creator attached; the ranged read and every page month.
- `createEvent` — calendar access, personal-calendar fallback, creator RSVP, invites, family mirror, exactly one `events_changed` nudge.
- `updateEvent` / `deleteEvent` — partial semantics (#228), scope `this` vs `all`, Exception Override upsert, mirror propagation, exception shifting, one nudge.
- `getEventForViewer` — the detail page's one visibility answer (404 vs 403).
- `getEventAttendance` / `rsvpEvent` / `inviteEventGuest` — the rsvp pair.
- `exportEventIcs` — the `.ics` body + filename for a master, a series or one occurrence.
- `bulkEditEvents` — delete / calendar / location / attendants / smart, per item, one nudge.
- `listImportTargets` / `previewImport` / `commitImport` / `undoImport` — the three-step import with its caps.
- `getPrintMonth` — the printable month.
- `searchLocations` — the location field's lookup.

**`index.server.ts` — endpoints** (each `endpoint()` re-exported by its route file): `listEventsEndpoint`, `createEventEndpoint`, `updateEventEndpoint`, `deleteEventEndpoint`, `getEventRsvpEndpoint`, `setEventRsvpEndpoint`, `exportEventIcsEndpoint`, `bulkEditEventsEndpoint`, `listCalendarsEndpoint`, `listImportTargetsEndpoint`, `previewImportEndpoint`, `commitImportEndpoint`, `undoImportEndpoint`, `printMonthEndpoint`, `searchLocationsEndpoint`.

**`ui/index.ts` — components:** `EventModal` (takes the tasks checklist as a `checklist?: Snippet`), `EventFormModal` + its field groups, `EventRsvpRow`, `EventAttendeeGroups`, `EventDeleteConfirm`, `EventExportMenu`, `AttendantPicker`, `LocationSearch`, `EventChip`.

## How to test

- Whole module: `npm run test:mod -- calendar` (add `--legacy` while legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup.
- Database + services: `*.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: the three `calendar.*.http.db.test.ts` files pin status + body of every endpoint (golden tests, committed mode with `beforeEach(truncateAll)`). They import the ROUTE modules, so they are unchanged by S6 wiring.
- UI: `ui/*.svelte.test.ts` render with props; state classes are tested without a DOM.
- Fixtures: `calendar.fixtures.server.ts` (list builders here).
- Two goldens describe behaviour that depends on the real clock or a remote service, on purpose:
  - `GET /api/print` asserts the grid, the month name and the family name of an explicit `?year&month`; the "this month" flag is asserted as a boolean, never a date.
  - `GET /api/location-search` stubs the global `fetch` for its success case (Nominatim is a remote call in the legacy handler's critical path), so the mapping is pinned without the network.

## Invariants

Behaviour that must not change, each with the test that pins it (`file › test title`). Legacy evidence is the code the rule was read from.

**Occurrence identity and expansion**

- An occurrence id is `{masterId}~{UTC ISO}`, built only by `buildOccurrenceId` and parsed only by `resolveOccurrenceId`; the master part must match `^[A-Za-z0-9_-]{5,64}$`, and the ISO is the same `toUTC().toISO()` rendering the Exception Override keys use — `src/lib/server/utils/eventIds.ts:8,17,26,53-64` · pinned by every golden that addresses an occurrence, e.g. `calendar.events.http.db.test.ts › a scope 'this' DELETE on a recurring occurrence cancels it and keeps the series`, and `› answers 400 'Invalid event id' for an id that is not a master id`.
- Every displayed occurrence — recurring or not — carries a composite `id` plus `masterId` and `occurrenceDate` (= the recurrence slot, even when the start is overridden) — `src/lib/server/services/eventDisplayService.ts:99-123` · `calendar.events.http.db.test.ts › serves the expanded occurrences of the requested window with rsvp, attendance and creator`.
- An Exception Override is keyed by `buildOccurrenceId(masterId, normalized originalDate)`; a cancelled one is dropped, and an edited one merges `title/description/location/allDay` over the master while `start`/`end` replace the slot (end otherwise derives from the master's duration) — `eventDisplayService.ts:99-123` · `calendar.events.http.db.test.ts › scope 'this' writes an Exception Override and answers the series note`.
- Moving a recurring master's start shifts every Exception Override's `originalDate`, `start` and `end` by the same non-zero delta inside the same transaction — `src/lib/server/db/actions/events.ts:306-320,439-447` · `calendar.events.http.db.test.ts › moving a recurring master's start shifts every Exception Override slot by the same delta`.
- `upsertException` merges only defined fields, defaults `isCancelled` to false and normalizes `originalDate` to UTC ISO — `events.ts:55-103` · `calendar.events.http.db.test.ts › a scope 'this' DELETE on a recurring occurrence cancels it and keeps the series`.
- Non-recurring Events count when they OVERLAP the window (`start < windowEnd && end >= windowStart`, #217); recurring series step from the original start anchor; the window is half-open; COUNT is series-total while 500 caps only in-window emissions; UNTIL is inclusive — `src/lib/server/services/recurrenceService.ts:124-205` · `calendar.events.http.db.test.ts › serves the expanded occurrences…` (3 of 3 in-window slots) and `› serves a range of exactly 62 days and refuses anything wider`.
- Monthly steps clamp into the short month, yearly Feb 29 rolls forward to Mar 1, and `scheduleStep` throws on a frequency outside the closed set — `recurrenceService.ts:65-121` · S3 `calendar.recurrence.rules.test.ts` (carried from `recurrenceService.test.ts`).
- BYDAY applies to daily/weekly only, is read in the viewer's zone, and a date-only `recurrenceUntil` means end-of-day inclusive — `recurrenceService.ts:146-160,199-224,226-277` · S3 `calendar.recurrence.rules.test.ts`.

**Recurrence writes**

- `normalizeEventRecurrence` is the single write shape: only daily/weekly/monthly/yearly; an absent or unknown frequency clears interval/byDay/count/until; interval is floored and clamped to ≥ 1; BYDAY is uppercased, ordinal-prefixed and non-weekdays dropped, empty → null; count is a positive floored integer else null; until is a non-empty string else null — `src/lib/server/services/eventRecurrence.ts:50-91`.
- Therefore EVERY event write carries the whole recurrence shape: a partial `PUT` that omits recurrence clears it (see Questions for the owner) — `src/routes/api/events/[id]/+server.ts:99-113` · `calendar.events.http.db.test.ts › clears recurrence when a partial body omits it (every write goes through normalizeEventRecurrence)`.

**Access**

- Reads span every calendar the viewer can see: their personal calendars plus every family they belong to, not just the first (#098) — `src/lib/server/db/actions/calendarScope.ts:10-28` · `calendar.events.http.db.test.ts › reads every calendar the viewer belongs to, and hides everyone else (issue 098)`.
- Writes require the owner leg (#165): the Event's owner or the owner of the Calendar it sits on. Read access on a shared family calendar is not enough — `calendarScope.ts:43-61,65-80` · `calendar.events.http.db.test.ts › answers 404 for a reader who is not the owner (issue 165 owner leg)` and `calendar.bulk.http.db.test.ts › counts only what really applied: an uneditable match fails per item`.
- A calendar the caller cannot see is refused with `403 Calendar not accessible` before any write, on create, on a move and on a bulk move — `src/routes/api/events/+server.ts:95-98`, `[id]/+server.ts:91-95`, `bulk/+server.ts:127-130` · `calendar.events.http.db.test.ts › refuses a calendar the viewer cannot see with 403 'Calendar not accessible'` and `calendar.bulk.http.db.test.ts › answers 400 'calendarId required' and 403 'Calendar not accessible' for a calendar move`.
- `PUT`/`DELETE`/`ics`/`rsvp` accept a composite occurrence id as well as a master id; a malformed one is `400 Invalid event id` — `src/routes/api/events/[id]/+server.ts:27-31,152-156` · `calendar.events.http.db.test.ts › answers 400 'Invalid event id' for an id that is not a master id`.
- The rsvp pair answers `404 Event not found` for an unknown id and `403 No access to this event` for an event the viewer cannot reach — `src/routes/api/events/[id]/rsvp/+server.ts:18-20,79-81` · `calendar.events.http.db.test.ts › answers 404 'Event not found' for an unknown id and 403 'No access to this event' for a stranger`.

**Writes and mirrors**

- Creating an Event writes the row, the creator's `going` RSVP and its invites in one transaction; a missing `calendarId` uses (or creates) the personal calendar; the family mirror joins the same transaction — `src/lib/server/db/actions/events.ts:255-287`, `src/routes/api/events/+server.ts:105-155` · `calendar.events.http.db.test.ts › creates on the personal calendar, auto-RSVPs the creator and stores guest names`.
- The family mirror is a second Event with `mirrorOf = masterId` on the family calendar, created only when `syncEventsToFamilyCalendar` is on; master edits propagate a fixed field set (never `calendarId`) and a whole-series delete removes master, mirrors and exceptions together — `events.ts:325-364,455-472` · `calendar.events.http.db.test.ts › mirrors the creation onto the family calendar when the setting is on`, `› a bare DELETE removes the master, its family mirror and its exceptions in one transaction`.
- Deleting one occurrence of a one-off deletes it; deleting one occurrence of a Recurring Event writes a cancelled Exception Override and keeps the series — `src/routes/api/events/[id]/+server.ts:151-184` · `calendar.events.http.db.test.ts › a scope 'this' DELETE on a one-off removes that event`, `› a scope 'this' DELETE on a recurring occurrence cancels it and keeps the series`.
- A missing or unparseable DELETE body reads as `{}`, i.e. the whole series — `src/routes/api/events/[id]/+server.ts:139-140` · `calendar.events.http.db.test.ts › a body that is not JSON still means the whole series`.
- A partial `PUT` keeps every omitted field and an explicit `null`/`''` clears it (#228); invites are replaced only when `attendees`/`attendants` is present; a `scope:'this'` write cannot express per-occurrence invites, so they land on the SERIES and the response says so — `src/routes/api/events/[id]/+server.ts:37-38,55-88,99-122` · `calendar.events.http.db.test.ts › keeps omitted fields and clears an explicit null or empty string (#228)`, `› scope 'this' with attendees replaces the invitations on the MASTER series`.
- Structured `attendees` are preferred over legacy `attendants` names; a known member id becomes a member invite, an unrecognized id is dropped (never stored as a guest name), guests are always optional, and a replace-all keeps responded members (required downgraded to optional) while replacing guest rows — `src/lib/server/utils/eventInvites.ts:39-82`, `events.ts:181-249` · `calendar.events.http.db.test.ts › prefers structured attendees: a known member becomes a member invite, an unknown id is dropped`.
- RSVP is an upsert against the partial unique index with `targetWhere userId IS NOT NULL` — `events.ts:474-495` · `calendar.events.http.db.test.ts › upserts the viewer RSVP and answers the attendance (rsvpStatus carries the same rows)`.
- A guest is an attendance row with no account: the name is trimmed, a blank or non-string guest is `400 Guest name is required`, and a case-insensitive repeat is not added twice — `src/routes/api/events/[id]/rsvp/+server.ts:28-62` · `calendar.events.http.db.test.ts › invites a named guest once, answering the attendance without an rsvpStatus`, `› answers 400 'Guest name is required' for a blank or non-string guest`.
- The attendance summary counts member rows only (guests excluded) and is omitted when nobody is invited: `{going, invited, required, requiredPending, goingNames}` — `events.ts:371-406`, `eventDisplayService.ts:151-167` · `calendar.events.http.db.test.ts › serves the expanded occurrences of the requested window with rsvp, attendance and creator`.
- Every mutation sends exactly ONE `events_changed` nudge per request, fire-and-forget, never rejecting and a no-op when FCM is unconfigured — `src/lib/server/services/eventsChangedNudge.ts:58-80` · legacy `src/routes/api/events/nudge.test.ts` (kept as the nudge's own test until S5; the transport is `alerts`).

**Wire shapes**

- The ranged read requires both ends, real ordered `YYYY-MM-DD` dates, and at most 62 days; the expansion window is `from 00:00Z − 7d` through `to 23:59:59.999Z + 7d`; the response is `{window:{from,to}, events:[…]}` — `src/lib/server/services/eventRange.ts:23,46-78`, `src/routes/api/events/+server.ts:35-77` · `calendar.events.http.db.test.ts › asks for both ends of the range`, `› refuses a date that does not exist instead of rolling it over`, `› refuses a backwards range`, `› serves a range of exactly 62 days and refuses anything wider`.
- `POST /api/events` answers `201 {success, event}`; `PUT` answers `200 {success, event}` or, for `scope:'this'`, `200 {success, note:'Attendee changes apply to the whole series.'}`; `DELETE` answers `200 {success:true}`; a write failure is `500` with the route's own message — `src/routes/api/events/+server.ts:156-166`, `[id]/+server.ts:119-130,187-196` · the goldens named above plus `› answers 500 {"error":"Failed to create event"} when the row cannot be written`.
- `POST`/`PUT` answer the RAW drizzle row, so its timestamps are Postgres's text render (`2026-10-07 13:00:00+00`), never ISO; the displayed reads answer ISO because the expansion/display pipeline converts. Both are pinned verbatim — `src/lib/server/db/schema.ts:442-461` (`mode: 'string'`), `src/lib/server/services/eventDisplayService.ts:106-118` · `calendar.events.http.db.test.ts › creates on the personal calendar, auto-RSVPs the creator and stores guest names`, `› keeps omitted fields and clears an explicit null or empty string (#228)`, `› moves the slot from a drag-move body (start + end only) and the next GET reflects it`.
- `GET /api/events/[id]/rsvp` answers `{attendance, userRsvpStatus, nonUserAttendants}` (`'undecided'` when the viewer has no row); `POST` answers `{success, rsvpStatus, attendance}` for a status and `{success, attendance}` for a guest. `rsvpStatus` carries the raw attendance ROWS, not a status (see Questions for the owner) — `[id]/rsvp/+server.ts:57-63,79-98` · `calendar.events.http.db.test.ts › lists the attendance, the viewer RSVP and the guest names`, `› upserts the viewer RSVP and answers the attendance (rsvpStatus carries the same rows)`, `› defaults the viewer RSVP to undecided when there is no row`.
- Errors on the .ics route are plain text, not JSON; success is `text/calendar; charset=utf-8` with `Content-Disposition: attachment; filename="<slug>.ics"` — `src/routes/api/events/[id]/ics/+server.ts:22-40,84-94` · `calendar.events.http.db.test.ts › answers 401 Unauthorized as plain text when signed out`, `› downloads one VEVENT with the escaping, the UTC instants and the attachment name`.
- The ICS export escapes `\ ; ,` and newlines, writes UTC `Z` instants, uses `VALUE=DATE` with an EXCLUSIVE DTEND for an all-day Event, emits `INTERVAL` only above 1 with BYDAY, and lets UNTIL win over COUNT; a missing end becomes +1 hour timed or +1 day all-day; `UID:<id>@familyplanz.com` — `src/lib/utils/ics.ts:44-141` · `calendar.events.http.db.test.ts › writes an all-day event as VALUE=DATE with an exclusive DTEND`, `› emits the RRULE with INTERVAL, BYDAY and UNTIL winning over COUNT`.
- A `scope:'this'` Exception Override exports its own fields as ONE VEVENT without an RRULE; a cancelled occurrence has nothing to export (`404`) — `[id]/ics/+server.ts:56-79` · `calendar.events.http.db.test.ts › exports a scope-this Exception Override as one VEVENT without an RRULE`, `› answers 404 for a cancelled occurrence and for an unknown event`.
- ICS import parses by unfolding continuation lines; skips CANCELLED and rows without SUMMARY or DTSTART; date-only becomes UTC midnight + allDay; TZID is mapped and floating times read as UTC; a missing DTEND falls back to DURATION then +1 hour; an all-day exclusive DTEND is stored as inclusive end-of-day; the title is trimmed to 200 characters; `recurrenceInterval` is 1 even when there is no RRULE (the parser's initial value, not a cleaned-up null); at most 500 events — `src/lib/server/services/icsImportService.ts:19,59-83,88-99,156-278` · `calendar.import.http.db.test.ts › describes the parsed rows and writes nothing`, `› writes only the ticked rows, then the next GET shows them`.
- Import is parse (no write) → preview → commit (+ undo): the preview describes rows, counts per file, flags duplicates and writes nothing; the commit re-runs dedupe and writes only the ticked rows; the undo removes only rows still matching the imported title+start, scoped to the viewer and the target calendar, and reports kept/missing — `src/lib/server/services/icsImportFlow.ts:215-410`, `icsImportPreview.ts:144-283` · `calendar.import.http.db.test.ts › describes the parsed rows and writes nothing`, `› re-checks the calendar at commit time and skips a row that landed meanwhile`, `› removes the rows that commit added, scoped to the viewer and the calendar`, `› keeps and names a row the user edited since the import`, `› reports rows that are already gone and rows it may not touch`.
- Import blast radius: 5 MB per file, 10 files per request, 500 rows for a preview and for a commit/undo batch; the dedupe key is the lowercased trimmed title, a literal `|`, and the exact `startIso`, with reasons `already-on-calendar`, `earlier-in-file`, `earlier-in-import`; the default selection is every non-duplicate — `icsImportFlow.ts:42-48`, `icsImportPreview.ts:5,68-71,189-200` · `calendar.import.http.db.test.ts › answers every choice error with its page message`, `› flags a row the calendar already holds as a duplicate and drops it from the selection`, `› counts several files in the heading and reports each file's rows`.
- Import errors are the page's own messages, unchanged: `Choose a calendar to import into.`, `That calendar is not yours to import into.`, `Choose an .ics file to import.`, `Choose up to 10 files at a time.`, `<name> is larger than 5 MB.`, the empty-parse message, `Pick the events you want to add.`, `Tick at least one event before importing.`, `Nothing to undo — import a file first.`, `That selection/undo could not be read …`, plus `400 Invalid JSON` for a body that is not a JSON object — `icsImportFlow.ts:180-199,215-410`, `src/lib/server/services/icsImportApi.ts:18-58` · `calendar.import.http.db.test.ts › answers every choice error with its page message`, `› answers every selection error with its page message`, `› answers every batch error with its page message`, `› answers 400 'Invalid JSON' for a body that is not JSON`.
- The calendar picker is personal first with the settings colour else `#fa8072`, then the family calendar with the family name and colour else `#e0ffff`; the import picker labels them `Personal Calendar` / `Family Calendar` — `src/lib/server/services/calendarData.ts:24-25,35-40,118-137`, `icsImportFlow.ts:31-40` · `calendar.bulk.http.db.test.ts › adds the family calendar with the settings colour and the family name`, `calendar.import.http.db.test.ts › lists the personal calendar and the family calendar, labelled like the page`.
- Bulk edits run one id at a time so one failure cannot abort the batch, and `applied` counts real successes (`failed:[{id,error}]` otherwise); a smart edit is deterministic over absolute dates, names the events it targets (else every selected one), prefers a move when a delete verb rides along with a concrete edit, re-validates a posted plan against editable ids, and `dryRun` returns the plan only — `src/routes/api/events/bulk/+server.ts:45-75,189-258`, `src/lib/server/services/bulkAiService.ts:220-261,281-319` · `calendar.bulk.http.db.test.ts › deletes every selected event, once each, and reports what applied`, `› plans a smart edit deterministically from an absolute date (dryRun writes nothing)`, `› answers 422 when the instruction matches nothing and when a posted plan names no editable id`, `› counts only what really applied: an uneditable match fails per item`.
- The attendance merge in a bulk edit is read-merge-write inside one transaction, deduped case-insensitively — `bulk/+server.ts:146-176` · `calendar.bulk.http.db.test.ts › merges guest names case-insensitively and needs at least one name`.
- The print month is padded to whole weeks from the `weekStart` setting (Sunday by default), the month clamps into 1–12, and `prev`/`next` roll across the year; its expansion window is still the legacy ±2 years (open question Q7 in the sheet) — `src/lib/server/services/printData.ts:34-52,99-167` · `calendar.bulk.http.db.test.ts › lays the requested month out as a Sunday-first grid by default`, `› pads the month to whole Monday-first weeks from the weekStart setting, with the family name`, `› clamps a month outside 1-12 into the last month of the year`.
- The location search needs a 2–100 character query, answers at most 5 `{label,lat,lon}` results, returns `{results:[]}` when the upstream fails or is unhappy, and is rate limited to 60 requests/minute per client (`429 Too many searches. Try again shortly.`) — `src/routes/api/location-search/+server.ts:11-45` · `calendar.bulk.http.db.test.ts › maps the upstream results onto {label, lat, lon}`, `› answers an empty list when the upstream search fails`, `› requires 2-100 characters of query`, `› rate limits a client after 60 searches a minute`.
- Every `/api` route answers `401 {"error":"Unauthorized"}` when signed out, and a JSON-object body that cannot be parsed is `400 {"error":"Invalid JSON"}` rather than a 500 — kernel `endpoint.test.ts › answers 401 …` for the port; today's evidence is each route's own guard — every golden's 401 case.

**Page and UI behaviour worth keeping** (pinned by S7 visual checks and `ui/*.svelte.test.ts`):

- Create modal opens collapsed to Quick Add/Title/Description; Show More reveals the rest; the calendar picker appears only with 2+ calendars; NLP-detected fields show inline and are re-hidden unless the user touched them — `src/lib/components/calendar/MODALS_SPEC.md:7-79`.
- The form posts directly to `POST /api/events` / `PUT /api/events/{id}`; the NLP parse is debounced 300 ms; a multi-date parse creates one Event per date and reports each — `MODALS_SPEC.md:33`.
- The delete confirm offers "This occurrence" vs "Whole series", warns that attached Tasks go too, and disables the bar while the DELETE is in flight; the modal guards a double-tapped DELETE; save toasts `Saved "<title>".` (#223) — `src/lib/components/calendar/EventDeleteConfirm.svelte:26-56`, `EventModal.svelte:219-299`.
- RSVP buttons update optimistically, clicking the active choice again clears to `undecided`, and a failure toasts `Couldn't save your RSVP — try again.` — `src/lib/components/calendar/EventRsvpRow.svelte:49-84`.
- The event header exports `.ics` at `/api/events/{id}/ics` and a Google Calendar link carrying the RRULE and the viewer `ctz`; closes on outside click or Escape — `src/lib/components/calendar/EventExportMenu.svelte:13-44,68-90`.
- Chips speak one vocabulary: `timed` dot, `allDay` bar, `task` ring, `sponsored` hatched bag; colour means the calendar, never the kind; a sponsored chip is labelled "Ad" with a11y "Sponsored" — `src/lib/utils/chipVocabulary.ts:5-10,84-160`.
- Import page: several files at once, per-file counts, duplicate badges with the reason, Select all/none/back-to-suggested, a success card reporting imported/selected/skipped that links the EARLIEST landed date, and an Undo carrying the batch — `src/routes/(calendar)/calendar/import/+page.svelte:115-123,234-300`.
- Event detail page: signed-out → 302 `/login`; unknown → 404 `Event not found`; neither owner nor calendar access → 403 `No access to this event` — `src/routes/(calendar)/calendar/event/[id]/+page.server.ts:17-43`.
- Print sheet: all-day items are timeless and times are written `9a` / `2:30p` — `src/lib/server/services/printData.ts:109-116`.
- Location field: 50 ms debounce, minimum 2 characters, 5 suggestions, the previous request aborted, recent locations capped at 5 in device-local storage — `src/lib/components/LocationSearch.svelte:33,73-120`.

## Depends on

- May import: kernel, identity, billing, alerts, family, dashboardModules, bills, parsing (public entries only).
- Owns tables: `calendars`, `events`, `eventExceptions`, `eventAttendance`.
- Reads (join only): none.
- Calls: `identity` for the viewer's settings (time zone, colour, `weekStart`, `syncEventsToFamilyCalendar`, ad gate) and the creator's first name; `family` for the viewer's family and the roster that turns `attendees` into member invites; `alerts` for the `events_changed` device push; `parsing` for the date vocabulary the bulk instruction and the quick-add use.
- Called by: `calendarPage` (month/week/day/list, the create-anything modal, import and print screens), `dayDashboard` (today's events, Kids' Schedule), `tasks` (an Event's calendar and the recurrence label) and `app` (the cron prune, if any).
