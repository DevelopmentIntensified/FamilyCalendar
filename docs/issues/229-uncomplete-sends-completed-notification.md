# 229 — Un-checking someone else's task notifies them it was completed

Status: open

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/routes/api/tasks/[id]/+server.ts:79-88` notifies `task_completed` whenever `updated.userId !== user.id`, regardless of direction.

## Repro

Un-complete (or double-tap) a family member's task -> they get 'X completed task'.

## Done

(none yet)

## Needs doing

- Notify only on open -> done transition.
- Red test first where a seam exists (`tdd`).
