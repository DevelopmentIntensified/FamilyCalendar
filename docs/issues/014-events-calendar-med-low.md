# 014 — Audit findings: events/calendar MED/LOW

Status: in-progress

## Needs doing

- Date-only `recurringUntil` drops its final occurrence (off-by-one) —
  treat date-only as inclusive end-of-day before comparing.
- Family-mirror copies (syncEventsToFamilyCalendar) are never updated or
  deleted — edits/deletes leave frozen/ghost copies; add origin id +
  propagation.
- Multi-day split runs in server zone, not user zone → phantom trailing day
  for UTC+ users — pass userZone into parseEvents.
- Offline replay permanently discards queued creates on 401/403 — exempt
  auth failures from discard, retry after re-auth.
- Scope 'this' PUT silently discards attendee edits — apply to master or
  surface a note.
- Editing master series doesn't shift exception keys — shift
  `eventExceptions.originalDate` by (newStart − oldStart) when master start
  changes on scope 'all'.
- Duplicate drops `reminderMinutes` and attendees — include both in the
  duplicate payload.
- Create/update + invites + family-mirror are not transactional — wrap in
  `db.transaction` to prevent half-written events.
- Recurring times drift across DST (documented design limitation) — real fix
  is zone-stepped series anchoring; record an ADR before changing.

## Done

- (nothing yet)
