# 069 — The calendar grid cannot filter by calendar

Status: open

Source: `calendar-ui/d-working-calendar.html` review — the key claims "colour =
calendar · see the rail to filter", and the grid cannot do that.

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] Per-calendar visibility toggles in the calendar toolbar, so a colour
      means something you can act on.
- [ ] Hiding a calendar hides its events in every view — month, week, day,
      list — and its due tasks with it.
- [ ] Toggles survive a reload (per user, per device), and "hide all" /
      "show all" are one tap.
- [ ] The toggle state is independent of which calendar new events land in
      (the existing default-calendar setting keeps that job).
- [ ] Hiding every calendar leaves a real empty state, not a blank grid.
- [ ] Tests: toggling filters the fed events; persistence round-trips; the
      default-calendar setting is untouched.

## Done

## Notes

- Today the only calendar-aware control chooses the *default* calendar for new
  events, and the calendar's name appears in the list view only.
- Shares the toolbar row with 071. Land them in sequence, not in parallel.
- Blocking 070.
