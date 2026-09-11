# 046 — Day/Week interaction unification + sub-block split

Status: in-progress

Split out of #039: DayView (715) + WeekView (710) mirror each other's
drag/drop/range/delete flows. Do NOT extract sub-blocks first — unify
the behaviors, then split. (Extracting markup now would churn the exact
flows under review and prop-drill ~10 callbacks per block.)

## Done

- Filed; fence identified (see below).
- Parity review 2026-09-11 (no behavior change): script diff is 158
  changed lines, all accounted for:
  - IDENTICAL (shared or verbatim): moveEvent + buildMovePayload (both via
    `$lib/utils/eventMove`), exit-selection ask, mouse range handlers,
    touch handlers incl. #047 addMode, steppers, EventModal + refreshAll.
  - Explained by single- vs multi-day: Day reactive `$: selectedDate /
    dayEvents / allDay / timed / dayTasks` vs Week `getEventsForDay /
    getTasksForDay(day)` fns; Week `getEventTop/getEventHeight` (%) vs Day
    `layoutTimed` (overlap columns); `selecting`/`rangeSel` carry `day` in
    Week only; Day auto-scrolls to current hour onMount, Week doesn't; Day
    `dispatch('back')` vs Week `openDay` prop + legacy `removeEvent` prop.
  - Unify candidates: PX_PER_HOUR 56 (Day) vs 60 (Week) — visual density,
    parameterize don't merge; Day allDay-first sort vs Week markup sort.
- Decision: the ONE remaining duplication is the range-select state
  machine (~120 lines ×2). Unify as framework-free `rangeSelect.ts`
  machine (always carries day) + thin adapters; move helper already
  shared, geometry converges later per issue.

## Needs doing

- Parity review (no behavior change): map Day vs Week for drag-move
  (moveEvent + buildMovePayload, exit-selection ask), empty-grid
  click-to-create (suppressClick fall-through, closest('button')
  guard), range select (mouse drag + long-press + steppers +
  rangeTouch action), delete/refresh (EventModal + refreshAll).
  Record divergences here.
- Unify: one shared range-select action + one move helper used by
  both views. Geometry (`getEventTop`/`getEventHeight` week-only;
  DayView uses `layoutTimed` from dayViewLayout) converges as part
  of this — no separate geometry util before parity is settled.
- Then split sub-blocks per #039 rule (markup + pure logic out,
  colocated tests): week header, all-day row, hour grid + overlay,
  exit-selection ask; day equivalents.
- Per slice: colocated/targeted vitest + oxlint + prettier + build
  green, push test immediately.

Fence: DayView (16 layout/interaction tests incl. dayViewLayout) +
WeekView (43 interaction tests per #039) stay green throughout —
behavior changes must be red-green, not drive-by.
