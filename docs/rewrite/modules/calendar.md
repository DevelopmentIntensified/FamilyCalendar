# Port sheet: calendar

**domain** · rank 8 · port #13 · home: `src/lib/domains/calendar/` · README after the port: `src/lib/domains/calendar/README.md` (written in S1)

Calendars, Events, Recurring Event expansion, Exception Overrides, family mirrors, attendance/RSVP, ICS import/export, bulk edits, event UI.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing.
- **Owns tables:** `calendars`, `eventAttendance`, `events`, `eventExceptions`.
- **Must be ported first:** family, billing, parsing, alerts, identity (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `________`
- [ ] S3 contract + rules
- [ ] S4 repo (+ fixtures)
- [ ] S5 service
- [ ] S6 http + route wiring (goldens unchanged since S2)
- [ ] S7 UI rebuild (rules, api, state, components, screen) + visual check
- [ ] S8 rewire importers, delete legacy code and legacy tests
- [ ] S9 README final, census --write, gate:push, ledger done

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- Occurrence id `masterId~ISO` built and parsed in one place; exception keys use the same ISO rendering as expansion.
- Deleting an event deletes master + all `mirrorOf` copies in one transaction; RSVP upsert keeps `targetWhere userId IS NOT NULL` (partial index).
- Event writes require the owner leg (#165 canMutateEventRow).
- Blast-radius caps: range 62 days, 500 occurrences, 500 imported events.
- ICS: RFC 5545 escaping, UTC `Z` instants, all-day exclusive DTEND, RRULE UNTIL over COUNT, biweekly → `FREQ=WEEKLY;INTERVAL=2`.
- Import is parse (no write) → preview → commit (+ undo).
- Every event mutation sends the `events_changed` nudge.
- Android: `GET /api/events?from&to` → `{window, events}`; `PUT`/`DELETE /api/events/[id]` (DELETE carries a JSON body); `/[id]/rsvp` GET/POST; `/bulk`.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/events` | GET | signed-in session | `?from&to`: both required, `YYYY-MM-DD`, must be real dates, `to >= from`; missing/invalid end → 400 | 200 `{window:{from,to}, events:[…]}` — expanded occurrences (composite ids) with `rsvpStatus`, `attendance`, `creatorName` | 401 `Unauthorized`; 400 `Ask for a range: ?from=YYYY-MM-DD&to=YYYY-MM-DD.`; 400 `That range is wider than 62 days.` | `src/routes/api/events/+server.ts:35-77` |
| `/api/events` | POST | signed-in | `title`, `start`, optional `end`/`description`/`location`/`allDay`/`reminderMinutes`/`calendarId`, structured `attendees` or legacy `attendants` names, `recurrence*`; absent `end`/`description`/`location` stored null, `allDay` false; absent `calendarId` → personal calendar, created when missing | 201 `{success:true,event}`; a `mirrorOf` copy is added on the family calendar when `syncEventsToFamilyCalendar` | 401 `Unauthorized`; 403 `Calendar not accessible`; 500 `Failed to create event` | `src/routes/api/events/+server.ts:79-168` |
| `/api/events/[id]` | PUT | signed-in; readable scope to find it, owner leg to write | id may be `master~occurrenceISO`; any subset of event fields — an omitted key keeps the stored value, explicit `null` or `''` clears (#228); `scope:'this'` on a recurring master writes an Exception Override; invites replaced only when `attendees`/`attendants` present | 200 `{success:true,event}`; scope-this → 200 `{success:true,note:'Attendee changes apply to the whole series.'}` | 401 `Unauthorized`; 400 `Invalid event id`; 404 `Event not found`; 403 `Event not accessible`; 403 `Calendar not accessible`; 400 `A valid occurrenceDate is required`; 500 `Failed to update event` | `src/routes/api/events/[id]/+server.ts:20-131` |
| `/api/events/[id]` | DELETE | signed-in; owner leg | optional JSON body with `scope` (`this` or `all`) and `occurrenceDate`; missing/unparseable body reads `{}`, scope defaults `all`; scope-this on a recurring master writes a cancelled exception, on a one-off deletes it | 200 `{success:true}`; whole series also deletes the `mirrorOf` copies and the master's exceptions | 401 `Unauthorized`; 400 `Invalid event id`; 404 `Event not found`; 403 `Event not accessible`; 400 `A valid occurrenceDate is required`; 500 `Failed to delete event` | `src/routes/api/events/[id]/+server.ts:133-201` |
| `/api/events/[id]/rsvp` | GET | signed-in; read scope | none | 200 `{attendance:[rows], userRsvpStatus (default 'undecided'), nonUserAttendants:[names]}` | 401 `Unauthorized`; 404 `Event not found`; 403 `No access to this event`; 500 `Failed to fetch attendance` | `src/routes/api/events/[id]/rsvp/+server.ts:74-110` |
| `/api/events/[id]/rsvp` | POST | signed-in; read scope | `status` one of `going`, `maybe`, `declined`, `undecided`, or `{guest:name}`; `guest` wins when present, trimmed, blank → 400, already-present guest (case-insensitive) is not added twice | 200 `{success:true,rsvpStatus,attendance}`; guest → `{success:true,attendance}` | 401 `Unauthorized`; 404 `Event not found`; 403 `No access to this event`; 400 `Guest name is required`; 400 `Invalid RSVP status`; 500 `Failed to invite guest`; 500 `Failed to update RSVP` | `src/routes/api/events/[id]/rsvp/+server.ts:12-72` |
| `/api/events/[id]/ics` | GET | signed-in; read access (any viewer may export) | id master or `master~iso`; a scope-this exception exports its own fields as one VEVENT without RRULE; a cancelled occurrence is not exportable | 200 `text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename="<slug>.ics"` | 401 `Unauthorized`; 400 `Invalid event id`; 404 `Event not found`; 403 `Event not accessible`; 500 `Failed to export event` (plain-text bodies) | `src/routes/api/events/[id]/ics/+server.ts:22-112` |
| `/api/events/bulk` | POST | signed-in | `{ids:[{id,occurrenceDate?}], op:{type, calendarId?, location?, add?, instruction?}, plan?, dryRun?}`; `op.type` is one of `delete`, `calendar`, `location`, `attendants`, `smart`; ids resolved to master ids and deduped | 200 `{success:true, applied, failed:[{id,error}]}`; smart + `dryRun` → `{success:true, plan}` | 401 `Unauthorized`; 400 `ids and op are required`; 400 `No valid event ids`; 403 `No editable events matched`; 400 `calendarId required`; 403 `Calendar not accessible`; 400 `add names required`; 400 `instruction required`; 422 `Could not match that instruction. Try naming a date or the events.`; 422 `No valid changes in plan`; 400 `Unknown op type`; 500 `Bulk edit failed` | `src/routes/api/events/bulk/+server.ts:77-270` |
| `/api/calendars` | GET | signed-in | none | 200 `{calendars:[{id,name,color,kind}]}`, personal first then the family calendar | 401 `Unauthorized` | `src/routes/api/calendars/+server.ts:13-24` |
| `/api/import` | GET | signed-in | none | 200 `{calendars:[{id,name}]}` — own calendars plus the one family's, labelled Personal or Family Calendar | 401 `Unauthorized` | `src/routes/api/import/+server.ts:7-13` |
| `/api/import/preview` | POST | signed-in | `{calendarId, files:[{name, contentBase64}]}`; malformed JSON/non-object → 400 `Invalid JSON` (empty body reads `{}`); `files` not an array → 400; entry without base64 → 400 | 200 `{preview:{calendarId, calendarName, fileName (or "<n> files"), items, duplicates, files, defaultSelection}}`; writes nothing | 401 `Unauthorized`; 400 `files must be an array`; 400 `Each file needs contentBase64 (base64 text)`; 400 `Choose a calendar to import into.`; 403 `That calendar is not yours to import into.`; 400 `Choose an .ics file to import.`; 400 `Choose up to 10 files at a time.`; 400 `<name> is larger than 5 MB.`; 400 `Could not read <name>.`; 400 the empty-parse message | `src/routes/api/import/preview/+server.ts:16-34`, `src/lib/server/services/icsImportFlow.ts:176-275` |
| `/api/import/commit` | POST | signed-in | `{calendarId, picked:[preview item / draft]}`; preview-only fields dropped; whole batch rejected if any row is malformed or over 500 | 200 `{calendarId, calendarName, imported, selected, skipped, skippedDuplicates, failed:[titles], importedEvents:[{id,title,startIso}]}` | 401 `Unauthorized`; 400 `Pick the events you want to add.`; 400 `That selection could not be read — preview the file again.`; 400 `Tick at least one event before importing.`; plus the target errors above | `src/routes/api/import/commit/+server.ts:15-30`, `src/lib/server/services/icsImportFlow.ts:277-364` |
| `/api/import/undo` | POST | signed-in | `{calendarId, batch:[{id,title,startIso}]}`; whole batch rejected if malformed or over 500; ids re-scoped to this viewer and this calendar | 200 `{calendarName, removed, kept:[{id,title}], alreadyGone}` — only rows still matching title+start are removed | 401 `Unauthorized`; 400 `Nothing to undo — import a file first.`; 400 `That undo could not be read — import the file again.`; plus the target errors above | `src/routes/api/import/undo/+server.ts:16-34`, `src/lib/server/services/icsImportFlow.ts:366-410` |
| `/api/print` | GET | signed-in | `?year&month`; missing/unparseable → viewer's current month, month clamped 1–12 | 200 `{year, month, monthName, weekStart, familyName, grid:[cells with items], prev, next, isCurrentMonth}` | 401 `Unauthorized` | `src/routes/api/print/+server.ts:11-18`, `src/lib/server/services/printData.ts:35-167` |
| `/api/location-search` | GET | signed-in + 60 requests/minute per client | `?q`; shorter than 2 or longer than 100 chars → 400 | 200 `{results:[{label,lat,lon}]}`, max 5; upstream failure returns an empty list | 401 `Unauthorized`; 429 `Too many searches. Try again shortly.`; 400 `q is required and must be 2-100 characters` | `src/routes/api/location-search/+server.ts:11-45` |

### Rules the module must keep
- Occurrence id `{masterId}~{UTC ISO}` is built only by `buildOccurrenceId` and parsed by `resolveOccurrenceId`; master ids must match `^[A-Za-z0-9_-]{5,64}$`; the ISO is `toDateTime(...).toUTC().toISO()` — one rendering shared with Exception Override keys — `src/lib/server/utils/eventIds.ts:8,17-19,26-28,53-64` · test: `src/lib/server/utils/eventIds.test.ts` › "matches the UTC ISO output of expandRecurrence so override keying cannot drift"
- Every displayed occurrence, recurring or not, carries a composite id plus `masterId` and `occurrenceDate` (= the recurrence slot, even when start is overridden) — `src/lib/server/services/eventDisplayService.ts:99-123`
- Exception Overrides are keyed by `buildOccurrenceId(masterId, normalized originalDate)`; cancelled occurrences are dropped, edited ones merge `title/description/location/allDay` with the master and `start`/`end` replace the slot while end otherwise derives from master duration — `eventDisplayService.ts:77-123`
- Moving a recurring master's start shifts every exception's `originalDate`, `start` and `end` by the same delta in the same transaction (non-zero delta only) — `src/lib/server/db/actions/events.ts:306-322` · test: `src/lib/server/db/actions/events.test.ts` › "shifts exception slots in the same transaction when the master start moves"
- `upsertException` merges only defined fields, defaults `isCancelled` false, and normalizes `originalDate` to UTC ISO; it selects-then-writes (racy without the unique index of #014) — `events.ts:55-103`
- Recurrence writes normalize in one place: only daily/weekly/monthly/yearly; absent or unknown frequency clears interval/byDay/count/until; interval is floored and clamped to ≥1; BYDAY is uppercased, ordinal prefix stripped, non-weekdays dropped, empty → null; count is a positive floored integer else null; until is a non-empty string else null — `src/lib/server/services/eventRecurrence.ts:59-110` · test: `src/lib/server/services/eventRecurrence.test.ts` › "absent frequency clears every recurrence field"
- Expansion: non-recurring events count when they overlap the window (`start < windowEnd && end >= windowStart`, #217); recurring series step from the original start anchor; the window is half-open; COUNT is series-total while `MAX_OCCURRENCES` (500) caps only in-window emissions; UNTIL is inclusive — `src/lib/server/services/recurrenceService.ts:124-190` · tests: "caps runaway expansion at 500 occurrences", "COUNT stays series-total: 610 daily occurrences with 590 pre-window leave 20 in-window"
- Monthly steps clamp into the short month (Jan 31 → Feb 28/29); yearly Feb 29 rolls forward to Mar 1 — `src/lib/server/services/recurrenceService.ts:65-121` · test: "clamps monthly day-of-month (Jan 31 -> Feb 28)"
- `scheduleStep` is the single frequency+interval stepper and throws on an unknown frequency — `src/lib/server/services/recurrenceService.ts:65-91` · test: `src/lib/server/services/recurrenceService.test.ts` › "throws on a frequency outside the closed set"
- BYDAY applies to daily/weekly only; weekly additionally requires the week to be in interval phase; weekday and week phase are read in the viewer's zone; a date-only `recurrenceUntil` means end-of-day inclusive in the viewer's zone while a full timestamp is exact — `src/lib/server/services/recurrenceService.ts:146-160,196-203,226-277` · tests: "BYDAY weekdays are read in the viewer zone (#215)", "date-only recurrenceUntil is an INCLUSIVE end-of-day cutoff"
- Reads span every calendar the viewer can see — personal plus all family memberships, not just the first — `src/lib/server/db/actions/calendarScope.ts:11-27` · test: `src/lib/server/db/actions/calendarScope.test.ts` › "adds every family calendar the user belongs to, not just the first (issue 098)"
- Writes require the owner leg (#165): event owner or owner of the calendar it sits on; read access on a shared family calendar is not enough — `calendarScope.ts:43-57`, `events.ts:289-299,455-471` · test: `src/lib/server/db/actions/events.test.ts` › "blocks a passing member from updating an event owned by another member"
- Creating an Event writes the row, the creator's `going` RSVP and its invites in one transaction; a missing `calendarId` uses/creates the personal calendar; mirror creation joins the same transaction — `events.ts:255-287` · test: "inserts event + creator RSVP + invites in ONE transaction"
- Deleting an Event removes the master and every `mirrorOf` copy in one transaction under the owner leg and returns the row count — `events.ts:455-472` · test: "removes the family-mirror rows in the same transaction as the master"
- Master edits propagate a fixed field set to mirror rows; `calendarId` is deliberately excluded so the mirror keeps its own calendar — `events.ts:337-364` · tests: "propagates master field edits to the mirror row", "does not mirror calendar-only moves"
- Invites: structured `attendees` are preferred over legacy `attendants` names; a known member id becomes a member invite, an unrecognized id is dropped (never stored as a guest name); guests are always optional; replace-all keeps responded members (required downgraded to optional) and replaces guest rows, deleting undecided uninvited members — `src/lib/server/utils/eventInvites.ts:30-90`, `events.ts:181-249` · test: `src/lib/server/utils/eventInvites.test.ts` › "drops unrecognized user ids entirely (never stored as guest names)"
- RSVP is an upsert against the partial unique index with `targetWhere userId IS NOT NULL` — `events.ts:474-495`
- The attendance summary counts member rows only (guests excluded): `going`, `invited`, `required`, `requiredPending`, `goingNames` — `events.ts:371-404`
- Every mutation sends exactly ONE `events_changed` nudge per request, fire-and-forget and never rejecting; no-op when FCM is unconfigured; audience = actor plus owners/members of touched and accessible calendars — `src/lib/server/services/eventsChangedNudge.ts:60-90` · test: `src/routes/api/events/nudge.test.ts` › "POST /api/events/bulk of 3 events nudges ONCE, not per event"
- Range contract: both ends required, real ordered dates, at most 62 days; the expansion window is `from 00:00Z − 7d` to `to 23:59:59.999Z + 7d`; all recurring masters are read regardless of range, plus one-offs overlapping it — `src/lib/server/services/eventRange.ts:23-75`, `src/routes/api/events/+server.ts:47-72` · test: `src/lib/server/services/eventRange.test.ts` › "caps the window so one request cannot become the ±2 years it replaced"
- ICS export: RFC 5545 escaping (backslash, semicolon, comma, newline); UTC `Z` instants; all-day uses `VALUE=DATE` with an exclusive DTEND (stored inclusive end-of-day + 1 day); a missing end becomes +1 hour timed or one day all-day; `UID:<id>@familyplanz.com`; RRULE emits INTERVAL only when >1, BYDAY, and UNTIL wins over COUNT; biweekly is `FREQ=WEEKLY;INTERVAL=2` — `src/lib/utils/ics.ts:46-53,57-59,79-124` · test: `src/lib/utils/ics.test.ts` › "all-day event: DTSTART/DTEND as VALUE=DATE, DTEND exclusive"
- ICS import parse: unfold continuation lines; skip CANCELLED and rows without SUMMARY or DTSTART; date-only → UTC midnight + allDay; TZID mapped (Outlook pseudo-names → IANA) and floating times read as UTC; missing DTEND falls back to DURATION then +1 hour; all-day exclusive DTEND stored as inclusive end-of-day; title trimmed to 200 chars; at most 500 events — `src/lib/server/services/icsImportService.ts:21-45,149-278` · test: `src/lib/server/services/icsImportService.test.ts` › "maps Outlook-style pseudo-TZIDs (quoted) to a real IANA zone"
- Import is parse (no write) → preview → commit (+ undo): preview describes rows, counts per file and never writes; commit re-runs dedupe and writes only the ticked drafts; undo removes only rows still matching the imported title+start, scoped to the viewer and target calendar, and reports kept/missing — `src/lib/server/services/icsImportFlow.ts:215-410`, `src/lib/server/services/icsImportPreview.ts:204-274` · test: `src/routes/(calendar)/calendar/import/page.server.test.ts` › "preview → commit → undo round-trip"
- Import blast radius: 5 MB per file, 10 files per request, 500 events for preview and for a commit/undo batch — `src/lib/server/services/icsImportFlow.ts:42-48,227-239`, `src/lib/server/services/icsImportPreview.ts:5`
- Dedupe key is the lowercased trimmed title, a literal pipe, and the exact `startIso`; reasons are already-on-calendar, earlier-in-file, earlier-in-import; the default selection is every non-duplicate — `src/lib/server/services/icsImportPreview.ts:68,144-202` · test: `src/lib/server/services/icsImportPreview.test.ts` › "re-checks the calendar at commit time and skips anything that landed meanwhile"
- Smart bulk edits: deterministic date/time/calendar-name parsing, named events as the target subset (else all selected), a delete verb deletes only with no concrete edit, and a delete verb beside a date/time/calendar prefers the non-destructive move; a client-posted plan is re-validated against editable ids — `src/lib/server/services/bulkAiService.ts:246-340`, `src/routes/api/events/bulk/+server.ts:189-258` · test: `src/lib/server/services/bulkAiService.test.ts` › "prefers the date move when a delete verb rides along"
- Bulk applies one id at a time so one failure cannot abort the batch; `applied` counts real successes; the attendance merge is read-merge-write, deduped case-insensitively, inside a transaction — `src/routes/api/events/bulk/+server.ts:45-75,146-176`
- Calendar palette: personal colour is the settings colour else `#fa8072`; family colour is the family colour else `#e0ffff`; the list is personal first — `src/lib/server/services/calendarData.ts:23-25,118-135` · test: `src/routes/api/calendars/server.test.ts` › "personal first, then the family calendar, named + coloured like the page"

### Page and UI behaviour worth keeping
- Create modal opens collapsed to Quick Add, Title and Description; Quick Add is hidden when all AI settings are off; Show More reveals date/time/location/attendants/calendar; the calendar picker appears only with 2+ calendars; NLP-detected fields show inline with green tickmarks and are hidden again when Quick Add changes unless the user touched them; all-day/multi-day toggles are hidden when NLP detects times — `src/lib/components/calendar/MODALS_SPEC.md:7-79`
- The form submits directly to `POST /api/events` / `PUT /api/events/{id}`; NLP parse is debounced 300 ms; a multi-date parse creates one event per parsed date and reports every result — `src/lib/components/calendar/MODALS_SPEC.md:33`, `src/lib/components/calendar/EventFormModal.svelte.test.ts` › "should debounce NLP parse at 300ms", "should POST once per parsed date and show the multi-date hint"
- Edit mode is always expanded and adds a read-only RSVP region (Going / Maybe / Not Going / non-user attendants) with Delete on the left — `src/lib/components/calendar/MODALS_SPEC.md:104-160`
- Delete confirm offers "This occurrence" vs "Whole series" for a recurring occurrence, warns that attached tasks go too, and disables the bar while the DELETE is in flight — `src/lib/components/calendar/EventDeleteConfirm.svelte:26-56` · test: `src/lib/components/calendar/EventDeleteConfirm.svelte.test.ts` › "offers occurrence vs series for recurring events"
- The modal sends `scope` on every series DELETE (a bare DELETE means the whole series), guards against a double-tapped DELETE, and on save closes with the toast `Saved "<title>".` (#223); duplicate creates a "… (copy)" event through POST — `src/lib/components/calendar/EventModal.svelte:219-299` · tests: "sends exactly one DELETE when Delete is double-tapped", "hides the export menu for ads"
- RSVP buttons update optimistically, clicking the active choice again clears to `undecided`, and a failure toasts "Couldn't save your RSVP — try again." — `src/lib/components/calendar/EventRsvpRow.svelte:49-84`
- The event header carries an export menu: `.ics` download at `/api/events/{id}/ics` and a Google Calendar link with the RRULE and viewer `ctz`; closes on outside click or Escape — `src/lib/components/calendar/EventExportMenu.svelte:13-44,68-90`
- Chips speak one vocabulary: `timed` dot, `allDay` bar, `task` ring, `sponsored` hatched bag; colour always means the calendar and never the kind; a sponsored chip is labelled "Ad" (a11y "Sponsored"); the month cell is a glyph view — `src/lib/utils/chipVocabulary.ts:5-10,84-160`
- Import page: drop zone for several files, per-file event/duplicate counts, duplicate badges with the reason, Select all / Select none / Back to suggested, per-file ✕ that only unticks its rows; the success card reports imported/selected/skipped and links the EARLIEST landed date as `/calendar?date=YYYY-MM-DD`; Undo carries the batch and reports removed/kept/already-gone — `src/routes/(calendar)/calendar/import/+page.svelte:115-123,234-300` · test: `src/routes/(calendar)/calendar/import/page.svelte.test.ts` › "links to the EARLIEST imported date, not the first row ticked"
- Event detail page: signed-out → 302 `/login`; unknown event → 404 "Event not found"; neither owner nor calendar access → 403 "No access to this event" — `src/routes/(calendar)/calendar/event/[id]/+page.server.ts:17-43`
- Print sheet: month padded to whole weeks from the `weekStart` setting, "today" taken in the viewer's zone, all-day items timeless and times written `9a` / `2:30p` — `src/lib/server/services/printData.ts:38-50,101-146` · test: `src/routes/api/print/server.test.ts` › "the requested month as a Monday-first grid"
- Location field: 50 ms debounce, minimum 2 characters, 5 suggestions, previous request aborted, recent locations kept in localStorage capped at 5 — `src/lib/components/LocationSearch.svelte:33,73-120`

### Probably accidental (candidates to drop, owner to confirm)
- The event detail page's `deleteEvent` action checks raw `ownerId` and calls `deleteEvent` (one row) instead of `deleteEventInScope` — no calendar-owner leg, and `mirrorOf` copies/exceptions survive the delete — `src/routes/(calendar)/calendar/event/[id]/+page.server.ts:76-83` vs `events.ts:455-472`
- `printData` expands with no window, i.e. the legacy ±2 years, to print one month — every other read is month-bounded (`monthGridWindow`/`eventRangeWindow`) — `src/lib/server/services/printData.ts:88-99`, `eventDisplayService.ts:30-56`
- The family mirror targets `familyCals[0]` (an arbitrary first family calendar) and is created for ANY non-family calendar, although the comment says personal-calendar creations only — `src/routes/api/events/+server.ts:130-148`
- `EventRecurrenceCard` still imports `freqNoun` from tasks while the import preview has its own `describeRecurrence`; the sheet says calendar should own one recurrence vocabulary — `src/lib/components/calendar/EventRecurrenceCard.svelte:10`, `src/lib/server/services/icsImportPreview.ts:88-113`
- `upsertException`'s select-then-write can create duplicate exception rows for one slot (no unique index yet; ticket #014) — `events.ts:66-84`
- The ICS parser silently stops at 500 VEVENTs, and drops BYDAY entirely whenever an ordinal prefix is present (`2TU` fails the joined-string equality then yields null) — `src/lib/server/services/icsImportService.ts:169,244`
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#014](../../archive/issues/014-events-calendar-med-low.md) Unique index on event_exceptions (+ duplicate sweep), DST ADR, exception edits must propag… | SCHEMA+BEHAVIOUR | keep behaviour; separate ticket after the calendar port (needs DDL approval + ADR) |
| [#082](../../archive/issues/082-calendar-window-fetch.md) Import success link to first date; /api/events auth-scope pin test; live verify. | BEHAVIOUR | FIX-IN-PORT for the auth-scope pin (golden tests); rest stays a ticket |
| [#083](../../archive/issues/083-import-preview-before-commit.md) ICS import preview-screen tests, Playwright upload→commit, success-screen deep link. | BEHAVIOUR | FIX-IN-PORT for the tests (goldens + UI tests); deep link stays a ticket |
| [#106](../../archive/issues/106-event-rsvp-summary-line.md) Collapse the attendee list into a summary line. | DESIGN | keep markup |
| [#141](../../archive/issues/141-parity-import-notifications-event.md) Import/notifications/event parity. | DESIGN | keep markup |
| [#197](../../archive/issues/197-svelte-5-57-migration.md) Svelte 5.57: EventFormModal runes pattern (canSubmit never re-evaluates). | STRUCTURE | FIX-IN-PORT: v2 UI is runes-only with state classes |

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# calendar: 0% ported

legacy source files left (60/60, 9953 LOC):
  - src/lib/components/LocationSearch.svelte (273 LOC, ui) importers: 2
  - src/lib/components/archive/archiveMonths.ts (144 LOC, model) importers: 1
  - src/lib/components/calendar/AttendanceBadge.svelte (33 LOC, ui) importers: 10
  - src/lib/components/calendar/AttendantPicker.svelte (227 LOC, ui) importers: 2
  - src/lib/components/calendar/ChipKindMark.svelte (64 LOC, ui) importers: 10
  - src/lib/components/calendar/CreatorBadge.svelte (19 LOC, ui) importers: 8
  - src/lib/components/calendar/EventActionBar.svelte (87 LOC, ui) importers: 1
  - src/lib/components/calendar/EventAttendeeGroups.svelte (316 LOC, ui) importers: 1
  - src/lib/components/calendar/EventDateTimeFields.svelte (133 LOC, ui) importers: 1
  - src/lib/components/calendar/EventDeleteConfirm.svelte (69 LOC, ui) importers: 1
  - src/lib/components/calendar/EventDetailList.svelte (167 LOC, ui) importers: 1
  - src/lib/components/calendar/EventExportMenu.svelte (102 LOC, ui) importers: 1
  - src/lib/components/calendar/EventFormModal.svelte (759 LOC, ui) importers: 2
      NOTE: Calendar keeps the event form. Task mode (taskSubmit, TaskQuickAddHelp, EventTaskFields, ChecklistSection) moves to the calendarPage screen as a wrapper that composes the event form with tasks' quick-add.
  - src/lib/components/calendar/EventFormModel.svelte.ts (732 LOC, client) importers: 7
  - src/lib/components/calendar/EventGuestNote.svelte (34 LOC, ui) importers: 1
  - src/lib/components/calendar/EventMetaFields.svelte (139 LOC, ui) importers: 1
  - src/lib/components/calendar/EventModal.svelte (443 LOC, ui) importers: 5
      NOTE: Drop the direct ChecklistSection import: give EventModal a `checklist?: Snippet` prop; screens pass tasks' checklist component.
  - src/lib/components/calendar/EventModalBar.svelte (176 LOC, ui) importers: 1
  - src/lib/components/calendar/EventModalHeader.svelte (62 LOC, ui) importers: 1
      NOTE: Recurrence label (freqNoun) becomes calendar rule `describeRecurrence`; tasks imports it from calendar (dedupes taskDisplay.freqNoun, taskFeedback copy, TaskQuickAddPreview FREQ_NOUN).
  - src/lib/components/calendar/EventModalShell.svelte (82 LOC, ui) importers: 1
  - src/lib/components/calendar/EventQuickAdd.svelte (137 LOC, ui) importers: 1
  - src/lib/components/calendar/EventRecurrenceCard.svelte (144 LOC, ui) importers: 1
      NOTE: Same as EventModalHeader: use calendar's `describeRecurrence`, not tasks' taskDisplay.
  - src/lib/components/calendar/EventRecurrenceFields.svelte (101 LOC, ui) importers: 1
  - src/lib/components/calendar/EventRsvpList.svelte (63 LOC, ui) importers: 1
  - src/lib/components/calendar/EventRsvpRow.svelte (165 LOC, ui) importers: 1
  - src/lib/components/calendar/EventTitleFields.svelte (58 LOC, ui) importers: 1
  - src/lib/components/calendar/MODALS_SPEC.md (250 LOC, ui) importers: 0
  - src/lib/data/smartEventTemplates.ts (277 LOC, model) importers: 1
  - src/lib/server/db/actions/calendar.ts (91 LOC, server) importers: 9
  - src/lib/server/db/actions/calendarScope.ts (80 LOC, server) importers: 10
  - src/lib/server/db/actions/events.ts (508 LOC, server) importers: 10
      NOTE: SPLIT: normalizeInvites/shiftException -> calendar rules; queries -> calendar repo; createEvent/updateEventById/deleteEventInScope/upsertException orchestration + access checks -> calendar service.
  - src/lib/server/services/archiveData.ts (138 LOC, server) importers: 2
  - src/lib/server/services/bulkAiService.ts (392 LOC, server) importers: 2
  - src/lib/server/services/bulkApplyService.ts (90 LOC, server) importers: 1
  - src/lib/server/services/eventDisplayService.ts (176 LOC, server) importers: 5
  - src/lib/server/services/eventRange.ts (80 LOC, model) importers: 1
  - src/lib/server/services/eventRecurrence.ts (91 LOC, model) importers: 2
  - src/lib/server/services/eventsChangedNudge.ts (75 LOC, server) importers: 5
  - src/lib/server/services/icsImportApi.ts (58 LOC, server) importers: 3
  - src/lib/server/services/icsImportFlow.ts (414 LOC, server) importers: 6
  - src/lib/server/services/icsImportPreview.ts (449 LOC, model) importers: 1
  - src/lib/server/services/icsImportService.ts (278 LOC, model) importers: 2
  - src/lib/server/services/printData.ts (167 LOC, server) importers: 2
  - src/lib/server/services/recurrenceService.ts (280 LOC, model) importers: 3
  - src/lib/server/utils/eventIds.ts (65 LOC, model) importers: 4
  - src/lib/server/utils/eventInvites.ts (83 LOC, server) importers: 2
  - src/lib/server/utils/eventTimes.ts (20 LOC, model) importers: 6
  - src/lib/types.ts (69 LOC, model) importers: 29
  - src/lib/utils/attendance.ts (91 LOC, model) importers: 1
  - src/lib/utils/bulkPlan.ts (64 LOC, model) importers: 1
  - src/lib/utils/calendarMatch.ts (25 LOC, model) importers: 1
  - src/lib/utils/chipVocabulary.ts (276 LOC, model) importers: 12
  - src/lib/utils/dayOverlap.ts (55 LOC, model) importers: 1
  - src/lib/utils/eventChip.ts (78 LOC, model) importers: 13
  - src/lib/utils/eventDisplay.ts (75 LOC, model) importers: 3
  - src/lib/utils/eventDuplicate.ts (69 LOC, model) importers: 1
  - src/lib/utils/eventMove.ts (105 LOC, model) importers: 5
  - src/lib/utils/eventRoster.ts (30 LOC, model) importers: 8
  - src/lib/utils/ics.ts (197 LOC, model) importers: 3
  - src/lib/utils/shareTarget.ts (28 LOC, model) importers: 1

route files not yet wiring-only (18/18):
  - src/routes/(calendar)/calendar/event/[id]/+page.server.ts  /calendar/event/[id]
      NOTE: Raw select + duplicated visibility rule -> calendar service getEventForViewer.
  - src/routes/(calendar)/calendar/event/[id]/+page.svelte  /calendar/event/[id]
      NOTE: Fat page: extract state into `<name>.state.svelte.ts` + pure rules; the screen component stays under ~250 lines.
  - src/routes/(calendar)/calendar/import/+page.server.ts  /calendar/import
  - src/routes/(calendar)/calendar/import/+page.svelte  /calendar/import
      NOTE: Fat page: extract state into `<name>.state.svelte.ts` + pure rules; the screen component stays under ~250 lines.
  - src/routes/(calendar)/calendar/print/+page.server.ts  /calendar/print
  - src/routes/(calendar)/calendar/print/+page.svelte  /calendar/print
  - src/routes/api/calendars/+server.ts  /api/calendars
  - src/routes/api/events/+server.ts  /api/events
      NOTE: Inline SELECT + db.transaction + family mirror -> calendar service createEvent / listEventsInWindow.
  - src/routes/api/events/[id]/+server.ts  /api/events/[id]
  - src/routes/api/events/[id]/ics/+server.ts  /api/events/[id]/ics
  - src/routes/api/events/[id]/rsvp/+server.ts  /api/events/[id]/rsvp
  - src/routes/api/events/bulk/+server.ts  /api/events/bulk
      NOTE: Inline attendance-merge transaction + per-item loop -> calendar service bulk operations.
  - src/routes/api/import/+server.ts  /api/import
  - src/routes/api/import/commit/+server.ts  /api/import/commit
  - src/routes/api/import/preview/+server.ts  /api/import/preview
  - src/routes/api/import/undo/+server.ts  /api/import/undo
  - src/routes/api/location-search/+server.ts  /api/location-search
  - src/routes/api/print/+server.ts  /api/print

legacy test files left (56/56) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/components/LocationSearch.svelte.test.ts [component, 1 tests]
  - src/lib/components/archive/archiveMonths.test.ts [pure, 11 tests]
  - src/lib/components/calendar/EventActionBar.svelte.test.ts [component, 4 tests]
  - src/lib/components/calendar/EventAttendeeGroups.svelte.test.ts [component, 16 tests]
  - src/lib/components/calendar/EventDateTimeFields.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/EventDeleteConfirm.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/EventDetailList.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/EventExportMenu.svelte.test.ts [component, 3 tests]
  - src/lib/components/calendar/EventFormModal.svelte.test.ts [component, 56 tests]
  - src/lib/components/calendar/EventFormModel.svelte.test.ts [component, 32 tests]
  - src/lib/components/calendar/EventGuestNote.svelte.test.ts [component, 3 tests]
  - src/lib/components/calendar/EventMetaFields.svelte.test.ts [component, 3 tests]
  - src/lib/components/calendar/EventModal.svelte.test.ts [component, 38 tests]
  - src/lib/components/calendar/EventModalBar.svelte.test.ts [component, 4 tests]
  - src/lib/components/calendar/EventModalHeader.svelte.test.ts [component, 3 tests]
  - src/lib/components/calendar/EventModalShell.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/EventQuickAdd.svelte.test.ts [component, 4 tests]
  - src/lib/components/calendar/EventRecurrenceCard.svelte.test.ts [component, 11 tests]
  - src/lib/components/calendar/EventRecurrenceFields.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/EventRsvpList.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/EventRsvpRow.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/EventTitleFields.svelte.test.ts [component, 3 tests]
  - src/lib/components/calendar/__diag2.svelte.test.ts [dead, 1 tests]
  - src/lib/server/db/actions/calendar.test.ts [stub-db, 4 tests]
  - src/lib/server/db/actions/calendarScope.test.ts [stub-db, 15 tests]
  - src/lib/server/db/actions/events.creatorNames.test.ts [stub-db, 3 tests]
  - src/lib/server/db/actions/events.test.ts [stub-db, 19 tests]
  - src/lib/server/services/bulkAiService.test.ts [mocked, 51 tests]
  - src/lib/server/services/eventDisplayService.creators.test.ts [mocked, 4 tests]
  - src/lib/server/services/eventDisplayService.test.ts [mocked, 5 tests]
  - src/lib/server/services/eventRange.test.ts [pure, 9 tests]
  - src/lib/server/services/eventRecurrence.test.ts [pure, 3 tests]
  - src/lib/server/services/eventsChangedNudge.test.ts [pure, 4 tests]
  - src/lib/server/services/icsImportPreview.test.ts [pure, 35 tests]
  - src/lib/server/services/icsImportService.test.ts [pure, 18 tests]
  - src/lib/server/services/recurrenceService.test.ts [pure, 22 tests]
  - src/lib/server/utils/eventIds.test.ts [pure, 15 tests]
  - src/lib/server/utils/eventInvites.test.ts [mocked, 11 tests]
  - src/lib/utils/attendance.test.ts [pure, 5 tests]
  - src/lib/utils/bulkPlan.test.ts [pure, 4 tests]
  - src/lib/utils/calendarMatch.test.ts [pure, 3 tests]
  - src/lib/utils/chipVocabulary.test.ts [pure, 18 tests]
  - src/lib/utils/dayOverlap.test.ts [pure, 7 tests]
  - src/lib/utils/eventDisplay.test.ts [pure, 10 tests]
  - src/lib/utils/eventDuplicate.test.ts [pure, 2 tests]
  - src/lib/utils/eventMove.test.ts [pure, 11 tests]
  - src/lib/utils/ics.test.ts [pure, 15 tests]
  - src/lib/utils/shareTarget.test.ts [pure, 8 tests]
  - src/routes/(calendar)/calendar/import/page.server.test.ts [route, 37 tests]
  - src/routes/(calendar)/calendar/import/page.svelte.test.ts [component, 29 tests]
  - src/routes/api/calendars/server.test.ts [route, 5 tests]
  - src/routes/api/events/[id]/server.test.ts [route, 10 tests]
  - src/routes/api/events/nudge.test.ts [route, 10 tests]
  - src/routes/api/events/server.test.ts [route, 11 tests]
  - src/routes/api/import/server.test.ts [route, 4 tests]
  - src/routes/api/print/server.test.ts [route, 3 tests]
```
<!-- census:end -->
