# 046 — Day/Week interaction unification + sub-block split

Status: open

Split out of #039: DayView (715) + WeekView (710) mirror each other's
drag/drop/range/delete flows. Do NOT extract sub-blocks first — unify
the behaviors, then split. (Extracting markup now would churn the exact
flows under review and prop-drill ~10 callbacks per block.)

## Done

- Filed; fence identified (see below).

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
