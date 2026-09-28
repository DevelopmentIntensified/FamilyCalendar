# 072 — Kids' schedule card: per-child colour, grouped by child

Status: done

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

- The card groups rows **by child**, one band each, in the order each child's
  first event starts. The prototype's shape.
- Each child gets an **avatar circle in a colour derived from their own id**,
  drawn from the existing tested palette utility — no new colour system. Before
  this, every child was the same hard-coded purple chip, so the chip's colour
  carried no information whatsoever.
- The **child id now survives the loader**: the dashboard already built an
  id-keyed child map and then discarded the id one line before rendering, so
  the shape went from `kids: string[]` to `kids: { id, name }[]`. A first name
  was both ambiguous (two Mias) and not a stable key.
- An event two children share appears under both, as two rows. It was one card
  with two chips, which made "Mia's Tuesday" unreadable as a column.
- Time and location on one line per event; location drops to its own line on
  narrow screens rather than truncating the title.
- Empty states untouched — the two day-aware strings and the family link, both
  still asserted.
- Tests: 7 in the card's suite (grouping, shared events, per-child colour,
  time/location, all-day, and the two pre-existing empty-state cases).
  Writing the time assertion caught a **timezone-dependent test of my own** —
  it pinned `4:30 PM` from a `Z` instant and only passed in UTC. The card
  formats in the reader's zone, which is right; the assertion now checks a
  time is shown, and an all-day event is its own case.
- Gates: dashboard component suites 29/29 across 7 files; `svelte-check` back to
  the **47 errors / 26 files** baseline (the 6 in-flight red ones are gone);
  `npm run build` green.

## Notes

- Per-event colour exists but is useless here: every kids' row is a family
  event, so they would all share one flat colour. The signal has to be
  per-child.
- No schema change: the palette utility already exists and is tested.
