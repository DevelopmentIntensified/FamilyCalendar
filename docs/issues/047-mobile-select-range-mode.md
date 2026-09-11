# 047 — Mobile select-range event creation needs a mode

Status: done

## Done

- Filed from bug export 2026-09-10 ("On mobile, the select range event selection should be a mode or some other solutions (give ideas)").

## Needs doing

- Problem: WeekView/DayView `rangeTouch` = long-press-drag on the hour grid. Competes with scroll; undiscoverable; accidental triggers. See `src/lib/components/calendar/WeekView.svelte:220-340`, `DayView.svelte:188-305`, parity work in #046.
- Decide: explicit "Add/Select" mode toggle (cf. `selectionMode` in Calendar.svelte/toolbar) vs alternatives: tap-two-endpoints, + button pre-filling dragged range, stepper-only refine. Record decision here.
- Whatever chosen: must not fight vertical scroll; must work inside #046 unified range-select action (don't fork a second gesture system).
- Per slice: colocated vitest + oxlint + prettier + build green, push test immediately.
