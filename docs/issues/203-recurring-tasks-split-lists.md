# 203 — Split tasks into recurring vs non-recurring lists (page + dashboard)

Status: done

Source: user bug report (product directive, not defect), https://www.familyplanz.com/report-bug, 2026-10-22 19:34: "move recurring tasks out of the tasks list and have two tasks list on the task page one with recurring and one with not. Dashboard too".

## Done

- Placeholder to recall the tension: #119 (approved) built the main Task list as ONE FLAT band with no section heading and no sticky, and printed counts on the jump bar instead. #110 moved the recurring-cursor pin INTO every list read so recurring rows never go stale.

## Needs doing

- Owner decided this overrides #119's "one flat run of rows" ruling for the tasks PAGE and the DASHBOARD Top-list module both. Griddle or section split acceptable — no tablist (same rule).

## Needs doing 2 (implementation, after green)

- Implement the split: recurring and non-recurring land in two labelled lists on /calendar/tasks AND the dashboard Top-list module resolves which bucket a row drops into. Layout: keep cursor pins working across both lists via getTasks for each bucket; add a "recurring" label row + counts; TDD: (1) a recurring task NEVER appears in the non-recurring bucket, (2) both buckets read from the same shared sync, (3) dashboard module shows only its bucket, no double counts, (4) jump-bar/print counts reflect both buckets without double-counting shared rows.
- Do NOT touch family/tasks unless the ticket after is accepted — this ticket is tasks page + dashboard only.
- Offset work: TaskRow/markup likely shared, so isolate the split at the list/module layer, not in TaskRow.

## Done (2026-10-23)

- One seam: `taskRecurrence.ts` — `isRecurringTask` (`recurrenceFrequency != null`, the server's IS NOT NULL seat) + `splitByRecurrence` (single pass, order-preserving, each row lands in exactly one bucket). Both surfaces import it; the recurring definition cannot drift between them.
- Tasks page: `TasksMainList` cuts its one synced filtered list into two labelled groups — One-off leads, Recurring follows — each keeping the flat list's own sort, with counts on the label and no print for an empty bucket. Cursor pins (110) were untouched: they run inside getTasks before the list ever splits.
- Dashboard: `TopPrioritiesCard` drops each rankTop3 row into the same two buckets, labelled with counts, numbered continuously across the groups (row body moved into a `{#snippet ranked}` so it is written once).
- TDD evidence: helper table was red on a missing module, then green 4/4; both component suites red 6 (25 pre-existing green) before wiring, green after.
- Suites: touched surfaces 27 files / 188 tests green; helper 4, TasksMainList 20, TopPrioritiesCard 11; tasks page suite green. `svelte-check`: zero errors/warnings in all six touched files (tree-wide 69/63 pre-existing baseline of other lanes). `npm run build` green.
- Family/tasks untouched; TaskRow untouched; no query change (both buckets read the same sync).
