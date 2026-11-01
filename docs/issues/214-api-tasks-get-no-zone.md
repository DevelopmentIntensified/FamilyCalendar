# 214 — GET /api/tasks syncs recurring cursors with no user zone

Status: open

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/routes/api/tasks/+server.ts:52` calls `getTasksForUser(uid, familyId)` with no zone; page loaders pass `userZone`. `syncRecurringCursors` then writes `dueDate = UTC 23:59`.

## Repro

Android/TaskFocus polling rewrites a Pacific user's overdue daily task due time to ~4pm on the shared row.

## Done

(none yet)

## Needs doing

- Pass `await getUserZone(auth.user.id)` as third arg.
- Red test first where a seam exists (`tdd`).
