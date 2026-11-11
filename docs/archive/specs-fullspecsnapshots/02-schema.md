# 02 — Schema (40 tables) + seams + migrations

Client: `src/lib/server/db/index.ts:1-7` (drizzle over postgres-js, `DATABASE_URL` required). Runner `src/lib/server/db/migrations/runner.ts` replays 21 bundled raw-SQL files (0000 baseline - #086 - through 020) at cold start (`hooks.server.ts:12-14`), tracked in `__schema_migrations`, per-migration tx, one failure BREAKs but still returns ok. `drizzle-kit push` retired (#086): one bundled path only.

Naming traps: export `subscriptions` = physical `activeSubscriptions` (`schema.ts:122`); export `groceryStoreColours` = `grocery_store_colours` (`:988`).

## Tables (`src/lib/server/db/schema.ts`, export → physical → key/FKs)

1. `users`→`users` (:18) PK id, UQ email (+`receiptIngestToken` :44)
2. `userSettings`→`userSettings` (:47) PK id, FK userId CASCADE, defaultCalendarId→calendars SET NULL; `showAdsAsEvents` gate default false (:55-57)
3. `discounts`→`discounts` (:82) catalogue; 4. `userDiscounts`→`userDiscounts` (:105) PK(userId,discountId) CASCADE both
5. `subscriptions`→`activeSubscriptions` (:122) FK userId NO ACTION (deleteUser hand-deletes), type RESTRICT; `notificationMethods` jsonb
6. `subscriptionTypes`→`subscriptionTypes` (:171) plan catalogue (limits, retention, AI allowance)
7. `accounts` (:197) PK(provider,providerAccountId) CASCADE users · 8. `codes` (:219) UQ code, **plaintext #162** · 9. `sessions` (:230) CASCADE users
10. `familyMembers` (:238) PK(user_id,family_id) CASCADE both; `role` creator|admin|member (permission) + `memberType` parent|child|member (profile, NOT permission :244-246)
11. `familyInviteCodes` (:259) PK code, CASCADE family + creator; maxUses/useCount/expiresAt (**race #155**)
12-14. `familyGroups`/`groups`/`userGroups` (:270/285/294) — orphaned, zero refs (**#090**)
15. `families` (:309) · 16. `dashboardModuleSwitches` (:321) row-exists-only-while-OFF, UQ(familyId,module)
17. `meals` (:347) PARKED · 18. `calendars` (:365) ownerId/familyId nullable CASCADE
19. `eventAttendance` (:375) partial UQs per user/name (:395-401); invite_type required|optional
20. `aiUsageTracking` (:405) PK(userId,month,year) · 21. `events` (:425) ownerId NOT NULL, calendarId nullable, `mirrorOf` self-ref (:449-451) + indexes (:459-461)
22. `eventExceptions`→`event_exceptions` (:473) — **no unique (event_id,original_date) #014**
23. `claimTokens`→`claim_tokens` (:503) UQ tokenHash · 24. `apiTokens`→`api_tokens` (:524) UQ tokenHash, **no expiry/scopes #169**
25. `tasks` (:540) archivedAt, recurrence, completionCount, assignedTo→SET NULL, assignmentStatus, priority default normal, visibility default public (:558)
26. `bills` (:595) archived · 27. `receiptItems` (:631) · 28. `itemTags` (:661) user-null=global + partial UQs
29. `taskTags` (:704) PK(taskId,name) · 30. `taskCompletions` (:722) immutable history; actorId nullable SET NULL
31. `notifications` (:748) closed type set · 32. `adEvents` (:781) no FKs · 33. `adConsentRecords` (:820) append-only, decision CHECK, index (userId,recordedAt) non-unique
34. `waitlist` (:841) email PLAIN non-unique (**guard never fires #089**) · 35. `unmatchedPhrases` (:857) UQ(source,phrase) · 36. `bugReports` (:887) userId SET NULL
37. `groceryItems`→`grocery_items` (:933) scope = family_id NULL Mine / SET Family · 38. `groceryStoreMemory`→`grocery_store_memory` (:958) · 39. `groceryStoreColours`→`grocery_store_colours` (:988) partial UQs per scope
40. `pushSubscriptions` (:1021) UQ endpoint

## Action seams

- `actions/tasks.ts`: `createTask:152`, `getTasksForUser:196`/`ForEvent:240`/`ForFamily:249`/`getMyTasks:336`, `updateTask:430`, `toggleTaskComplete:683`/`Family:733`, `deleteTask:709`, `advanceTaskToNext:756`, `undoRecurringCompletion:821`; authz `isFamilyMember:541` (membership row only), `canMutateTask:561` (owner → assignee → family-member), `canChangeVisibility:579` owner-only.
- `actions/events.ts`: `createEvent:250`, `updateEventById:284` (via `eventAccessFilter:296`), `upsertException:50` (**select-then-write #014**), `syncFamilyMirror:331` (whole-series only, **no per-occurrence #014**), `deleteEventInScope:448` (master+mirrors one tx), `normalizeInvites:146`/`replaceEventInvites:176`; resolver `utils/eventInvites.ts:38` (strangers dropped). `actions/calendarScope.ts`: `getAccessibleCalendarIds:10`, `eventAccessFilter:30`, `canTouchEvent:45`.
- `actions/families.ts`: `createFamily:112` (+calendars row), `generateInviteCode:144`, `verifyInviteCode:168`, `acceptInvite:192`, `removeFamilyMember:283` (unassigns first), `searchUsers:310` (+`memberSearch.ts` masking/caps).
- `actions/groceries.ts`: `addGroceryItem:89`, `check/uncheck:180/189`, `getStoreColours:217`/`setStoreColour:249`. `actions/notifications.ts` (PAGE_SIZE 50), `calendar.ts`, `dashboard.ts` (`rankTop3:59`), `dashboardModules.ts`, `users.ts` (`deleteUser:53` hand-deletes subs), `codes.ts`, `apiTokens.ts`, `bugReports.ts`, `unmatchedPhrases.ts`.
- MISSING seam: no `actions/bills.ts` (`schema.ts:606-607` references it; file absent — routes/services only).

## #086 baseline gap

21 tables created by NOTHING bundled; runner fails on 001's first ALTER on empty DB. `003` contradicted schema on 8 tables (worst: waitlist email-PK vs id-PK; aiUsageTracking/adEvents different tables) — do NOT rewrite, reconcile forward. `007` tasks 9 cols vs schema ~17. `016-drop-user-ad-consent.sql` unbundled (prefix collides with bundled `016_api_tokens`). Plan: baseline migration + mark-applied + forward reconcile + retire one path + prove empty→runner→schema clean.
