# 005 — Bill calendar overlay

Status: open

Parent: #003 Bill Tracking PRD (story 2).

## Done

- (nothing yet)

## Needs doing

- What to build: bills flow through the calendar query path so due dates
  render as chips on month/week/day views; visually distinct from events
  (own affordance, not event styling); tapping a chip opens bill detail.
- Acceptance criteria:
  - [ ] Bill due this week renders a chip in month grid on the right day.
  - [ ] Chip is distinguishable from event chips (label/icon, not color-only).
  - [ ] e2e: create bill via API → chip visible → click opens detail.

Blocked by: #004.
