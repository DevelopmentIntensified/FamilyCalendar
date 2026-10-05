# 146 - The statistics page counts real completions

Status: open

**What to build:** The statistics page keeps its place and its links, and its
numbers stop drifting. Six of its seven figures count a column that the recurring
task cursor overwrites every time a repeating task is checked off, so a family's
completed-work totals drift toward "only the recurring ones".

The month card has already been moved onto the real completion history. This ticket
finishes the job for the remaining figures.

**Owner decision, 2026-10-04:** "fix the numbers, keep the page".

**Blocked by:** None (can start immediately).

**Status:** open

- [ ] Every completion figure reads from the completion history table, never from the
      column the recurrence cursor overwrites
- [ ] The change is made in the shared statistics action, not worked around in the
      page loader - a second counting path is how the two drifted apart
- [ ] A recurrence test proves the numbers hold steady across repeated check-offs of
      the same repeating task, which is the defect in one test
- [ ] The streak remains a single definition shared with the day dashboard, not a
      second implementation
- [ ] Any caller of the shared action is unaffected, or its callers are updated and
      listed
- [ ] Numbers that were previously wrong are shown correctly and the change is
      recorded, since a corrected historical figure will look like a jump

**Note:** do not dedupe, clamp, or smooth a figure to make it look stable. The
number should be true, and a true number may change.
