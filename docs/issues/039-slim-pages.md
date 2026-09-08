# 039 — Slim down oversized pages/components

Status: in-progress

## Done

- Filed; measured: tasks 1659, family/[familyId]/tasks 917, calendar 895,
  account 816, family/[familyId] 808 lines; EventFormModal 1420,
  EventModal 1251. Bills/spending EXCLUDED (area PAUSED per STATUS.md).
- `src/lib/components/tasks/TaskRow.svelte` (+ 7-test colocated suite):
  open-row markup extracted from calendar/tasks (toggle/edit/assign/
  skip/delete two-step, FREQ_NOUN → satisfies + freqNoun narrow-helper
  per DayView pattern); page 1659 → 1454.
- `src/lib/components/tasks/TaskCompletedRow.svelte` (+ 3 tests):
  completed-row variant (Mark-incomplete, struck title, muted chips);
  page 1454 → 1368. Total −291 lines. vitest 10 green, oxlint clean.

## Needs doing

- Extract sub-components from calendar tasks page (biggest non-paused).
- Extract shared modal sections (EventFormModal/EventModal).
- Verify: colocated/targeted vitest + build green, push test.
