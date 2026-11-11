# 216 — Date-only recurrence "until" drops the last occurrence for evening events in western zones

Status: done

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`recurrenceService.ts:193-196` `DateTime.fromISO(dateOnly, { zone: 'utc' }).endOf('day')`.

## Repro

Daily 5pm PST until 2026-11-05 -> no Nov 5 occurrence (it is 11-06T01Z).

## Done

- `recurrenceUntil(event, zone)`: a date-only UNTIL resolves to end-of-day in the viewer zone (`DateTime.fromISO(d, { zone }).endOf('day')`), for both the plain loop and BYDAY series. Zone comes from the #215 plumbing (`expandRecurrence(..., zone)` <- `expandEventsForUser(..., zone)` <- loaders). Full-timestamp UNTILs unchanged.
- Tests: `recurrenceService.test.ts` > `date-only recurrenceUntil ends the day in the viewer zone (#216)`: daily 5pm PST until 11-05 keeps Nov 5; BYDAY weekly 7pm Chicago keeps the until Monday; east of UTC (daily 8am Tokyo until 11-05) stops ON Nov 5 (UTC cutoff added Nov 6).
- Red: 3 failed. Green: 53/53 under TZ=UTC and TZ=America/Chicago (existing UTC-default until cases unchanged).

## Needs doing

(none)
