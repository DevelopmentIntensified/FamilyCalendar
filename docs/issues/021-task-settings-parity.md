# 021 — Task settings parity: dashboard priorities + calendar

Status: in-progress

## Done

- Dashboard TopPrioritiesCard: Family pill / 🌐 Public / 🔒 Private pills
  (text-[10px]) + "→ Name" assigned badge (amber) on rows; plain You /
  Unassigned subline kept otherwise. Display/toggle-only card — no
  quick-add to wire (labels were the whole job). Test file added.
- Calendar page task creation (EventFormModal task mode): title runs
  through parseTaskQuickAdd (same parser as tasks page) — #public/#private
  → visibility (explicit tag wins over picker), @family → familyId,
  @name → roster assignee, unknownMember → inline error (never silent).
  Visibility picker (🌐/🔒 select) added; help "?" panel next to title.
  Payload sends full parsed set + explicit `familyId: null` on personal
  creates (POST default would family-scope). Event-mode behavior and
  EventFormModel untouched — its suite green.
- calendar/+page.server.ts now returns `familyId`; passed to the create
  modal as new `familyId` prop (edit modal untouched).
- FamilyTaskBoardCard quick-add: help "?" panel; unknown @member blocked
  with inline error (was silently dropped); payload now sends tags +
  recurrence for parity. Semantics: board is family context — familyId
  always stays; `#private`/`#public` are stripped from the title and
  visibility is NOT sent (family tasks don't use visibility, #019);
  @family is a no-op (same familyId); @name assigns within roster.
- TaskDetailModal (calendar task popup): Family / 🌐 / 🔒 pills next to
  tags; CalendarTask type extended with familyId/visibility (both already
  in dueTasks JSON — load shape unchanged).
- Deferred: Family/Public/Private pills on the tiny calendar-grid task
  chips (DayView/WeekView/MonthDays dashed chips) — chips too small for
  pill rows, e2e-text risk; board rows get no Family pill (every row is
  family by definition; assignee = group header).
- Gates: vitest 1182/83 files green (+20 new tests: modal task-mode
  scoping table, board quick-add table, top3 labels), e2e mobile +
  events green, oxlint/prettier clean, check 0, build pass, autofixer
  clean (pre-existing suggestions only). Not committed.

## Needs doing

- (none — full parity shipped; see notes above for deferred chip labels)
