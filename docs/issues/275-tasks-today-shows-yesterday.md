# 275 — Tasks: "today" shows as yesterday (Oct 31 instead of Nov 1)

Status: open

Source: user bug-report export 2026-11-02 (website, prod www.familyplanz.com — `main` was at 0fbcc93).

## Evidence

[Tasks] "today is marking as yesterday oct 31 rather than nov 1" (2026-11-01 23:08 UTC = Nov 1 evening in US zones). Prod (main) predates #213/#214/#219 zone fixes; verify whether test already fixes it, else find the remaining UTC-day path in the tasks page.

## Done

(none yet)

## Needs doing

- Reproduce (test-first) on `test`; if already fixed by a later commit, say which and add a regression test; else fix.
