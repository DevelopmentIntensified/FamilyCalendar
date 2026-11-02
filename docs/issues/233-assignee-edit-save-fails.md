# 233 — Accepted assignee cannot save any edit to the task

Status: done

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/lib/utils/taskEditPayload.ts:65` always sends `assignedTo`; for assignee = self -> PUT builds accepted patch; `updateTask` misses (not owner) -> 403/404.

## Repro

Accept a task Mom assigned you, edit title, Save -> 'You can only respond to your own assignments' / 'Task not found'.

## Done

- Client `src/lib/utils/taskEditPayload.ts`: `assignedTo` is sent only when the assignee changed (null when cleared); `EditPayload.assignedTo` is optional.
- Server `src/routes/api/tasks/[id]/+server.ts` PUT: an `assignedTo` equal to the stored assignee is a no-op (no assignment patch). The accepted assignee's save no longer 403s, and an owner save no longer resets an accepted assignment to pending (with a stray re-notify). Field edits go through the #232 collaborator path.
- Tests (red -> green):
  - `taskEditPayload.test.ts` › `omits an unchanged assignedTo (...)` ×3, `sends assignedTo: null when an assignee is cleared`.
  - `[id]/server.test.ts` › `unchanged assignedTo is a no-op (#233)`: assignee save (was 403), owner same-assignee save (was reset to pending), real reassign still pending + notified.
  - `403s a family member reassigning` now reassigns to a *different* user; re-sending the current assignee is a no-op by design.

## Needs doing

(none)
