# 214 — GET /api/tasks syncs recurring cursors with no user zone

Status: done

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/routes/api/tasks/+server.ts:52` calls `getTasksForUser(uid, familyId)` with no zone; page loaders pass `userZone`. `syncRecurringCursors` then writes `dueDate = UTC 23:59`.

## Repro

Android/TaskFocus polling rewrites a Pacific user's overdue daily task due time to ~4pm on the shared row.

## Done

- `src/routes/api/tasks/+server.ts` GET: resolves `getUserFamilyId` + `getUserZone` in parallel and passes the zone to `getTasksForUser`.
- Test `server.test.ts` › `pins to 23:59 in the token owner's stored zone (#214)` (stored zone Asia/Tokyo, fake clock 23:00Z) — red (no pin: UTC day) -> green. Depends on #213's zoned parsing.

## Needs doing

(none)
