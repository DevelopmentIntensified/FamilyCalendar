# 013 — Audit findings: tasks/family/dashboard MED/LOW

Status: open

## Needs doing

- Assigning a task never notifies the assignee (notifications fire only for
  accepted/declined to the owner) — add assignment_pending fan-out on create
  - reassign.
- Removed family member keeps write access via the `assignedTo` leg of
  `canMutateTask` — null out `assignedTo` (+ reset pending status) for the
  family's tasks on removal.
- `undoRecurringCompletion` trusts client-supplied `previousDueDate` —
  derive previous cursor server-side from the deleted completion + interval;
  validate monotonicity; wrap update + history delete in one transaction.
- Recurring check-offs attributed to the task owner, not the acting user —
  store the actor on the completion row and query wins/streaks by actor
  (schema change → SQL recorded alongside).
- `syncRecurringCursors` never pins other members' family tasks (`userId`
  AND `familyId` makes the family leg unreachable) — sync over family scope.
- `getUserSubscriptionLimits` reads overrides from an arbitrary
  (possibly expired) subscription row (no orderBy/expiry filter) — filter to
  the active sub like `getUserSubscription` does.
- Notification unread count never refreshes in-session — poll or refresh on
  invalidate/focus.
- Un-assigning via user delete leaves ghost `assignmentStatus` — reset to
  'none' when `assignedTo` is nulled.
- `assignedTo` accepts any user id (create + reassign) — validate roster
  membership or existence.
- Bulk ops partial failure + inflated counts; exception upsert race (needs
  unique index + onConflictDoUpdate); unresolvable member invite stored as
  raw-id guest name; `canUploadAttachment` has no callers (enforce when
  receipts land, issue #010).

## Done

- (nothing yet)
