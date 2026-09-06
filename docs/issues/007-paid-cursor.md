# 007 — Paid cursor

Status: open

Parent: #003 Bill Tracking PRD (stories 7, 9).

## Done

- (nothing yet)

## Needs doing

- What to build: marking a bill paid for the current period advances the
  paid cursor (one live period at a time, mirroring Recurring Task cursor
  semantics); month view groups paid vs unpaid.
- Acceptance criteria:
  - [ ] Mark-paid snaps the next due period forward; history preserved.
  - [ ] Month view shows paid vs unpaid grouping with counts.
  - [ ] Paid state survives reload (persisted, not client-only).

Blocked by: #006.
