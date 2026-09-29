# 067 — Sponsored events are not labelled as sponsored

Status: in-progress

Source: `calendar-ui/d-working-calendar.html` review, the key marked
**rebuild** — "can you make it true with the events themselves".

**Blocked by:** None (can start immediately).

## Needs doing

- [x] A sponsored event names itself. Today it is an amber fill plus a store
      icon, which reads as "someone else's colour", not "this is an ad".
- [x] The label appears in every view that shows sponsored events: month
      cells, the week and day grids, the all-day row, the list view, and the
      day action sheet.
- [x] The label does not crowd a tight chip — month cells are three chips deep
      at 320px, so the name has to truncate before the label does.
- [x] Sponsored display stays opt-in per the user's ad settings; nothing here
      changes when ads are off.
- [x] Tests per view for the label's presence, and for its absence when the
      event is not sponsored.

## Done

**Every view now names a sponsored event, from `chipVocabulary` only** — no
view invents a string. Two densities, decided from the real padding chain at
320px:

**Word views** (the word is rendered by `ChipKindMark density="word"`):

- `DayAllDayList` — already correct via `chipKindOf`; pinned by tests only.
- `ListView` — the hand-rolled amber `Ad` pill is **deleted** and the mark
  guard changed from `{#if event.allDay}` to `{#if kindWord}`, so a *timed* ad
  is labelled too (the old guard left it naked). No `amber` class remains.
- `DayActionSheet` — mark moved from `glyph` to `word`; the `{:else}` branch
  that printed the word only for all-day is gone (it now renders the clock).
- `DayEventsModal` — joined the vocabulary for the first time: the hand-rolled
  colour dot and the literal `<span>All day</span>` both replaced.
- `TodayGlanceCard` (Day Dashboard) — same: hand-rolled dots and a literal
  `All day` replaced; `GlanceEvent` gained an optional `isAd`.
- `DayHourGrid` — the grid #068 never reached. Now `density="word"`: a single
  column leaves ~250px at 320px, so the word fits beside the title.

**Glyph views** (word cannot fit; the name rides the hover hint instead, via
`chipA11y(kind, 'glyph')` — the same phrase a screen reader gets — plus bag +
solid box + neutral hatch):

- `MonthDayCell` — after the 10px mark and 2px gap only **~15px** is left, so
  the title must keep the room. The chip tooltip is now `Sponsored · <title>`.
- `WeekAllDayRow` — the band chip had **no `title` attribute at all**, which is
  precisely why an ad there was nameless. Added.
- `WeekHourGrid` — the other grid #068 never reached. A day column is
  (304 − 56)/7 = **35.4px**; after the 3px rail, 8px padding, 10px mark and 2px
  gap only **~8.4px** is left versus the **~11.2px** the word "AD" needs.

`chipVocabulary.ts` and `chipVocabulary.test.ts` are **untouched** — the
"hatch is neutral" test still guards against an ad reading as a calendar
colour, and the per-view tests re-assert no `amber` on any sponsored chip.

### Numbers at 320px (all computed, none eyeballed)

| view | chip | after mark | verdict |
|---|---|---|---|
| `MonthDayCell` | 27.4px | ~15.4px | glyph |
| `WeekHourGrid` | 31.4px | ~8.4px | glyph |
| `DayHourGrid` | ~250px | ample | word |

## Notes

- The `isAd` flag already reaches every view, so this is presentation, not
  plumbing. Blocking 070.
- The dashboard's `+page.server.ts` does not currently select ad events, so the
  `TodayGlanceCard` ad path is tested but not yet reachable in production. That
  is a plumbing change outside this issue's scope (and outside this slice's
  file ownership).
- `data-chip-a11y` is announced by screen readers, so the accessible name was
  already correct throughout; the work here is the *visual* name.
