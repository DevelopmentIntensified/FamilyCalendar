# 274 — Editing an event shows attendees as user ids instead of names

Status: open

Source: user bug-report export 2026-11-02 (website, prod www.familyplanz.com — `main` was at 0fbcc93).

## Evidence

[Calendar] "when editing events, users turn into their uid rather than their name" (2026-11-01 23:12). Page recorded as /report-bug (pre-#257 bug), so origin unknown — likely EventFormModal / AttendantPicker / EventAttendeeGroups edit path.

## Done

(none yet)

## Needs doing

- Reproduce (test-first) on `test`; if already fixed by a later commit, say which and add a regression test; else fix.
