# 221 — Week view ignores week-start setting; Monday users lose Monday

Status: open

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/components/calendar/WeekView.svelte:75-83` `current.startOf('week').plus({ day: dayOffset })` — Luxon week already starts Monday.

## Repro

Default 'sunday' shows Mon-Sun; 'monday' on a Monday shows Tue..next Mon (today not in its week).

## Done

(none yet)

## Needs doing

- Sunday-first: `current.minus({ days: current.weekday % 7 }).startOf('day')`; Monday-first: `startOf('week')`.
- Red test first where a seam exists (`tdd`).
