# 066 — Non-overlapping events still give up column width

Status: done

Source: `calendar-ui/d-working-calendar.html` review, week view — "events are
only shifted if they overlap with other events".

**Blocked by:** None (can start immediately).

## Needs doing

- [x] An event is only narrowed by events it actually overlaps. Today the lane
      layout gives every event the day's total lane count, so a lone 7pm event
      is squeezed to half width because two unrelated events collide at 9am.
- [x] Overlap clusters are sized independently: concurrency is computed within
      the run of events that actually overlap each other, and a cluster of one
      gets the full column.
- [x] Day, week and the dashboard's compact day timeline all share the one
      layout function, so the behaviour lands in all three at once.
- [x] Tests: the layout util's suite grows the cases the review named — lone
      event in a colliding day, two-event cluster, a cluster followed by a
      third event that overlaps neither, all-day rows untouched.
- [x] The existing view suites stay green; drag-to-create and range-select
      still hit the right column (they depend on this geometry).

## Done

- **Rule:** `lanes` is now the peak concurrency **of the event's own overlap
  cluster**, not of the day. A cluster is a maximal run of events joined by
  pairwise overlap, transitively (A∩B and B∩C put all three in one run even
  when A and C are hours apart); intervals are half-open, so a 10:30 start does
  not join a cluster whose run ends at 10:30. `lane` is unchanged and still
  0-based **within the cluster**.
- `src/lib/utils/dayViewLayout.ts` — the one shared function. Lane indices
  inside a cluster are contiguous from 0 (a cluster's first event always finds
  lane 0 free), so the highest index in the run *is* its peak. Input is now
  sorted by start time internally (stable, results returned in caller's order),
  so the timeline reads by clock time rather than by array order.
- `src/lib/utils/dayViewLayout.test.ts` — 8 new cases + `packs later events
  into the first free lane` corrected: its lane *positions* `[0,1,0]` still
  hold, but the third event's count was asserting the bug (2, should be 1).
  16 tests total.
- `src/lib/components/calendar/WeekView.svelte.test.ts` — 4 end-to-end cases:
  the pair splits 50/50 while the lone event takes 100%, every chip's right
  edge stays ≤100% of its column, click-to-create still lands at 19:00 and
  range-select still reads 7:00–9:00 PM on that mixed-cluster day. 14 total.

### Measured geometry (not a vibe)

Chip box is `left: calc(lane·(100/lanes)% + 2px); width: calc((100/lanes)% - 4px)`.

| view | viewport | column body | lone event before | after |
| --- | --- | --- | --- | --- |
| day grid | 320px | 245px (320 − 16 wrapper − 2 border − 56 gutter − 1 rule) | 118.5px | **241px** (+103%) |
| day grid | 640px | 549px | 270.5px | **545px** |
| week grid | 320px | 87.5px (700px `min-w-[700px]` floor ÷ 8 tracks) | 39.75px | **83.5px** (+110%) |
| week grid | 1280px | 152px (`lg:px-8`, 1216 ÷ 8) | 72px | **148px** |

A 2-event collision at 9am is unchanged at 50% each; a 3-way peak is unchanged
at 33.3% each.

### Why drag/select hit-testing survived

Hit-testing never reads `lane`/`lanes`. Both grids bind click/drop/mousedown to
the **column** element and resolve the day and the time from
`e.currentTarget.getBoundingClientRect().top` + `e.clientY`
(`WeekView.svelte:180-201,230-235`, `DayView.svelte:157-178,206-211`), so the
lane count only moves a chip's own box. The one real risk was a chip escaping
its column and swallowing the *next* day's clicks, which is why
`lane < lanes` is now pinned as an invariant (util test + end-to-end `left+width
≤ 100`), and why the two hit-testing tests were verified to pass under both the
old and new widths.

## Notes

- Greedy lane assignment already produces correct *positions*; only the width
  (lane count) is wrong. This is a contained change to one shared function.
- The dashboard's "Today at a Glance" is a list, not a lane grid — it does not
  call `layoutTimed` today, so the "all three at once" line overstates the blast
  radius. Real consumers are `DayView` → `DayHourGrid` and `WeekHourGrid`.
  Both pick the change up from the one function with no view-level edits.
