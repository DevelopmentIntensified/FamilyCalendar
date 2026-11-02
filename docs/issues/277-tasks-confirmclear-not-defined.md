# 277 — /calendar/tasks 500: confirmClear is not defined

Status: open

Source: user bug-report export 2026-11-02 (website, prod www.familyplanz.com — `main` was at 0fbcc93).

## Evidence

[auto-filed 500] "confirmClear is not defined" on /calendar/tasks (2026-10-28). 825c095 (2026-10-22) destructured confirmClear in TasksMainList; report is after that, so verify a remaining reference path on main vs test.

## Done

(none yet)

## Needs doing

- Reproduce (test-first) on `test`; if already fixed by a later commit, say which and add a regression test; else fix.
