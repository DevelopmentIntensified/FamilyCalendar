# 230 — GET /api/tasks never returns focusMinutes

Status: open

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/lib/server/db/actions/tasks/queries.ts:31-56` explicit select lacks `focusMinutes`; #211 contract says it is returned; Android shows 'Xm focus' from it.

## Repro

Android task rows never show focus minutes.

## Done

(none yet)

## Needs doing

- Add `focusMinutes: tasks.focusMinutes` to all task list selects.
- Red test first where a seam exists (`tdd`).
