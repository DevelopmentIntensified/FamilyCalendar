# 012 — Audit findings: bills MED/LOW follow-ups

Status: open

## Needs doing

- Sort: `asc(dueDate)` puts undated bills first (Postgres NULLS FIRST) — want
  soonest-due first, undated last (`nulls last` + secondary sort key).
- Rows: no overdue styling, no paid badge; `paidAt` exists + PUT `paid`
  supported but UI never shows or sends it — add mark-paid toggle + badge.
- Delete has no confirmation (family-shared destructive action) — inline
  confirm per tasks-page pattern, plus disable ALL delete buttons while one
  is busy (currently others silently no-op) and "Deleting…" label not "…".
- Categories render raw lowercase in select + rows — capitalized labels.
- `canEdit` in the page grants write UI to null-role family members (server
  denies → dead buttons) — derive from role `creator|admin` when family present.
- PUT coerces wrong-typed `dueDate`/`familyId` to null (destroys data) —
  reject with 400; accept only explicit null as "clear".
- 403 for forbidden confirms existence — collapse to 404 like tasks.
- Styling parity with tasks page: error box w/ dismiss ✕, amber loadWarnings
  box, empty-state treatment.

## Done

- (nothing yet)
