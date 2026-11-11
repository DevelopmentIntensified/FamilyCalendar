# 212 — Desktop month Selection mode: event chips don't select

Status: done

Source: owner bug report 2026-11-01 — "selection on desktop of events isn't working."

## Done

- Root cause: compact-layout rework of `MonthDayCell.svelte` wrapped the cell column in `pointer-events-none relative z-10` (so empty space reaches the `Open <date>` overlay). The chips region only *removed* its own `pointer-events-none` in Selection mode; `pointer-events` inherits, so chips stayed `none` and every click fell through to the overlay → `openDay` (Day View) instead of `onToggleSelect`.
- Fix: chips region now sets `pointer-events-auto` in Selection mode (`pointer-events-none` + `inert` outside it, unchanged).
- TDD: `MonthDayCell.svelte.test.ts` "selection hit-testing (#212)" — red 2/2, green; calendar suite 452/452.

## Needs doing

(none)
