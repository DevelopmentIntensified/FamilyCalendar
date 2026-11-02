# 276 — POST to / returns 405 (no form actions)

Status: open

Source: user bug-report export 2026-11-02 (website, prod www.familyplanz.com — `main` was at 0fbcc93).

## Evidence

[auto-filed 405] "POST method not allowed. No form actions exist for this page" on / (2026-10-30). Some form posts to / without an action (e.g. a marketing or nav form with method=post and no action, or a stale logout form).

## Done

(none yet)

## Needs doing

- Reproduce (test-first) on `test`; if already fixed by a later commit, say which and add a regression test; else fix.
