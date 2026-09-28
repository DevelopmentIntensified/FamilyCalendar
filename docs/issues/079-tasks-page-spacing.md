# 079 — Tasks page: filters, inbox and rows sit right

Status: open

Source: `app-ui/tasks.html` review — three bad marks: the filter row "needs some
space and the colours are not as soft", the assignment inbox "space needed
between items", and the row meta "the items look a little out of place and
ununiform".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The filter and sort row has breathing room, and its active/inactive
      colours are soft rather than shouting.
- [ ] The assignment inbox has real space between items — it is the one band
      that wants an action, and its rows currently run together.
- [ ] Every task row's meta line (due, then tags, then priority, then
      assignee) sits on one consistent baseline with consistent separators, so
      a row reads as a row instead of a pile of chips.
- [ ] The meta line truncates rather than wraps at 320px.
- [ ] All three bands keep their current behaviour: filter, accept/decline,
      and optimistic row updates.
- [ ] Tests for the meta line's composition (what renders, in what order) and
      for the filter row's active state.

## Done

## Notes

- Three marks, one page, one class of change. If the meta line alone turns out
  to need its own window, split it out rather than growing this one.
