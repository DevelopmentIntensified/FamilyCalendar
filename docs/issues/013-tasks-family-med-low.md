# 013 — Audit findings: tasks/family/dashboard MED/LOW

Status: in-progress

## Needs doing

Re-triaged 2026-09-29 against the code; 2 of the 5 residue bullets are
already shipped and are struck (see Done).

- **OPEN — `calendar/stats` actorId attribution.** The page still queries
  `taskCompletions` by `userId` only:
  `src/routes/(calendar)/calendar/stats/+page.server.ts:19`
  (`eq(taskCompletions.userId, event.locals.user.id)`) — no actorId leg, no
  legacy `userId` fallback. Same shape the dashboard already fixed; copy
  that attribution. `actorId` column exists (sql/006), the work is the query.
- **OPEN — exception upsert race.** `upsertException`
  (`src/lib/server/db/actions/events.ts:50-98`) is still
  select-then-write, and `event_exceptions` still has **no unique index on
  (event_id, original_date)** (`schema.ts:458-484`). Two concurrent
  single-occurrence edits can both miss the select and insert duplicates.
  Fix is a unique index + `insert(...).onConflictDoUpdate({ target:
  [eventId, originalDate] })` — the code comment at events.ts:61-64 already
  spells out the target shape. Record the SQL alongside the change.
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
