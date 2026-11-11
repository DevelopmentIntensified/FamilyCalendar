# 120 — Calendar toolbar: three small marks, one rhythm

Status: in-progress

Source: prototype review round 2, 2026-09-30 — marks 1.15, 1.16, 1.17 on
`calendar-ui/d-working-calendar.html`, all toolbar, all with no mobile
qualifier.

**Blocked by:** None. Independent of #119 — these are not mobile-specific.

## The finding

- **1.15** search (`div.d-search`, 240×36px, showing only `⌘K`): *"move this to
  the line below this"*. The toolbar is two rows; search is on the first and
  wants the second.
- **1.16** the month label button (186×38px, "September 2026"): *"center
  this"*. It is a `<button>` inside a flex row, not centred in the toolbar.
- **1.17** the `span.rowflex` beside the Today button (80×40px): *"put on either
  side of the today button and make it a single item with buttons in it"*.

1.16 and 1.17 are the same complaint from two angles: the date navigation is
three loose pieces that should be **one centred control**. "September 2026" ·
`‹` `Today` `›` are one thing.

## Done

- [x] **The field is on the second row at every width** (`CalendarToolbar.svelte:85`),
      with the shortcut still working. A full-width field under the controls
      beats a 240px `⌘K` affordance that only means something if you already
      know the shortcut.
- [x] **Search is real, not decorative** — new `src/lib/utils/calendarSearch.ts`
      plus tests, wired through `Calendar.svelte`, with match/total counts so
      the field can say what it found.
- [x] **The date navigation is one control**, centred in the toolbar, and it is
      the SHARED one. `CalendarToolbar` mounts
      `<DayNav period="period" {onToday} {onPrevious} {onNext} />` and passes the
      month label in as `DayNav`'s new optional `leading` segment — one pill, one
      ring, one navigation landmark. `DayNav` grew that one seam and nothing
      else; its dashboard caller is unchanged (still three members, no snippet).
      `DayNav` also brought `isToday` with it, so Today can now say where you
      are (`aria-current="date"`, muted) instead of always looking live. Pinned
      by `CalendarToolbar.svelte.test.ts`: one `nav`, the shared
      `Previous period` / `Next period` / `Go to today` labels, no ring on any
      member, and the shared order `label · Today · ‹ · ›`.

## Needs doing

- [ ] **The second row must not push the grid below the fold at 1280×800** —
      measure it, do not eyeball it. Arithmetic from the shipped classes says it
      does: 40px of controls + 8px + 40px of field + 16px margins + a 44px
      weekday header + 6 rows of 104px with 8px gaps ≈ 828px of content in an
      800px window. That is ~48px worse than before the search row existed
      (≈780px), so this row is what tips it. It needs a real browser before
      anyone changes a class; Prototype E measures it live instead of asserting
      a number.
- [ ] **Keyboard parity after the DayNav adoption.** ⌘K / Ctrl+K still focuses
      the field and is printed on it — pinned. Check it still works from inside
      the day-nav pill now that the label sits in `DayNav`'s leading segment
      (the label is a button, so a bare `k` there must not summon anything).

## Notes

- These are three small marks in one component. That is one ticket, not three.
- The prototype's toolbar is *not* the app's toolbar — port the intent, then
  update the prototype to match, or the next round re-marks the prototype.
  Prototype E is the updated prototype: it copies the shipped two-row toolbar
  and the shared `DayNav` date control, so the next round marks the prototype
  and the app agree.
- `CalendarToolbar` no longer hand-builds `‹ Today ›`. It mounts `DayNav` (#119)
  and hands it the month label as an optional leading segment, so the date
  control is one pill with one ring and one navigation landmark. The order is
  the shared one — label · Today · ‹ · › — which is #120's "one centred
  control" with 118's reasoning about the order rather than a third opinion.
