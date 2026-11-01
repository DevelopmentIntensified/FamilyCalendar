# 222 — Month grid with Monday start adds a full extra row of next month

Status: open

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/components/calendar/MonthView.svelte:44` `length: 7 - firstDayInNextMonth` (gives 7 when next month starts on week start).

## Repro

Monday-first, May 2026 (Jun 1 is Monday) -> extra row Jun 1-7.

## Done

(none yet)

## Needs doing

- Normalize modulo 7 (0 trailing days when it lands on week start).
- Red test first where a seam exists (`tdd`).
