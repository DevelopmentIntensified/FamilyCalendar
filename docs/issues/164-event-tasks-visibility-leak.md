# 164 — Event task list leaks owner's private tasks to event readers

Status: done

Source: security audit (issue 136), 2026-10-15. Rank 4/16 — any user with event read access (incl. family members) reads private tasks.

## Done

- **Fixed 2026-10-22 (local, uncommitted):** `src/routes/api/tasks/+server.ts:46-49` filters the `?eventId=` dump — `visibility !== 'private' || userId === auth.user.id`. A member reading the event-task list no longer sees the owner's private tasks; the owner still sees their own.
- Gates: **11/11** in `api/tasks/server.test.ts` (issue-164 describe at `:211`, incl. foreign-private-hidden `:229` and own-private-readable `:243` cases).

- `src/lib/server/db/actions/tasks.ts:240-246` — `getTasksForEvent` returns ALL non-archived tasks on the event with **no visibility filter**.
- `src/routes/api/tasks/+server.ts:27-44` (`?eventId=`) gates only event access, then dumps `eventTasks` — owner's PRIVATE tasks on that event leak to any reader.

## Needs doing

- None.
