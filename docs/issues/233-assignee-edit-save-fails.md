# 233 — Accepted assignee cannot save any edit to the task

Status: open

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/lib/utils/taskEditPayload.ts:65` always sends `assignedTo`; for assignee = self -> PUT builds accepted patch; `updateTask` misses (not owner) -> 403/404.

## Repro

Accept a task Mom assigned you, edit title, Save -> 'You can only respond to your own assignments' / 'Task not found'.

## Done

(none yet)

## Needs doing

- Don't send unchanged `assignedTo`; let allowed callers edit fields (see #232) or make the dialog read-only for them.
- Red test first where a seam exists (`tdd`).
