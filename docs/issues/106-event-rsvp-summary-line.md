# 106 — Event: the RSVP list collapses to a summary line

Status: open

Source: `app-ui/event.html` review, prototype approved (no marks). Thesis:
"Keep the page, drop the RSVP to a summary line. The grid already shows who is
going; a page that repeats it is a dead end."

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The attendance block leads with a count and a proportion — how many are
      going out of how many were asked — instead of a bare total. The app shows
      the total number of attendees and nothing about the split.
- [ ] Your own RSVP is a first-class action on the page, in the same place the
      prototype puts it, rather than a separate section below the attendee
      list. It stays optimistic, still reverts on failure, and still says what
      happened.
- [ ] The attendee list stops being the page's second half. If it stays, it is
      the detail under the summary and not a peer of it. If it goes, the
      summary line has to carry enough to be useful on its own.
- [ ] Guests and members are distinguishable. Attendance rows exist for named
      guests who have no account behind them, and the summary must not imply
      every name on it is a family member.
- [ ] Everything the page already does survives: the recurrence and exceptions
      section, the edit affordances, and the existing attendance mutation.

## Done

## Notes

- The app already has both halves, which is what the approved page argues
  against: an attendee list with a per-person status, and a separate "your
  RSVP" control further down. The prototype's argument is that the second is
  the answer and the first is a dead end. That is a judgement about which one
  leads, not a deletion — but it does mean one of the two blocks has to stop
  being a peer of the other, and that is the real work.
- **The load-bearing premise needs checking before the deletion lands: does the
  grid actually show who is going?** The prototype says it does and uses that
  to justify removing the list from the page. There is already work on
  creator/attendee indications in the grid (026), and an attendance badge
  component exists. If the grid only shows an indication for the event's
  creator rather than for everyone going, the premise is half true, and the
  summary line has to carry more than it otherwise would. Verify, then decide.
- 026 is the existing ticket for grid-side RSVP indication. Read it before
  changing what the grid shows, so the two do not each assume the other did it.
- The event detail page is the largest calendar page in the app. The prototype
  argues about composition, not structure — resist turning this into a rewrite
  of the file. The change is one block's shape and where the RSVP control sits.
