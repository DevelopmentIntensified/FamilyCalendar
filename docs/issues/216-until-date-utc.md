# 216 — Date-only recurrence "until" drops the last occurrence for evening events in western zones

Status: open

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`recurrenceService.ts:193-196` `DateTime.fromISO(dateOnly, { zone: 'utc' }).endOf('day')`.

## Repro

Daily 5pm PST until 2026-11-05 -> no Nov 5 occurrence (it is 11-06T01Z).

## Done

(none yet)

## Needs doing

- Resolve until end-of-day in the event/user zone.
- Red test first where a seam exists (`tdd`).
