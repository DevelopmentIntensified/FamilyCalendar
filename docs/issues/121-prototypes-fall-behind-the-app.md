# 121 — The prototypes are behind the app, and reviewing them marks finished work

Status: open

Source: prototype review round 2, 2026-09-30. Raised by triage, not by a mark.

**Blocked by:** None.

## The finding

Round 2 produced 35 marks. **Nine of them describe work that is already
shipped**, because the prototype still shows the version that was rejected:

| Mark | Says | Reality |
|---|---|---|
| Groceries 1.2 | "make each store have configurable color" | done, #096 |
| Groceries 1.3 | "both at once like tasks with filters" | done, #097 |
| Tasks 1.1 | "create a b prototype with the sections not separate" | `b-tasks-flat.html` exists |
| Tasks 1.2 | "add small search on this line" | done, `TaskToolbar.svelte:51` |
| Dashboard 1.2 | member strip "is unneeded" | done, #103 |
| Family settings 1.1 | "compact this" | done, #077 |
| Family settings 2.1 | gear button should match its neighbours | the app already does; only the prototype lags |
| Calendar 1.1/1.13/1.14 | mobile rail problems | the app dropped the rail below 768px in #104; **the prototype never changed** |
| Stats/Archive/Icon | 5 marks | genuinely open, in #093/#094/#095 |

Nine of thirty-five. That is a **26% false-positive rate on the review**, and it
is worse than the count suggests: each false positive costs a triage decision,
and mark 1.2 ("this is unneeded") is a request to remove something that was
removed three commits ago.

## The cause

A ticket closes in the app. The prototype is not in its acceptance criteria,
because the prototype is not code — it is a picture of an idea. So the idea
stays frozen at the moment it was approved and the page keeps showing the
defect the reviewer already asked to fix.

Round 1 made this worse: the marks were cleared from `feedback/` on 2026-09-30
while the pages stayed. The record of what had been marked went; the stale page
stayed.

## Needs doing

- [ ] **Every prototype carries the state of the work it depicts.** A prototype
      whose tickets are all `done` says so on its face, in the page, where the
      next reviewer sees it before marking anything.
- [ ] `review-check.mjs` fails when a page's tickets are all closed and the page
      still shows the superseded shape. That check is the only thing that stops
      this recurring, because nothing else notices.
- [ ] **Removing a module from the app removes it from the prototype in the same
      slice.** The Member Strip is the worked example: #103 took it out of the
      app and left it on the dashboard prototype, and mark 1.2 is the receipt.
- [ ] A rebuild is not optional when a page is flagged redo. Mark 1.1 is redo and
      the rebuild never happened; the page is now three review rounds stale.
- [ ] Re-review the pages in this round *after* the app catches up, or accept
      that round 2's nine false positives stand as triage cost.

## The one thing I am not deciding

Whether the calendar keeps a prototype at all. It is the largest set, the most
rebuilt, and the one most often behind the app. `d-working-calendar.html` is
three rounds stale and 070 ("the key itself") was never built. Keeping a
prototype of the grid is defensible; keeping one that can only mislead is not.
Ask before deciding.

## Notes

- This is the second time this session that a review artefact outlived its
  subject: the first was the cleared mark records. The pattern is the same —
  nothing enforces that a picture and its product stay in step.
- Do not solve this by reviewing only what is unreviewed. Nine marks this round
  were on pages that had *already* been reviewed and closed, which is exactly
  when the drift is worst.
