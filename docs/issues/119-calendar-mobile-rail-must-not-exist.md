# 119 — On mobile the calendar is not the page. The rail is.

Status: in-progress

Source: prototype review round 2, 2026-09-30 — 7 marks on
`calendar-ui/d-working-calendar.html`, 3 of them bad and one flagged rebuild.

**Blocked by:** None. Follows the decision already taken in #104 (no rail below
768px, rail kept on desktop) — this ticket pushes that line to tablet and fixes
what the rail should *become* when it is not beside the grid.

## The finding

**1.1 (bad, rebuild):** *"When we are in mobile view, the calendar disappears,
can we improve the way this page is on mobile so the calendar is still the main
focus and other things are not in the way."*

That is the whole ticket. The calendar grid — the thing the page is named for —
loses to a 352px rail of five cards. At 400px wide the prototype measured
`#railDesktop` at 352×646 against a `div.wrap` of 400×3188, and the rail wins
the first screen.

**1.13 (bad):** the overdue-tasks card "shouldn't be on mobile view". It is a
Task surface, and Tasks already has a page.

**1.14 (bad):** *"The circle is really big on tablet view. Also on tablet view we
need the cal view, not the micro cal view. Where did the month view go on
mobile? that should be default."*

Three separate claims: a touch-target regression at tablet, the mini month
showing where the real month grid should be, and **month view as the mobile
default** — which contradicts the width-aware default from #104 and needs a
decision, not an assumption.

**1.4 / 1.10 / 1.11 (ideas), all mobile-only:**
- calendars "should be a modal that opens from a button"
- up next "should be just part of dashboard on mobile"
- by person "unneeded on mobile and should be filter buttons"

## Owner decisions, 2026-09-30 — settled, do not re-ask

1. **Month view is the default on mobile.** Supersedes the width-aware default
   from #104 on narrow screens only.
2. **Up Next leaves the calendar entirely** — desktop and mobile. It is already
   on the dashboard. Do not re-add it.
3. **A new prototype E** carries the answer. D stays on disk as the record with
   `supersededBy` pointing at E.

## Done

- [x] **The mobile opening view is the month grid.** `calendarView.ts` moved the
      width ABOVE the stored view, so a phone no longer inherits a week or day
      grid picked on a laptop. The doc comment records the supersession of #104
      and why: a stored view is remembered across devices, so the first screen
      stopped being the calendar — which is mark 1.1. A `?view=` deep link still
      wins, because that is a statement about this screen. Wide screens are
      untouched.
- [x] **Search is on the second toolbar row at every width** (#120 mark 1.15) —
      recorded here because it shares the mobile problem, owned there.
- [x] **The rail is gone at EVERY width — and gone at tablet.** There is no
      `<aside>` in the calendar route at all, and the toolbar's calendar filter
      is a button that opens a bottom sheet on a phone. The pin is
      `Calendar.svelte.test.ts`: the loop over widths now includes **768**
      (it used to jump 375 → 1280 and call it covered), and a second pin
      asserts the page is ONE full-width column — `data-testid="month-grid"`,
      `grid-cols-7`, no `max-w-` and no second `grid-cols-[…]` track, so there
      is nowhere for a side pane to be re-added.
- [x] **Touch targets at tablet (mark 1.14).** The oversized cell was real and
      was NOT the mini month. `MonthDayCell` sized a day cell 104px tall from
      Tailwind's `sm` (640px) while the app's own breakpoint — the number
      `calendarView.ts` says "the boundary this file names and the boundary the
      stylesheets use are the same number" — is 768. So 640–767px got a 104px
      cell, and at 768px a cell measured ~98 × 104: a 104px tap target on a
      screen that is itself 768px tall, six rows of it. Now three steps —
      `min-h-[72px]` / `md:min-h-[92px]` / `lg:min-h-[104px]`.
      The second half of the same defect: `MonthDays` read a typed
      `(max-width: 767px)` and put the cell in day-action-sheet mode, while the
      cell revealed its per-cell `+` and dashboard tools at `sm` (640px) —
      640–767px answered one tap two ways, with 20px-square targets. Both now
      derive from `VIEW_BREAKPOINT_PX` (`smallScreenQuery()`, `md:`).
- [x] **Calendars became a sheet on mobile (1.4)** — already landed with the
      `calendar-filter-panel` (bottom sheet below `md`, popover above) and
      pinned by tests in `CalendarToolbar.svelte.test.ts`.
- [x] **Overdue tasks left the mobile surface (1.13).** A due task is drawn in
      the day cell for the day it is due, in red when late. No card at any
      width, pinned.
- [x] **By person (1.11) — a decision, not a conversion.** It survives NOWHERE
      in the app: there is no by-person card, and no per-member filter either,
      so there is nothing to convert and nothing to keep on a desktop rail that
      does not exist. The idea is answered in Prototype E as filter rows inside
      the Filters sheet, labelled there as prototype-only. If a per-member
      filter is wanted in the product it is a NEW filter, not a moved card, and
      it belongs in that same sheet — flagged here, not built.
- [x] **Up Next left the calendar entirely.** It was never in the app; the pin
      is the existing no-ghosts assertion at all three widths, so it cannot come
      back quietly.
- [x] **The shared `DayNav` is adopted.** `CalendarToolbar` mounts
      `<DayNav period="period" {onToday} {onPrevious} {onNext} />`; its own
      `‹ Today ›` is gone. The toolbar's month label goes in as the pill's new
      optional `leading` segment, so the date control is still ONE control with
      ONE ring and one navigation landmark. Order is the shared one —
      label · Today · ‹ · › — because 118's reason for the order ("Today is the
      way back, the arrows are the way along") is better than the literal
      reading of prototype mark 1.17, and the drift this ticket exists to close
      is precisely the toolbar keeping an order of its own. `DayNav` also gained
      `isToday` from the toolbar, so Today says where you are
      (`aria-current="date"`, muted) instead of being a control that is always
      live. New prop `isCurrentPeriod` on the toolbar; the question is answered
      by `isCurrentPeriod(view, date, now)` in `calendarView.ts` beside the rest
      of the view vocabulary.

## Needs doing

- [ ] Nothing outstanding in the app. The ticket's own question is answered and
      pinned; what is left is review traffic on Prototype E.
- [ ] **Measure #120's open item properly**: "the second row must not push the
      grid below the fold at 1280×800". Arithmetic from the shipped classes says
      it does (88px of toolbar + a 6×104px grid + a 44px weekday header ≈ 828px
      of content in an 800px window), and the same arithmetic said the grid was
      already 780px before the search row. It needs a real browser, not the sum
      of two class lists, and E measures it live rather than asserting it.

## Notes

- The cancelled lane that began this ticket shipped the view resolution and the
  toolbar row; 333 calendar tests passed when this work started. What was left
  is the rail itself and Prototype E. Do not redo the view resolution — read
  `calendarView.ts` first.
- The prototype is the stale artefact here. The app has moved past it and the
  review describes the prototype's layout, not the product's. That is why half
  the "Needs doing" list above turned out to be already-true and needed a test
  rather than a change: marks 1.4, 1.10, 1.11 and 1.13 were describing D's rail,
  which the app never had.
- Prototype E answers all of this and carries its own `#fb-page` block. Its
  notes name the two defects the app STILL has (the grid runs past the fold at
  1280×800; there is no per-member filter) rather than smoothing them over —
  ground rule 7.
