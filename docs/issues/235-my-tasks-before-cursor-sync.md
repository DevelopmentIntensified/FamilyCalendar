# 235 — /calendar/tasks reads My Tasks before the recurring cursor sync runs

Status: open

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/routes/(calendar)/calendar/tasks/+page.server.ts:62` `getMyTasks` runs in parallel with `getTasksForUser` (which syncs); `getMyTasks` never syncs.

## Repro

Daily task left unchecked yesterday shows red with yesterday's date on first load; fixed after refresh.

## Done

(none yet)

## Needs doing

- Await the sync before `getMyTasks`.
- Red test first where a seam exists (`tdd`).
