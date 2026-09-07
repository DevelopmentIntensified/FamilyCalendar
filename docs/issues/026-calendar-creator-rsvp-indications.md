# 026 — Creator / RSVP indications on event chips + modal

Status: done

## Done

- Server: `getCreatorFirstNames(ownerIds)` action (src/lib/server/db/actions/events.ts) —
  ONE `inArray(users.id, ownerIds)` lookup, keyed by user id; missing owners simply
  absent. `attachCreatorNames` in eventDisplayService.ts attaches `creatorName` per
  occurrence via master ownerId. Attached to FAMILY events only in calendar/+page.server.ts
  (`attachCreatorNames(await attachAttendanceSummaries(familyEventsFinal))`); personal
  events get no creator chip.
- Type: `creatorName?: string` on `Event` (src/lib/types.ts).
- New `CreatorBadge.svelte` (legacy mode, `chip`/`row` variants): compact
  "by <First>", min-w-0 + shrink-0 + max-w-[5rem] + truncate, `title="Created by <name>"`.
- Chips wired: MonthDays (month chips), WeekView (all-day chips + timed chip time line),
  DayView (all-day rows + timed chip time line), ListView (row pill, variant="row"),
  DayEventsModal (title row). AttendanceBadge untouched.
- DayActionSheet rows: CreatorBadge + AttendanceBadge variant="row" on title row,
  "· by X" on the time line; rows stay ≥44px.
- EventModal: "Created by <name>" detail row (family events only, between Calendar and
  Location). Attendee list already renders who's going/maybe/not-going/undecided with
  first names + guests by name + required styling — unchanged.
- Tests: events.creatorNames.test.ts (3) + eventDisplayService.creators.test.ts (4),
  TDD red→green. EventFormModal untouched. No commits made.
- Gates: vitest full 1231 passed; playwright e2e/events (11 passed, 1 skipped) +
  e2e/mobile (2 passed, Docker DB up); oxlint touched files 0; prettier --write;
  svelte-check 0; build green. svelte-autofixer run on all edited .svelte — only
  pre-existing warnings remain (each-block keys, hrefs, immutable `$:`).

## Deferred follow-ups

- Print page (calendar/print): CellItem is {title,color,allDay} — adding creator means
  touching grid + print markup; not trivial. Follow-up if wanted.
- Dashboard rows: same creator indication would be trivially consistent there
  (attachCreatorNames call + chip) — left out of this slice.
