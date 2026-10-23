# 203 — Split tasks into recurring vs non-recurring lists (page + dashboard)

Status: open

Source: user bug report (product directive, not defect), https://www.familyplanz.com/report-bug, 2026-10-22 19:34: "move recurring tasks out of the tasks list and have two tasks list on the task page one with recurring and one with not. Dashboard too".

## Done

- Placeholder to recall the tension: #119 (approved) built the main Task list as ONE FLAT band with no section heading and no sticky, and printed counts on the jump bar instead. #110 moved the recurring-cursor pin INTO every list read so recurring rows never go stale.

## Needs doing

- Owner decided this overrides #119's "one flat run of rows" ruling for the tasks PAGE and the DASHBOARD Top-list module both. Griddle or section split acceptable — no tablist (same rule).

## Needs doing 2 (implementation, after green)

- Implement the split: recurring and non-recurring land in two labelled lists on /calendar/tasks AND the dashboard Top-list module resolves which bucket a row drops into. Layout: keep cursor pins working across both lists via getTasks for each bucket; add a "recurring" label row + counts; TDD: (1) a recurring task NEVER appears in the non-recurring bucket, (2) both buckets read from the same shared sync, (3) dashboard module shows only its bucket, no double counts, (4) jump-bar/print counts reflect both buckets without double-counting shared rows.
- Do NOT touch family/tasks unless the ticket after is accepted — this ticket is tasks page + dashboard only.
- Offset work: TaskRow/markup likely shared, so isolate the split at the list/module layer, not in TaskRow.
