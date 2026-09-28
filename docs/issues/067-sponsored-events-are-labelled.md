# 067 — Sponsored events are not labelled as sponsored

Status: open

Source: `calendar-ui/d-working-calendar.html` review, the key marked
**rebuild** — "can you make it true with the events themselves".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] A sponsored event names itself. Today it is an amber fill plus a store
      icon, which reads as "someone else's colour", not "this is an ad".
- [ ] The label appears in every view that shows sponsored events: month
      cells, the week and day grids, the all-day row, the list view, and the
      day action sheet.
- [ ] The label does not crowd a tight chip — month cells are three chips deep
      at 320px, so the name has to truncate before the label does.
- [ ] Sponsored display stays opt-in per the user's ad settings; nothing here
      changes when ads are off.
- [ ] Tests per view for the label's presence, and for its absence when the
      event is not sponsored.

## Done

## Notes

- The `isAd` flag already reaches every view, so this is presentation, not
  plumbing. Blocking 070.
