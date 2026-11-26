# 329 — Month cell event chips: uniform width

Status: done

Area: v2 rewrite (calendarPage)

## Done

- `ui/MonthCell.svelte`: the day disc is its own row above `month-chips`; the chips container is `flex-col`; event and task chips are `w-full`, titles truncate, so all chips share one left edge and width.
- `ui/TaskChip.svelte`: new optional `class` prop (same as `CalendarChip`) so the cell can stretch it.
- `ui/MonthCell.svelte.test.ts` (new): DOM order (disc before and outside the chips), `flex-col`, `w-full` + `truncate` on event and task chips.

## Needs doing

- Month cell chips have varied widths; first chip sits beside day number, offset from the rest.
- All chips full cell width, stacked below the day number, consistent left edge.
