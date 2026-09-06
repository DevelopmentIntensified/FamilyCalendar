# 013 — Audit findings: tasks/family/dashboard MED/LOW

Status: in-progress

## Needs doing

- Bulk ops partial failure + inflated counts (events lane — deliberately
  NOT touched by the tasks/family fix batch; bulk/+server.ts returns
  `applied: ownedIds.length` unconditionally).
- Exception upsert race (needs unique index + onConflictDoUpdate).
- Unresolvable member invite stored as raw-id guest name.
- `canUploadAttachment` has no callers (enforce when receipts land, issue #010).
- Out-of-scope follow-up found during #013 work: `calendar/stats` page
  queries `taskCompletions` by `userId` only — needs the same actor
  attribution as the dashboard (actorId leg + legacy userId fallback).

## Done

- Assignment notification fan-out: new `assignment_pending` type written on
  task create (assignee ≠ creator) and owner-initiated reassignment
  (api/tasks POST + [id] PUT); best-effort via `createNotification` (it
  swallows its own failures). NotificationBell type union + 📨 icon (and
  the calendar/notifications page icon map).
- `removeFamilyMember` nulls `assignedTo` + resets `assignmentStatus` to
  'none' for the family's tasks in the same transaction — the removed
  member no longer keeps write access via the `assignedTo` leg.
- `undoRecurringCompletion` hardened: previous cursor derived server-side
  from the deleted completion row (cursor-v3 rewind + re-advance check,
  one-interval fallback); client `previousDueDate` accepted only when it
  parses and is strictly before the current due date; task update +
  history delete wrapped in one `db.transaction`.
- `taskCompletions.actorId` column (additive, nullable) records the ACTING
  user at check-off; `toggleTaskComplete`/`toggleTaskCompleteFamily` pass
  the authenticated caller through `applyToggle`. Dashboard
  wins/streak queries (`getCompletionTimestamps`,
  `getRecurringDayCompletions`) attribute to the actor when present,
  falling back to `userId` for legacy rows. SQL: sql/006.
- `syncRecurringCursors` family leg fixed: scope is `userId = me OR
  familyId = myFamily` (was `AND`, making the family leg unreachable).
- `getUserSubscriptionLimits` reads overrides through the same active-sub
  filter (tiered + not expired) + `orderBy desc(createdAt)` as
  `getUserSubscription` (shared `getActiveSubscriptionRow`). BONUS fix:
  the old hand-rolled `or()` helper stringified SQL objects into
  `[object Object]` text — the expiry filter it built was garbage SQL;
  helper removed, real drizzle `or` imported.
- Notification unread count polls every 60s while the bell is mounted
  (cleared on unmount); dropdown open still does a full refresh. Reuses
  the single /api/notifications GET (no count-only endpoint exists yet).
- `deleteUser` resets `assignmentStatus` to 'none' for tasks assigned to
  the deleted user BEFORE the FK set-null fires, in the same transaction.
- `assignedTo` roster validation — verified already implemented
  (`isValidAssignee` on both create + reassign paths); no change needed.

## Done

- (nothing yet)
