# 217 — Non-recurring events that start before the visible window are hidden

Status: done

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`recurrenceService.ts:131-133` non-recurring: `s >= windowStart && s < windowEnd ? [s] : []` — loaders query overlapping events but expansion drops them.

## Repro

Trip Oct 15 - Nov 10; open November -> nothing on Nov 1-10. Same for `/api/events` range.

## Done

- `expandRecurrence` non-recurring branch now yields the start when the event OVERLAPS the window: `start < windowEnd && (end ?? start) >= windowStart` (matches the loaders' overlap query).
- Tests: `recurrenceService.test.ts` > `non-recurring events that overlap the window (#217)` (8-row table: started-before/ends-inside, spans window, ends at window start, ended before, starts inside, starts at window end, no-end before/inside).
- Red: 3 failed (started-before rows). Green: 45/45 under TZ=UTC and TZ=America/Chicago.
- Note: Day Dashboard's own post-expansion filter (`dashboard/+page.server.ts` keeps events whose START is in the day) still hides multi-day events on later days — separate concern, not changed here.

## Needs doing

(none)
