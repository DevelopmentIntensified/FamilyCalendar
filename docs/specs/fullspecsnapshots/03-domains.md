# 03 — Domains

## Tasks (visibility / cursor / assignment / priority / NLP)

- One live row per recurring task; completing snaps cursor to today + n×interval (smallest n landing strictly past due). `advanceCursor` (`actions/tasks.ts:63`), `advanceTaskToNext:756`, `undoRecurringCompletion:821`. Completions also append immutable `taskCompletions` rows (stats/streaks read these, not the cursor).
- Visibility closed `private|public|family`, default public, owner-only change (`isTaskVisibility:31`, `canChangeVisibility:579`). Private = owner+assignee/assigner; Public = family read-only; Family = surfaces only when assigned, keeps label.
- Assignment handoff: Requested (assigned out) / To Accept (awaiting me); accept moves, decline returns (`getPendingAssignments:366`, `getRequestedByMe:383`, `nonOwnerAssignmentPatch:597` — non-owners may only accept/decline own + tags).
- Priority low|normal|high default normal, mine-first then priority→overdue→due (`taskPriority.ts`, `taskSort.ts`, `taskUrgency.ts`). Top-3 family-wide same ranking (`dashboard.ts:rankTop3:59`). Board groups by assignee fallback creator (`familyTaskGroups.ts`).
- Quick-add NLP `utils/taskQuickAdd.ts:1-599` + table suite: dates → 23:59 local, `@`/assign words roster-scoped, cadence + every-Saturday anchor, `#tags`, `#public/#private`, `@family`; unknown `@handle` kept. Shared `dateResolution.ts` (explicit-year wins, past-rolls, Feb-30 clamps-never-rolls).
- Family board shared module with personal list (#101). Tiny grid chips EXCLUDED from scope pills (deferred, #021 residue).

## Events / calendar (recurrence / mirror / import / ICS / RSVP)

- Series = ONE row expanded in memory; per-occurrence edits = Exception Overrides (`upsertException:50`, **racy #014**). `scheduleStep` (`recurrenceService.ts`) is the ONE stepping mechanism (month-end clamp table; compounding-drift caveat → needs stored anchor #032/#007). DST drift needs ADR first (#014).
- Family mirror: `mirrorOf` + `syncFamilyMirror:331` propagates whole-series edits (calendarId excluded); per-occurrence exceptions do NOT propagate (**ruling: they must, #014**); delete removes master+mirrors one tx (`deleteEventInScope:448`).
- Reads via `getAccessibleCalendarIds` (own + all families) + `eventAccessFilter` + `canTouchEvent`. Writes need only calendar visibility — **no owner leg #165**.
- Import: `parse` (no write) → preview → `commit`; #082 window-fetch (future months); no batch-undo by decision. ICS export UTC Z instants, all-day exclusive DTEND, RRULE UNTIL>COUNT (`utils/ics.ts`); Google render link + `.ics` endpoint (#028). Preview/dedupe `icsImportPreview.ts` (MAX 500).
- RSVP: partial uniques per user/name; required|optional; summaries per master.
- Sponsored events: labelled everywhere, provenance-only distinction (`CONTEXT.md` Sponsored Event). Serve gate = `userSettings.showAdsAsEvents` only (#088); trail `adConsentRecords` never read at serve time (#088b).
- Creator chips ("by <First>") on all views (#026). Mobile = month grid default, rail gone at ALL widths, DayNav shared pill (#119).

## Groceries (one list, scope filter, memory, colours)

- THE list is one table; All/Family/Mine is a filter (`family_id` NULL = Mine). Open = `checkedAt` NULL oldest-first. Key = trim+lowercase.
- Stores ordered free-text, `[0]` = primary grouping; `cleanStores/uniqueStores` case-insensitive first-spelling-wins. Quick-add parses optional 1–4-digit qty default 1.
- Store Memory family-wide (personal if no family), most-frequent auto-fill, survives check-off+delete.
- Colour precedence personal > family > name-hash; `Any-store`/null untinted; 6 swatches; collisions allowed + disclosed (`data/groceries.ts:1-416`, `actions/groceries.ts`).

## Dashboard (composition layer, no new model)

Modules: glance, top3, completed, board, kids, groceries, meals(parked, reads[]), verse. Family master switch off hides for all; user may hide self-only (`dashboardModules.ts`, `dashboardVisibility()` — the ONE seam #109). Verse also gated by own `showDailyVerse` (translation ESV default). `?date=` extends to any day. Kids = day events with child attendee non-declined.

## Family / invites / account / notifications / claim / stats

- Role (permission) vs memberType (profile) — never confused. `canEditRole/canRemove` rules (`familyDisplay.ts`). Roster single query oldest-first, no one-family guess (#098). First family is a guess only where unavoidable.
- Invites: code (maxUses 10 default, **race #155**) + email/link JWT (**bearer-login #152**). Invite-by-link creator/admin. Member search verified-only prefix masked capped.
- Account: 10 hash sections (`accountSections.ts`); calendar settings (week start, ICS hint), dashboard modules, notifications 4-switches, Plan&usage, email/security/API tokens (Bearer SHA-256 shown once, **no expiry #169**)/danger. `defaultCalendarId` unchecked (**#167**).
- Alerts closed set of 5, grouped needs-you vs news by type property (`notificationTypes.ts`). Feed 50/page; push VAPID, 404/410 prune.
- Anonymous silent full-access no-sync; claim = verified email → syncable; conflict → login-then-merge never silent; 90d inactivity weekly-delete. Magic-link kind-tagged JWT 5/15min. Codes **plaintext unbound #162**, type confusion **#154**.
- Stats: completions credited by owner not actor (**#092**); six of seven figures count the cursor-overwritten column (**#146**). Archive month cards group invalid→unknown never-drop newest-first.

## NLP parsers + conformance harness

- `naturalLanguageService.ts:1-2494` + 539-phrase suite (#108): title/date/start/end/location/description/allDay/recurring/attendants/duration/dates/byDay/count/until/calendarName/reminderMinutes; `in the X` = `at the X` rule; `with`-lists + continuation inheritance (#052). Bill sub-parser = hint never commit.
- Harness `src/lib/conformance/`: `collect.ts` walker, `rules.ts` 22 properties, `tokens.ts` derive/find/format — expectations measured from marketing corpus, never hand-written. e2e: 7 routes @1280, `/about` held-out 0 dev; `account-known-bad` 6 devs. Ruling: token-only, geometry manual (#131). Findings #170–173.

## Parked

Bills `_attic/money/` (cursor anchored on stored due; categories incl. tax/fees; Tag Table user>global; receipt processed-and-deleted; OCR chain on-device→tesseract→opt-in Azure). Meals parked (module id stable, loader empty).
