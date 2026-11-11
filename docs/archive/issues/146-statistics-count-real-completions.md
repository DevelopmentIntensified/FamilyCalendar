# 146 - The statistics page counts real completions

Status: done

## Done

- Shared action `taskStats.ts` counts every completion figure off `taskCompletions` history: `completedOnce` = `count(distinct taskId)` over history (re-check-offs don't inflate), `recurringCompletions` from history rows (replaces `sum(tasks.completionCount)`), `recentlyCompleted` from latest history instants per task (recurring check-offs now visible; undo-cleared one-offs no longer shown). `month` + `doneBy` moved INTO the action from the loader — one counting path, loader forwards verbatim.
- Streak reuses the day dashboard's `getCompletionTimestamps` + shared `computeWeeklyStreak` (also fixed a divergence: birthday-style `userId` attribution → actor-with-owner-fallback).
- Caller list: exactly one caller (stats page loader), verified by repo grep; page component + its 13 tests untouched and passing.
- Recurrence steadiness test in scripted-drizzle `taskStats.completions.test.ts`: 5 vs 6 check-offs of the same weekly task keep `completedOnce`=2 / `recurringTasks`=1 steady, completions count up truthfully; every completion figure's query origin is the history table (2 red against old code first).
- Corrected historical values (true jump, expect it): `recurringCompletions`, `completedOnce` (recurring now included), "Recently completed" (recurring check-offs appear) rise vs. old undercounts; `month` unchanged; streak can rise for users whose recurring tasks are checked off by family members. No dedupe/clamp/smoothing anywhere.

**Blocked by:** None — started immediately.

**Status:** done

**What to build:** The statistics page keeps its place and its links, and its
numbers stop drifting. Six of its seven figures count a column that the recurring
task cursor overwrites every time a repeating task is checked off, so a family's
completed-work totals drift toward "only the recurring ones".

The month card has already been moved onto the real completion history. This ticket
finishes the job for the remaining figures.

**Owner decision, 2026-10-04:** "fix the numbers, keep the page".

**Blocked by:** None (can start immediately).

**Status:** in-progress

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
