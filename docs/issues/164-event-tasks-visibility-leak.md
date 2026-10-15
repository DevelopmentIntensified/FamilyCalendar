# 164 — Event task list leaks owner's private tasks to event readers

Status: open

Source: security audit (issue 136), 2026-10-15. Rank 4/16 — any user with event read access (incl. family members) reads private tasks.

## Done

- `src/lib/server/db/actions/tasks.ts:240-246` — `getTasksForEvent` returns ALL non-archived tasks on the event with **no visibility filter**.
- `src/routes/api/tasks/+server.ts:27-44` (`?eventId=`) gates only event access, then dumps `eventTasks` — owner's PRIVATE tasks on that event leak to any reader.

## Needs doing

- Filter `visibility`/`userId` in the query or the route (owner + family-visible only). Small, self-contained; regression test: private task on a shared event is invisible to a family member, visible to the owner.
- No fork — this is a missing filter, not a design choice.
