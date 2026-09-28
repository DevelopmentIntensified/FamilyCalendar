# 072 — Kids' schedule card: per-child colour, grouped by child

Status: open

Source: `app-ui/dashboard.html` review — the card was marked **good**, "add
colors make it feel nice". Prototype approved for the card.

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The card groups rows by child, as the approved prototype does, instead
      of one flat list of events with name chips.
- [ ] Each child carries their own colour, deterministic from their id, drawn
      from the existing avatar palette. Today every child is the same hardcoded
      purple chip, so colour carries no information at all.
- [ ] The child id survives the loader. The dashboard loader already builds the
      id-keyed child map and then discards the id one line before render.
- [ ] Each child gets an initial avatar circle and their name as a heading; an
      event two children share appears under both.
- [ ] Time and location read as one line per event, as in the prototype.
- [ ] Empty states stay as they are (today vs another day, link to family), and
      a child with no events is simply absent.
- [ ] Unit tests: grouping, shared events, per-child colour, time/location, and
      the two existing empty-state cases. The first four are already written
      and failing on the current component.

## Done

## Notes

- Per-event colour exists but is useless here: every kids' row is a family
  event, so they would all share one flat colour. The signal has to be
  per-child.
- No schema change: the palette utility already exists and is tested.
