# 013 — Audit findings: tasks/family/dashboard MED/LOW

Status: done

**Closed 2026-09-29.** Ten findings: eight shipped, three residue bullets
turned out to be already fixed or moot, and the two real survivors were split
into the issues that actually own them. The original 10 are all in `## Done`.

## Moved out

- **Completion attribution on the calendar stats page** → **#092**. It is a
  stats question, not a tasks/family finding, and the actor leg is a query
  change now that the column exists.
- **Exception upsert race** → **#014**, which is the events-lane issue. It is a
  unique index plus an `onConflictDoUpdate`, both squarely in #014's territory,
  and it needs the same schema/SQL handling as #014's other items.

Neither was dropped. Neither belongs here.

## Needs doing

(none)

Re-triaged 2026-09-29 against the code; 2 of the 5 residue bullets were
already shipped and are struck (see Done).
- **STRUCK (was open, verified shipped) — bulk `applied: ownedIds.length`
  inflated count.** `src/routes/api/events/bulk/+server.ts:53-74` now has
  `applyPerItem`, which loops the ids one at a time under per-item
  try/catch, counts a real `applied` from what each call actually returned,
  and pushes `{ id, error }` into `failed` for anything that returned
  0/undefined or threw. A single failure no longer aborts the batch. Every
  op (delete / calendar / location / attendants / smart) routes through it.
- **STRUCK (was open, verified shipped) — unresolvable member invite stored
  as a raw-id guest name.** `src/lib/server/utils/eventInvites.ts:62-70`:
  an entry flagged `isUser: true` is only accepted if the id is the caller
  or a member of `getFamilyRoster(familyId)`; anything else is **dropped**,
  explicitly never degraded to a guest name. The API routes resolve invites
  through it on both create and update.
- **STRUCK (was open, moot by design) — `canUploadAttachment` has no
  callers.** The original bullet was factually wrong: it IS called, three
  times, from `checkSubscriptionAction` in the same file
  (`subscriptionService.ts:274, :286, :294`), and has its own suite
  (`subscriptionService.test.ts:225`). The real residue one layer up is that
  `checkSubscriptionAction` itself has no callers outside its own
  definition. Either way the enforcement hook the bullet wanted is **moot**:
  the 2026-09-07 decree is process-and-delete (no image bytes ever persist,
  #010/#029) and the whole bills surface is archived to `_attic/money`
  (#063). Nothing left to gate.

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
- Re-triage 2026-09-29 (evidence in Needs doing): bulk partial-failure +
  inflated counts fixed by `applyPerItem`; unresolvable-invite-as-guest-name
  fixed by `resolveEventInvites`; `canUploadAttachment` bullet struck (it has
  callers, and the gate it wanted is moot).
