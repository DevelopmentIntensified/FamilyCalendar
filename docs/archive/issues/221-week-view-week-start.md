# 221 — Week view ignores week-start setting; Monday users lose Monday

Status: done

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/components/calendar/WeekView.svelte:75-83` `current.startOf('week').plus({ day: dayOffset })` — Luxon week already starts Monday.

## Repro

Default 'sunday' shows Mon-Sun; 'monday' on a Monday shows Tue..next Mon (today not in its week).

## Done

- New `startOfWeekFor(date, weekStart)` in `src/lib/utils/dateUtils.ts` ('monday' -> `startOf('week')`; else Sunday-first `minus({days: weekday % 7}).startOf('day')`). `WeekView.svelte` uses it instead of `startOf('week').plus(dayOffset)`.
- Tests (`WeekView.svelte.test.ts`): table `WeekView #221 — week start honours the setting` (6 rows: Sun/Mon/Sat/Sun anchors x sunday/monday). Red: Sunday-first rendered Mon..Sun, Monday-first rendered Tue..Mon -> green.
- Existing `moves a dropped event with a PUT preserving duration` had baked in the bug (assumed col 0 = Monday under Sunday-first); now drops on col 1 (Mon Sep 7).

## Needs doing

(none)
