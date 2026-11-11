# 232 — Family member non-owner edits fail (404 / silent drop) — incl. Top-3 priority buttons

Status: done

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`mutations.ts:89-95` `updateTask` owner-only; family fallback in `[id]/+server.ts:150-165` only assignment+tags. `TopPrioritiesCard.svelte` `setPriority` shows buttons on non-owned tasks.

## Repro

Dad taps High on a task Mom assigned him -> toast 'Task not found'. `PUT {title, tags}` by member -> 200, title dropped.

## Done

- `src/routes/api/tasks/[id]/+server.ts` PUT: plain fields built once (`fieldPatch`); when the owner-scoped `updateTask` misses, any caller `canMutateTask` allows (family member, live assignee) writes `fieldPatch` + their scoped assignment response through `updateTaskInFamily`. No rights / unknown id -> 404 (unchanged contract); visibility still owner-only 403; reassign by non-owner still 403.
- `assignment.ts` `updateTaskInFamily`: takes the full field patch (minus visibility, also stripped at runtime) and `familyId: string | null` (null scopes to personal rows, for a live assignee of a personal task).
- `types.ts`: shared `TaskFieldPatch` (used by `updateTask` and `updateTaskInFamily`), exported from the barrel.
- `TopPrioritiesCard.svelte`: no change needed — its `{priority}` PUT now succeeds for family members; the card only lists the viewer's own + family tasks, all mutable by them.
- `docs/guides/task-api-spec.md`: plain-field edit rights spelled out.
- Tests `[id]/server.test.ts` › `non-owner plain-field edits (#232)` (6-row field table, personal live assignee, no-visibility, 404 denied, 404 unknown) — 8 red -> green.

## Needs doing

(none)
