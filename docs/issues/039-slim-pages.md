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
- [x] account/+page.svelte 816 → 522: AccountCalendarSection
  (settings form + reload-sync $effect pattern, + 2 tests incl.
  reload-sync). Calendar tab browser-verified. More sections to go
  (subscription/email/security/danger are small).
- [x] family/[familyId] 808 → 782: `familyDisplay.ts` (+ 4 tests) holds pure
  canEditRole/canRemove/rolePillClass/memberDisplayName; page keeps thin
  viewer-bound wrappers. Rescued orphan `familyDisplay.test.ts` (was red —
  missing module, spec contradicted shipped UI); test aligned to shipped
  semantics (amber/emerald/blue pills, email → 'Family member' fallback).
- [x] EventFormModal 1420 → 1303: EventRecurrenceFields (repeat +
  reminder + scope radios, + 2 tests) + EventTitleFields (title +
  description + Show More, + 3 tests), both bound to the shared form
  model.
- [x] EventFormModal → 1134: EventQuickAdd (NLP input + multi +
  report, + 4 tests) + EventMetaFields (location + attendees +
  calendar picker, + 2 tests). Gate placement verified (location in
  outer auto-reveal gate), NLP auto-reveal browser-verified.
- [x] EventFormModal → ~1010: EventDateTimeFields (day toggles +
  RecurrenceFields + dates + times, + 2 tests; recurrence nests
  inside). Modal open + Show More + all fields browser-verified.
- [x] EventFormModal → 941: EventDeleteConfirm + EventActionBar
  (+ 6 tests). Submit verified end-to-end (event created in DB;
  modal-stays-open is pre-existing rapid-entry behavior, page never
  closes).
- [x] EventFormModal → 843: EventRsvpList + EventTaskFields (+ 4
  tests). Task-mode form browser-verified.
- [x] EventFormModal → 753: EventModalShell (overlay + grab handle +
  gradient header + close, children snippet, + 2 tests). Title/close
  browser-verified.
- [x] EventFormModal → 734: pure `shiftEventDates` multi-date fan-out
  → EventFormModel (+ 2 tests, tz-safe assertions). Create smoke
  verified (event in DB). To go: parseNlInput/reportPhrase,
  handleSubmit/createAllEvents orchestration, task-mode lets.
- [x] Calendar page 919 → 719: `bulkPlan.ts` (describePlanOp +
  past-checks, + 4 tests) + `BulkEditBar.svelte` (+ 5 tests).
  Selection-mode bar browser-verified (0 selected shows).
- [x] Duplicate kill: EventModal checklist → shared ChecklistSection
  (−200 lines: fetch/add/toggle/delete fns + state + markup).
  EventModal 1251 → 1051. Modal open + checklist header browser-
  verified (bench session). Note: empty events now show the checklist
  header + add affordance (was hidden) — deliberate discoverability.
- [x] EventModal → 886: EventAttendeeGroups (5 status groups collapse
  into one config-driven loop + getInitials, + 2 tests). All 15 modal
  tests green. Process fix: gate commits on tests AND build — a bad
  push went out with 1 failing test (caught + fixed forward same
  session).
- [x] EventModal → ~640: EventDetailList (date/time, calendar, creator,
  location, reminder, description, export links + helpers, + 2 tests).
  Modal content browser-verified (date, calendar, exports render).
  Drive-by: 'dayly' → 'daily' copy fix in the repeats line.
- [x] EventModal → 406: EventRsvpRow (optimistic RSVP + list refresh
  + counts, + 2 tests; invalidate awaited). RSVP row browser-verified.
  All 17 modal tests green.
- [x] EventModal → 372: `eventDuplicate.ts` (+ 2 tests) holds the copy
  payload builder (attendees mapping included). Duplicate-payload
  modal test green.
- [x] EventModal → 517: EventModalBar (delete/duplicate confirms +
  3 action buttons, + 4 tests; placement tests still green).
  Bar buttons + delete-confirm-cancel browser-verified (bench data
  kept).
- [x] Duplicate kill: `bottomSheetSwipe.ts` (+ 3 tests) unifies the
  byte-identical swipe-to-close in EventModal + EventFormModal
  (immutable transitions keep legacy reactivity). EventModal open +
  delete flow browser-verified. Modal 843 → 806.
- [x] Duplicate kill: `taskSubmit.ts` (+ 5 tests) unifies modal
  submitTask + AddTaskCard.addTask (same parser/guards/POST).
  Both callers rewired; modal task-tab submit verified end-to-end
  (task in DB; dialog-close is pre-existing page behavior). Modal →
  816. Note: bare modal recurrences now get a today-end cursor like
  the card (modal previously sent null).
- [x] ListView 320 → 284: `listGroup.ts` (+ 4 tests) holds toDateMs/dateKeyOf/
  groupByDateKey; freqNoun reuses shared taskDisplay via freqLabel wrapper.
- [x] EventDetailList 227 → 166: export URL builders moved to the new header
  menu (below); body export-button block deleted.
- [x] EventModal header export menu (user request): `EventExportMenu.svelte`
  (+ 3 tests) — ⋮ three-dot button top-right beside Close, Google + .ics
  menuitems, outside-click/Escape close (NotificationBell pattern), hidden
  for ads. +2 EventModal header tests (menu present / ads hidden).
- [x] DayView 764 → 715: dropped local layoutTimed (byte-identical to
  tested dayViewLayout util) + freqNoun (→ shared taskDisplay).
  16 DayView/layout tests green.
- [x] TaskDetailModal 352 → 294: `formatDueLong` joins shared taskDisplay
  (+ 2 tests); freq/priority/overdue reuse shared taskDisplay + priorityTone
  (low chip sky → shared slate-muted); `TaskDetailBar.svelte` (+ 4 tests)
  owns skip/delete-confirm/complete bar.
- [ ] DayView/WeekView interaction unification (drag/drop/range/delete
  flows mirror each other) → separate issue: needs behavior-parity
  review before touching (43 existing interaction tests are the fence).
- [ ] WeekView (710) → sub-blocks
- [ ] MonthDays (402) → cell component
- [ ] family/tasks (545), marketing/features (586) → split
- [ ] bills/* EXCLUDED (area PAUSED)
- Per slice: colocated/targeted vitest + oxlint + prettier + build green,
  push test immediately.
