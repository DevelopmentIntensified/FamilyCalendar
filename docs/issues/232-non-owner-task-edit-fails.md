# 232 — Family member non-owner edits fail (404 / silent drop) — incl. Top-3 priority buttons

Status: open

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`mutations.ts:89-95` `updateTask` owner-only; family fallback in `[id]/+server.ts:150-165` only assignment+tags. `TopPrioritiesCard.svelte` `setPriority` shows buttons on non-owned tasks.

## Repro

Dad taps High on a task Mom assigned him -> toast 'Task not found'. `PUT {title, tags}` by member -> 200, title dropped.

## Done

(none yet)

## Needs doing

- Let `canMutateTask` callers edit plain fields via `updateTaskInFamily` (spec: any family member may mutate a family task); else 403 not 404.
- Red test first where a seam exists (`tdd`).
