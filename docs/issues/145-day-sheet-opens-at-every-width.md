# 145 - The day sheet opens at every width

Status: done

## Done

- Breakpoint branch removed: `MonthDays.svelte` lost `matchMedia(smallScreenQuery())` gating and `calendarView.ts` lost the now-dead `smallScreenQuery()`; `handleCellTap` opens the day action sheet unconditionally.
- Desktop sheet geometry: below `md` unchanged (bottom sheet); at `md`+ it is a full-height 448px panel anchored to the viewport's right edge — not a centered phone dialog.
- Dismiss at every width: Escape (`svelte:window`), backdrop click, focus-trapped Close button.
- Event chips `pointer-events-none`/`inert` outside selection mode at every width — the sheet owns the tap; event details reachable via the sheet's list.
- Regression restated to ONE behaviour: table-driven `it.each([true, false])` over the possible `matchMedia` answers.
- Playwright (real Chromium, throwaway spec deleted after), 375/640/768/1024/1440: opens at every width, four options visible, `overflowX=0`, all three dismiss routes work. Geometry: 375→375×407 bottom-docked, 640→640×405, 768/1024/1440→448×852 right-anchored.
- Prototype-E exception recorded in `docs/research/review-marks-cycle-1.md`: sheet wins at all widths per owner ruling 2026-10-04; E followed everywhere else.

**What to build:** Tapping a day opens the day action sheet at **every** width,
including desktop. Today the sheet is only reachable below the wider breakpoint;
above it a tap goes straight to the day view. The owner has ruled that the sheet is
the tap target everywhere, so a tap means one thing at any width.

This settles the one open question in the calendar parity ticket. Prototype E shows
the tap going straight to the day view, so building E faithfully here would undo a
fixed defect; the owner's ruling is that the sheet wins at all widths and E is
followed everywhere else.

**Owner decision, 2026-10-04:** "do the sheet opening at all widths".

**Blocked by:** None (can start immediately).

**Status:** done

- [ ] Tapping a day in the month grid opens the sheet at every viewport width, with
      no breakpoint where the behaviour differs
- [ ] The sheet at desktop width is not a phone-width dialog stranded in the middle
      of a wide grid - it is anchored and sized for the space it is in
- [ ] Every option the sheet offers is reachable and works at every width
- [ ] The sheet is dismissible by keyboard, by backdrop and by escape at every width
- [ ] The regression test that closed the two-behaviour defect stays green, restated
      to assert one behaviour at all widths rather than two consistent ones
- [ ] Measured at 375, 640, 768, 1024 and 1440 - real browser, recorded numbers

**Note:** this deliberately departs from the approved prototype at this one point,
on the owner's instruction. Record it as an explicit exception with a reason, not as
a silent divergence - the parity check must be able to explain every difference.
