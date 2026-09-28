# 068 — All-day vs timed is legible without a legend

Status: open

Source: `calendar-ui/d-working-calendar.html` review, the key marked
**rebuild**.

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] An all-day event reads as all-day. Today the only signal is a
      translucent fill tint and the *absence* of a dot — a distinction nobody
      can decode cold, and the reviewer's specific complaint.
- [ ] The chip vocabulary lives in one shared place so month, week, day and
      list cannot drift apart: a timed event, an all-day event, a task and a
      sponsored event are four distinguishable treatments.
- [ ] All-day events show "All day" text in views that have room; the views
      that do not (month cell at three chips) get a glyph instead of nothing.
- [ ] The all-day event's own fill stops being the thing that carries the
      meaning, so calendar colour stays free to mean *which calendar*.
- [ ] Tests pin each of the four treatments, and a test that the same event
      renders differently in each of the four views.

## Done

## Notes

- Blocking 070: the key can only describe what the chips do.
- Do not disturb the exception/recurrence semantics while here.
