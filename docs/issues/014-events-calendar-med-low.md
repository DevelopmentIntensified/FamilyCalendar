# 014 — Audit findings: events/calendar MED/LOW

Status: in-progress

Re-triaged 2026-09-29 against the code: **7 of the 9 bullets are already
shipped** (moved to Done, evidence below). 2 remain. Nothing was changed in
`src/` by this pass.

## Needs doing

- **OPEN — Recurring times drift across DST.** Unchanged: still the
  documented design limitation it always was. The real fix is zone-stepped
  series anchoring (step the series in the user's zone rather than stepping
  an absolute instant), which is a semantics change users can feel.
  **Record an ADR before changing anything** — `docs/adr/` currently holds
  only `0001-family-membership-role-vs-member-type.md`, so there is no
  precedent to copy and no decision on the wall for this one. Related
  known caveat from the `scheduleStep` work (#032/#007 adjacent): a clamped
  cursor re-anchors on the clamped date, which is the same class of problem.
- **OPEN — single-occurrence Exception Overrides do not propagate to the
  family-calendar mirror.** This is the residue of the old "mirror copies
  are never updated" bullet, and it is named in the code that fixed the
  rest: `syncFamilyMirror` (`src/lib/server/db/actions/events.ts:331-358`)
  propagates whole-series and non-recurring edits, but the per-occurrence
  `upsertException` path does not touch the mirror, so a cancelled or edited
  occurrence leaves the family's copy stale. This is a scoping decision
  (should a mirror carry its own exceptions, or re-derive from the master on
  read?) as much as a code change — decide before writing it.

## Done

- **Date-only `recurringUntil` off-by-one** — FIXED. `recurrenceService.ts`
  `recurrenceUntil()` (:189-204) normalises a date-only value to an
  INCLUSIVE end-of-day cutoff before the comparison at :156. Pinned by
  `recurrenceService.test.ts:375-420` ("date-only recurrenceUntil is an
  INCLUSIVE end-of-day cutoff"), which distinguishes date-only
  (`'2026-09-05'`) from a real instant (`'2026-09-05T00:00:00.000Z'`).
- **Family-mirror copies never updated or deleted** — FIXED. Origin id +
  index: `events.mirrorOf` column + `events_mirror_of_idx`
  (`schema.ts:446,452`, with `CalendarEvent` keeping the field optional for
  writers at :751-756). Write site: the mirror create in
  `src/routes/api/events/+server.ts:78-85`. Propagation on edit:
  `syncFamilyMirror` (`events.ts:331-358`, called from `updateEventById` at
  :324). Deletion: `deleteEventInScope` removes mirror rows in the SAME
  transaction as the master (`events.ts:446-466`), belt-and-braces on top of
  the `mirrorOf` FK. Residue tracked above under Needs doing.
- **Multi-day split ran in the server zone** — FIXED. `parseEvents` takes a
  zone and does both the same-day test and the `start.plus({ days: i })`
  split in it (`src/lib/utils/eventDisplay.ts:49-55,64-65`);
  `calendar/+page.server.ts:250-251,292` passes the resolved `userZone`.
- **Offline replay discarded queued creates on 401/403** — FIXED.
  `src/lib/utils/offline.ts:30-38` classifies 401/403 as `retry` (an auth
  failure, not a rejection) and `shouldDropAfterReplay` keeps the record for
  a later attempt. Pinned by `offline.test.ts:182-202`.
- **Scope 'this' PUT silently discarded attendee edits** — FIXED. Attendee
  edits can't be expressed per-occurrence, so they are applied to the master
  and the response says so:
  `src/routes/api/events/[id]/+server.ts:75-85` returns
  `{ success: true, note: 'Attendee changes apply to the whole series.' }`.
- **Master series edit didn't shift exception keys** — FIXED.
  `updateEventById` (`events.ts:299-317`) computes `deltaMs` from the start
  change on a recurring event and shifts every `eventExceptions.originalDate`
  (plus its start/end overrides) by the same delta, inside the same
  transaction — otherwise cancelled/edited occurrences resurrect at the
  wrong slot.
- **Duplicate dropped `reminderMinutes` and attendees** — FIXED.
  `src/lib/utils/eventDuplicate.ts:65-66` carries both; the payload builder
  also restores member invite types and guest names, not just a flat list.
  Pinned by `eventDuplicate.test.ts:25,38`.
- **Create/update + invites + family-mirror not transactional** — FIXED.
  Create: `api/events/+server.ts:41` wraps personal-calendar resolution, the
  event row, creator RSVP, invites AND the family mirror in one
  `db.transaction`. `createEvent` / `replaceEventInvites` take an optional
  client and join the caller's transaction rather than opening their own
  (`events.ts:247,281`). Update: `updateEventById` (`events.ts:292-327`)
  wraps the row update, the invite replace, the exception shift and the
  mirror sync. Delete: `events.ts:449-466`.
