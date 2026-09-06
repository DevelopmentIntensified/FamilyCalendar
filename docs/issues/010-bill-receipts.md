# 010 — Bill receipts

Status: open

Parent: #003 Bill Tracking PRD (story 8).

## Done

- (nothing yet)

## Needs doing

- What to build: receipt photo attach/view on a bill via the existing
  attachment limit + plan-gating seam (`attachmentLimitBytes`); bills
  reference stored attachments, no new storage layer.
- Acceptance criteria:
  - [ ] Photo attaches to a bill and renders in bill detail.
  - [ ] Plan attachment limits enforced (over-limit rejected with message).
  - [ ] Loading states use skeletons, never blank cards.

Blocked by: #004.
