# 006 — Recurring bills

Status: open

Parent: #003 Bill Tracking PRD (story 3).

## Done

- (nothing yet)

## Needs doing

- What to build: recurrence fields (frequency + interval) on bills reusing
  the Recurring Event value objects and virtual-expansion-at-read semantics;
  one row per bill, occurrences expanded, never materialized.
- Acceptance criteria:
  - [ ] Monthly bill entered once expands to every month in calendar + list.
  - [ ] Editing the schedule updates all future occurrences.
  - [ ] e2e mirrors the RecurringEvents regression spec (expand + persist).

Blocked by: #004.
