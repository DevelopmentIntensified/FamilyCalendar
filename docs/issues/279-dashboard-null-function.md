# 279 — Dashboard 500: Cannot read properties of null (reading 'function')

Status: open

Source: user bug-report export 2026-11-02 (website, prod www.familyplanz.com — `main` was at 0fbcc93).

## Evidence

[auto-filed 500] "Cannot read properties of null (reading 'function')" on /calendar/dashboard (2026-10-27, same minute as #278 — possibly the same render failure).

## Done

(none yet)

## Needs doing

- Reproduce (test-first) on `test`; if already fixed by a later commit, say which and add a regression test; else fix.
