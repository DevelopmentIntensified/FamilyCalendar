# 066 — Non-overlapping events still give up column width

Status: open

Source: `calendar-ui/d-working-calendar.html` review, week view — "events are
only shifted if they overlap with other events".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] An event is only narrowed by events it actually overlaps. Today the lane
      layout gives every event the day's total lane count, so a lone 7pm event
      is squeezed to half width because two unrelated events collide at 9am.
- [ ] Overlap clusters are sized independently: concurrency is computed within
      the run of events that actually overlap each other, and a cluster of one
      gets the full column.
- [ ] Day, week and the dashboard's compact day timeline all share the one
      layout function, so the behaviour lands in all three at once.
- [ ] Tests: the layout util's suite grows the cases the review named — lone
      event in a colliding day, two-event cluster, a cluster followed by a
      third event that overlaps neither, all-day rows untouched.
- [ ] The existing view suites stay green; drag-to-create and range-select
      still hit the right column (they depend on this geometry).

## Done

## Notes

- Greedy lane assignment already produces correct *positions*; only the width
  (lane count) is wrong. This is a contained change to one shared function.
