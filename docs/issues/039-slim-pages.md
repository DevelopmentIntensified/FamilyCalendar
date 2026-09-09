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

Rule (user directive): NO file past 300 lines. Page-level handlers stay;
markup + pure logic extract out with colocated tests.

- [x] calendar/tasks rows → TaskRow + TaskCompletedRow (1659 → 1368)
- [x] calendar/tasks assignments → AssignmentsCard (→ ~1300)
- [x] calendar/tasks edit dialog → EditTaskDialog (page 1296 → 1056;
  dialog owns draft, page owns open/save; add→edit→save→toggle
  browser-verified)
- [x] calendar/tasks add card → AddTaskCard incl. smart templates
  (+ 3 tests; quick-parse + POST + toasts self-contained, errors via
  onError to the page banner). Page 1056 → 822. Caught live: leftover
  `busyTemplateId` ref → ReferenceError on edit open (browser test
  caught it; oxlint doesn't flag cross-scope undef here).
- [x] calendar/tasks toolbar → TaskToolbar (chips/search/sort/tag via
  bind:, CHIPS + TaskChip type live with it; + 3 tests). Page 822 →
  709. Chip-press + search browser-verified.
- [x] `taskDisplay.ts` (+ 4 tests): single `formatDue` + `freqNoun` for
  tasks page, TaskRow, TaskCompletedRow, EditTaskDialog, family tasks
  (was 5 copies). Page → 698. `PRIORITY_DOT` left alone — family
  palette differs deliberately (sky vs slate low).
- [x] BUGFIX: stash-once caches never updated after invalidateAll
  (mutations invisible) — unconditional assignment on promise-identity
  change, fixed on calendar + tasks pages
- [ ] calendar/tasks add-task card → AddTaskCard
- [ ] calendar/tasks toolbar (chips/search/sort) → TaskToolbar
- [x] family/[familyId]/tasks → FamilyTaskRow (open/completed/public
  variants, + 6 tests): grouped/unassigned/completed/public rows
  unified, permission-gated toggle + direct owner delete preserved.
  Page 896 → 640. Build green (browser flow needs a family — unit
  tests + build gate this one).
- [ ] calendar/+page.svelte (895) → bulk bar, smart-plan panel
- [ ] account/+page.svelte (816) → section cards
- [ ] family/[familyId]/+page.svelte (808) → sections
- [ ] EventFormModal (1420) → field-section components
- [ ] EventModal (1251) → sections
- [ ] DayView (764) / WeekView (710) → sub-blocks
- [ ] MonthDays (402) → cell component
- [ ] family/tasks (545), marketing/features (586) → split
- [ ] bills/* EXCLUDED (area PAUSED)
- Per slice: colocated/targeted vitest + oxlint + prettier + build green,
  push test immediately.
