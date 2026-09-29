# 068 — All-day vs timed is legible without a legend

Status: in-progress

Source: `calendar-ui/d-working-calendar.html` review, the key marked
**rebuild**.

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] Converge `chipStyle` in `src/lib/utils/eventChip.ts:8-15` on the new
      vocabulary. Its all-day branch (`background-color: ${color}33`) is the
      tint this ticket removes, and nothing imports it any more — delete it
      rather than leave a second, contradicting style helper in the tree.
- [ ] The day and week hour grids (`DayHourGrid.svelte`, `WeekHourGrid.svelte`)
      still draw their own timed chips with a hand-rolled
      `border-left: 3px solid …`. They were another agent's file this wave.
      Swap them onto `chipTreatment('timed')` + `ChipKindMark` so the timed
      treatment is the same object everywhere.
- [ ] `WeekHourGrid.svelte:101` and the all-day rows: a sponsored *timed* event
      is the one case the hour grids cannot yet show. 067 covers the label, but
      the hatch + outline treatment has to land there too.
- [ ] Visual pass at 320px in a real browser. The geometry is computed and
      unit-tested, but the month cell's ~15px of title room after the mark
      deserves eyes on a device before this closes.

## Done

- [x] An all-day event reads as all-day. It is a **bar** where a timed event is
      a **dot** — a shape difference, decodable with no key. The all-day
      translucent fill tint is gone from every view, so the fill no longer
      carries the meaning and the calendar colour is free to mean *which
      calendar*.
- [x] The chip vocabulary lives in one place: `src/lib/utils/chipVocabulary.ts`
      (pure, DOM-free) plus `ChipKindMark.svelte`, which is the only component
      that draws a mark. Month, week band, day list, list view and the day
      action sheet all read from it, so they cannot drift.
- [x] Four treatments, all distinguishable by structure alone, never by hue:
      - `timed` — 3px calendar-colour rail, 6px filled **dot**, no word.
      - `allDay` — same rail, 10×5 **bar**, word **All day**.
      - `task` — **dashed** border all round, hollow **ring**, word **Task**.
      - `sponsored` — 1px ring + rail in the calendar colour, neutral diagonal
        **hatch**, **bag** glyph, word **Ad** / announced as "Sponsored".
- [x] All-day shows "All day" text where there is room; the views that do not
      get a glyph instead of nothing, plus a screen-reader phrase so a kind is
      never glyph-only.
- [x] Per-view difference is one rule, and it is computed rather than
      eyeballed: `MONTH_CELL_CHIP_PX` in the vocabulary is derived from the
      real padding chain (320 viewport − 16 `px-2` − 4 cell `p-0.5` − 4 row
      `px-0.5` − 8 chip `px-1`, over 7 columns) and comes to ~27px. After a
      10px mark and a 2px gap that leaves ~15px — not three characters — so the
      **month cell is a glyph view**. The **week band** is also glyph-only
      because its gutter header already reads "All day" for every column. The
      **day list, list view and day action sheet** are word views: full-width
      rows, and the list/sheet are the only places a timed and an all-day event
      sit side by side.
- [x] Glyph geometry is computed from one `CHIP_GLYPH_PX` box so a mixed row
      keeps a single baseline, and every chip carries `data-chip-kind` for
      070's key to enumerate.
- [x] Survives 320px: no horizontal overflow — every chip title is `min-w-0
      truncate`, the mark is `shrink-0`, and nothing was added to the cell's
      width budget.
- [x] Tests: 20 in `chipVocabulary.test.ts` pin the four treatments, the
      geometry, the density rule and the style contract; per-view difference
      pinned in the month cell, week band and day list suites.
- [x] Exception and recurrence semantics untouched — presentation only. No
      data-model, parsing or service change in this slice.

## Notes

- Blocking 070: the key can only describe what the chips do. `KINDS` in
  `chipVocabulary.ts` is the enumeration the key should walk, and every chip in
  every view now carries `data-chip-kind` to match it against.
- For 067: the vocabulary already returns the sponsored word (`chipWord`), the
  bag glyph and the hatch. 067's job is placement in the two tight views
  (month cell, week band) and in the hour grids, plus collapsing ListView's
  hand-rolled amber "Ad" pill onto `chipWord(kind, 'word')`. The truncate
  ordering it needs is already right: the title is `min-w-0 truncate`, the mark
  is `shrink-0`.
- Colour discipline: `chipVocabulary.test.ts` asserts no treatment class keys
  off a hue, and that the sponsored hatch is neutral so it never repaints the
  chip amber. That is the reviewer's "this reads as someone else's colour"
  complaint, pre-empted.
