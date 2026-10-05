# 145 - The day sheet opens at every width

Status: open

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

**Status:** open

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
