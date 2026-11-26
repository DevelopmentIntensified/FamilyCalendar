# 328 — Day view modal: restore legacy look

Status: done

Area: v2 rewrite (calendarPage)

## Done

- One card per event: the chip carries mark, title and badges once; the duplicate plain title row is gone, and so is the nested button-in-button (the chip is the one button). An ad renders once.
- Time line is `7:00 PM - 8:30 PM` (start - end, as legacy); a missing or `N/A` location is omitted, never printed.
- Calendar name sits beside a dot in the calendar's own colour; rows use legacy spacing (`px-6 py-4`; tasks and empty state padded to match).
- Tests: `ui/DayEventsModal.svelte.test.ts` (3 rows, each title once; no N/A; start-end clock; calendar dot; ad once; tap closes and opens edit).

## Needs doing

- Visual diff against the legacy screenshot (page-visual harness; not run here).
