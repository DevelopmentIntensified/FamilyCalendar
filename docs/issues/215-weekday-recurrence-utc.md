# 215 — byDay recurring events land on the wrong weekday in US zones

Status: open

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`src/lib/server/services/recurrenceService.ts:236-243` `expandWeekdaySeries` reads `cur.weekday` from a UTC DateTime; `recurrenceByDay` holds local weekdays.

## Repro

Mon 7pm PST, byDay [MO,WE] -> occurrences on Tue/Sun local; anchor Monday dropped. "every weekday at 7pm" shows Sun-Thu.

## Done

(none yet)

## Needs doing

- Compute weekday/week phase in the event's (or user's) zone.
- Red test first where a seam exists (`tdd`).
