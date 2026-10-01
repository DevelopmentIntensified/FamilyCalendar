# 093 — Stats: drop the justification card, reorder, equalise

Status: open

Source: prototype review, `app-ui/stats.html`, round 1 — 3 marks, 1 bad.

**Blocked by:** None (can start immediately).

## The finding

The page earns its place from one immutable table, and it says so in a card
titled "why this page can exist". The reviewer read that card and wrote
**"remove this"** — the argument is not doing the work the layout is doing.

Two structural notes on top:

- Recently Completed should sit directly **above** the month totals, so the
  recent list and the summary it summarises read as one block.
- The month totals box and whatever sits beside it must be **the same measured
  height**. The totals box is a fraction of its neighbour today, which reads as
  a mistake rather than as restraint.

## Needs doing

- [ ] Remove the justification card. **Before it goes, check whether it is the
      only place that argument is made anywhere in the product** — if the
      retention promise behind the page is explained nowhere else, the
      explanation is worth keeping somewhere less prominent rather than
      deleting outright. Say which you did and why.
- [ ] Reorder so Recently Completed sits above the month totals.
- [ ] Make the two boxes on that row the same height, measured rather than
      estimated. Pin it in a test so it cannot drift again.
- [ ] Keep every bounded read bounded: the completion history this page reads is
      the one place a growing table is already capped by a limit. Do not lift
      the cap to make the boxes match.

## Done

## Notes

- The page is about streaks and completion history, and the reviewer did **not**
  dispute that the history earns the page — only the card defending it.
- Round is still open in the review tool; closure belongs to the collector.