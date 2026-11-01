# 218 — GET /api/events?from=&to= serves only the month of `to`

Status: open

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`src/routes/api/events/+server.ts:47` `monthGridWindow(range.to)` though `resolveEventRange` allows 62 days.

## Repro

`?from=2026-11-01&to=2026-12-31` returns Dec grid only; most of Nov missing, no error.

## Done

(none yet)

## Needs doing

- Window = range.from 00:00Z .. range.to 23:59Z (+ grid padding).
- Red test first where a seam exists (`tdd`).
