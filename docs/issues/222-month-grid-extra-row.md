# 222 — Month grid with Monday start adds a full extra row of next month

Status: done

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/components/calendar/MonthView.svelte:44` `length: 7 - firstDayInNextMonth` (gives 7 when next month starts on week start).

## Repro

Monday-first, May 2026 (Jun 1 is Monday) -> extra row Jun 1-7.

## Done

- `MonthView.svelte`: trailing next-month length is `(7 - firstDayInNextMonth) % 7`.
- Tests: new `MonthView.svelte.test.ts` table `MonthView grid rows (#222)` (6 month/pref combos; asserts exact cell count and whole weeks). Red: `2026-05 with monday-first` rendered 42 (extra Jun 1-7 row) vs 35 -> green.

## Needs doing

(none)
