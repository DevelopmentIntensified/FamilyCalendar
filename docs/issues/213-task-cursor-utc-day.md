# 213 — Recurring Task cursor computes "today" in UTC, not the user zone

Status: open

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/lib/server/db/actions/tasks/cursor.ts:40,57,251` — `DateTime.fromISO(nowIso)` (via `toDateTime`, no `setZone:true`) drops the `zonedNow(zone)` offset; startOf('day')/23:59 pin are UTC.

## Repro

Chicago user completes a daily task 10am Nov 1 -> next due Nov 1 18:00 local (today). After ~6pm local the overdue pin (23:59Z) is already past -> task shows overdue.

## Done

(none yet)

## Needs doing

- Parse with `{ setZone: true }` or pass the zoned DateTime; add non-UTC zone cases to cursor tests.
- Red test first where a seam exists (`tdd`).
