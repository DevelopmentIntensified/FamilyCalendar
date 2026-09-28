# 071 — Prototype: calendar search moves into the toolbar

Status: open

Source: `calendar-ui/d-working-calendar.html` review, rail search — "move this
to be on top of the calendar in the bar with everything else".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] In the calendar prototype set, the search input leaves the rail and sits
      in the top toolbar row with the other controls.
- [ ] The prototype keeps the whole feature set while it moves: a search that
      filters the grid still filters the grid, the rail keeps its mini month,
      up next and calendars.
- [ ] Recorded on the prototype as a proposal, not a description. **The
      shipped app has no search anywhere** — the rail search was invented by
      the prototype, so this is a prototype-only change and the proposal is
      labelled as one.
- [ ] The tree check and the calendar lint/smoke suites pass; the review round
      for prototype D is closed with this note resolved.

## Done

## Notes

- If the search graduates to a real feature it becomes its own ticket against
  the app, sized as a feature (index, query, results) rather than as a move.
