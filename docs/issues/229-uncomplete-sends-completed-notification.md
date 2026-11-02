# 229 — Un-checking someone else's task notifies them it was completed

Status: done

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/routes/api/tasks/[id]/+server.ts:79-88` notifies `task_completed` whenever `updated.userId !== user.id`, regardless of direction.

## Repro

Un-complete (or double-tap) a family member's task -> they get 'X completed task'.

## Done

- `src/routes/api/tasks/[id]/+server.ts` toggleComplete branch: reads the pre-toggle row; notifies only on open -> done — one-off `completedAt` set, or recurring `completionCount` increased. Un-checks, legacy completed-recurring un-checks, and guard-miss double-taps stay silent.
- Tests `[id]/server.test.ts` › `toggleComplete — completion notification direction (#229)` (5-row table + owner-self case): 3 rows red (un-check, recurring double-tap, legacy un-check notified) -> all green.

## Needs doing

(none)
