# 044 — Tasks page load perf (playbook run #3)

Status: in-progress

Method: docs/guides/page-perf-playbook.md.

## Done

- Filed.
- Baseline (Neon, bench anon, warmed): TTFB ~1.1s median, 142924B.
- Chain (`tasks/+page.server.ts`): parent (free) → tasks+sync →
  myTasks → pending → requested → familyAssigned → public (6 SEQUENTIAL
  task guards) → return. All six are independent (need only userId +
  familyId) — parallelize first.

## Needs doing

- Simplify: dead list fields, edit-dialog extraction, shared leg helper.

## Done

- Streamed + parallelized in one move: six legs run `Promise.all`
  inside ONE `taskLists` promise (per-leg fallbacks + warnings in
  payload). Shell (header chrome + add-task card + toolbar) paints
  first; header counts + lists fill via stash-once cache; row skeletons
  pending, retry catch. Shell TTFB ~1.1s → ~0.48s (−55%), full ~0.73s.
  Browser-verified (header/toolbar immediate, empty state resolves,
  no page errors).
- Dead payload cut: `familyTasksAssignedToMe` + `publicFamilyTasks`
  legs removed (fetched + serialized, never read) — −2 queries/load.
- `AssignmentsCard.svelte` (+ 4 tests): accept/requested tabs +
  accept-decline rows extracted; tab state now self-contained (dead
  page-level `assignTab` removed). Page 1659 → ~1200 and falling.
  Caught live: sed range-delete ate a container `</div>` — build caught
  it; line-range deletes need immediate build verification.
