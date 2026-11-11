# Port sheet: tasks

**domain** · rank 9 · port #14 · home: `src/lib/domains/tasks/` · README after the port: `src/lib/domains/tasks/README.md` (written in S1)

Tasks: visibility, priority, assignment handoff, Recurring Task cursor, tags, categories, completions, stats/streaks, archive, TaskFocus focus time + phone sessions, task UI.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar.
- **Owns tables:** `taskfocusCommands`, `taskfocusSessions`, `tasks`, `taskCategories`, `taskTags`, `taskCompletions`.
- **Must be ported first:** calendar, identity, family, parsing (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `________`
- [ ] S3 contract + rules
- [ ] S4 repo (+ fixtures)
- [ ] S5 service
- [ ] S6 http + route wiring (goldens unchanged since S2)
- [ ] S7 UI rebuild (rules, api, state, components, screen) + visual check
- [ ] S8 rewire importers, delete legacy code and legacy tests
- [ ] S9 README final, census --write, gate:push, ledger done

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- Recurring Task cursor (CONTEXT.md): completing snaps to today + n×interval strictly past the current due; completion count increments; undo restores; skip ≠ complete.
- Completion history is append-only; two concurrent toggles → exactly one history row (row lock).
- Visibility private/public/family, default public, owner-only change; private tasks hidden from `?eventId=` for non-owners (#164).
- Assignment: self = accepted, other = pending; the assignee must be the creator or a family member; non-owners may only accept/decline their own assignment and edit tags.
- Priority low/normal/high, default normal, unknown → normal; mine-first ranking; Top-3 Priorities.
- `PUT /api/tasks/[id]`: absent or null `focusMinutes` never wipes the stored value; `focusStartedAt: null` clears; phone focus fields are separate (#293).
- Focus sessions: one open per user → `409 {"error","openSessionId"}`; absorb idempotent; DELETE 404 = already gone.
- TaskFocus commands FIFO; old servers answering 404/405 = unsupported.
- Categories: case-insensitive unique; a case variant is stored in the list's spelling; rename/delete propagate.
- `GET /api/tasks`: `eventCalendarId` always present (null for standalone); `?eventId=` missing event → `200 {tasks:[]}`, no access → 403.
- Deleting completed tasks archives them; stats count `taskCompletions` by actor with the legacy owner fallback (#092/#146).

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface

Auth for every row is the same session cookie or Bearer `fp_…` token resolved by `requireUserJson`; missing/invalid → `401 {"error":"Unauthorized"}` (`src/lib/server/utils/requireUser.ts:47-50`; `docs/guides/task-api-spec.md:7`).

| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/tasks` | GET | session/Bearer | no body; optional `?eventId=` | `200 {tasks:[Task+tags]}` — newest `createdAt` first; every row carries `eventCalendarId` (`null` = standalone) + `phoneFocusMinutes`/`phoneFocusStartedAt` | `?eventId=` unknown → `200 {tasks:[]}`; `403: No access to this event` | `src/routes/api/tasks/+server.ts:58-93`; `src/lib/server/db/actions/tasks/queries.ts:21-70` |
| `/api/tasks` | POST | session/Bearer | `title` required; `dueDate`/`eventId` absent·null·`''` = none; `familyId` absent = caller's family, `null` = personal; `assignedTo` absent = self; `visibility` absent = `public`; `focusMinutes` absent/null = `null`; `focusStartedAt` absent/null = idle; `category` absent/null/blank = `null`; bad/missing `recurrenceFrequency` → silently `null` | `201 {success:true,task}` (task + tags) | `400: Title is required`, `400: Invalid dueDate`, `400: Invalid eventId`, `400: Event not found`, `400: Invalid visibility`, `400: Invalid focusMinutes`, `400: Invalid focusStartedAt`, `400: category must be a string`, `400: category is too long`, `400: Assignee is not a member of this family`, `403: No access to this event`, `403: Not a member of this family` | `src/routes/api/tasks/+server.ts:96-245`; `docs/guides/task-api-spec.md:79` |
| `/api/tasks/[id]` | PUT | session/Bearer | dispatch by body shape: `undoComplete` (+ optional `previousDueDate`) → `advanceToNext` → `toggleComplete` → field patch (`title`,`notes`,`dueDate`,`priority`,`tags`,`recurrenceFrequency`,`recurrenceInterval`,`visibility`,`assignedTo`,`assignmentStatus`,`focusMinutes`,`focusStartedAt`,`category`,`completedAt`). `focusMinutes` absent/null = unchanged; `focusStartedAt` absent = unchanged, `null` = clear; `category` absent = unchanged, `null`/blank = clear; `assignedTo` absent = unchanged, `assignmentStatus:'declined'` = clear assignee | `200 {success:true,task}` | `404: Task not found`, `404: Nothing to undo` (any undo failure), `400: Invalid recurrenceFrequency`, `400: Invalid recurrenceInterval`, `400: Invalid visibility`, `400: Invalid focusMinutes`, `400: Invalid focusStartedAt`, `400: category must be a string`, `400: category is too long`, `400: Assignee is not a member of this family`, `403: Only the task owner can change visibility`, `403: You can only respond to your own assignments` | `src/routes/api/tasks/[id]/+server.ts:40-321`; `docs/guides/task-api-spec.md:111` |
| `/api/tasks/[id]` | DELETE | session/Bearer | no body | `200 {success:true}` — open Task hard-deleted, completed Task archived | `404: Task not found` (unknown id **or** no mutation right) | `src/routes/api/tasks/[id]/+server.ts:325-352`; `src/lib/server/db/actions/tasks/mutations.ts:180-193` |
| `/api/tasks/completed` | DELETE | session/Bearer | no body | `200 {success:true}` — archives the caller's completed rows | `401` only | `src/routes/api/tasks/completed/+server.ts:8-16` |
| `/api/tasks/sections` | GET | session/Bearer | no body | `200 {myTasks,pendingAssignments,requestedByMe,warnings}` | `401` only; a failing leg yields `[]` + its label in `warnings` | `src/routes/api/tasks/sections/+server.ts:13-28`; `src/lib/server/services/tasksData.ts:19-48`; `docs/guides/task-api-spec.md:468` |
| `/api/task-categories` | GET | session/Bearer | no body | `200 {categories:[{id,name,createdAt,updatedAt}]}` name-sorted case-insensitively | `401` only | `src/routes/api/task-categories/+server.ts:25-31`; `src/lib/server/db/actions/taskCategories.ts:136-142` |
| `/api/task-categories` | POST | session/Bearer | `{name}` — trimmed; missing/blank/non-string malformed JSON → error | `200 {category}`; idempotent for an existing name in any case | `400: name is required`, `400: name is too long` | `src/routes/api/task-categories/+server.ts:33-45`; `docs/guides/task-api-spec.md:174` |
| `/api/task-categories/[id]` | PATCH | session/Bearer | `{name}`; absent/blank rejected (no "unchanged" form) | `200 {category}`; renames the caller's owned-or-assigned Tasks carrying the old name in the same transaction | `400: name is required`, `400: name is too long`, `404: Category not found`, `409: A category with that name already exists` | `src/routes/api/task-categories/[id]/+server.ts:28-44` |
| `/api/task-categories/[id]` | DELETE | session/Bearer | no body | `200 {success:true}`; matching caller Tasks get `category: null` | `404: Category not found` | `src/routes/api/task-categories/[id]/+server.ts:46-52` |
| `/api/taskfocus/commands` | GET | session/Bearer | no body | `200 {commands:[{id,command,taskId,issuedAt}]}` — oldest first, at most 25; rows older than 10 min deleted on read | `401` only | `src/routes/api/taskfocus/commands/+server.ts:28-70` |
| `/api/taskfocus/commands` | POST | session/Bearer | `{command:'start'|'stop', taskId?}`; `taskId` absent/null/`''` = none | `201 {id,command,taskId,issuedAt}` | `400: Command must be 'start' or 'stop'`, `400: Invalid taskId`, `400: Task not found` (unknown or not the caller's own Task), `400: taskId is required for start` | `src/routes/api/taskfocus/commands/+server.ts:72-135` |
| `/api/taskfocus/commands/[id]` | DELETE | session/Bearer | no body | `204` empty — always, for a live, unknown, already-acked or foreign id | `401` only | `src/routes/api/taskfocus/commands/[id]/+server.ts:16-32` |
| `/api/taskfocus/sessions` | GET | session/Bearer | `?unabsorbed=1` required; anything else → error | `200 {sessions:[{id,taskId,startedAt,endedAt,source}]}` — caller's closed + unabsorbed, oldest `startedAt` first, max 200 | `400: Only ?unabsorbed=1 is supported` | `src/routes/api/taskfocus/sessions/+server.ts:18-32` |
| `/api/taskfocus/sessions` | POST | session/Bearer | `{taskId,startedAt,endedAt?}`; `endedAt` absent/null = open session; timestamps ISO strings | `201 {session}` with `absorbedAt:null` | `400: Invalid JSON body`, `400: taskId is required`, `400: startedAt is required`, `400: Invalid startedAt`, `400: Invalid endedAt`, `400: startedAt is more than 5 minutes in the future`, `400: endedAt must be after startedAt`, `400: Session is longer than 12 hours`, `404: Task not found`, `409: A phone focus session is already running` + `openSessionId` | `src/routes/api/taskfocus/sessions/+server.ts:34-88`; `docs/guides/task-api-spec.md:249` |
| `/api/taskfocus/sessions/[id]` | PATCH | session/Bearer | `{endedAt}` required | `200 {session}`; re-PATCH of a closed unabsorbed session overwrites `endedAt` | `400: Invalid JSON body`, `400: endedAt is required`, `400: Invalid endedAt`, `400: endedAt must be after startedAt`, `400: Session is longer than 12 hours`, `404: Session not found`, `409: Session already absorbed` | `src/routes/api/taskfocus/sessions/[id]/+server.ts:17-57` |
| `/api/taskfocus/sessions/[id]` | DELETE | session/Bearer | no body | `200 {success:true}` — discards an unabsorbed session (open or closed) | `404: Session not found`, `409: Session already absorbed` | `src/routes/api/taskfocus/sessions/[id]/+server.ts:59-80` |
| `/api/taskfocus/sessions/[id]/absorb` | POST | session/Bearer | no body | `200 {session}` with `absorbedAt`; already absorbed → `200` with the original stamp | `404: Session not found`, `409: Only closed sessions can be absorbed` | `src/routes/api/taskfocus/sessions/[id]/absorb/+server.ts:12-32` |

### Rules the module must keep

- Recurring Task cursor v3: one live occurrence per row; completing sets due to today(start of day) + n×interval, n the smallest multiple landing strictly past the current due; a null due anchors at today + one interval; step is shared `scheduleStep` (month-end clamps) but the anchor is the completion day — `src/lib/server/db/actions/tasks/cursor.ts:29-63` · test: `src/lib/server/db/actions/tasks/tasks.test.ts` › "early check advances from today by one interval when it lands past the due date", "due exactly one interval out takes two intervals"
- Completing a Recurring Task increments `completionCount` by 1 and appends one `taskCompletions` row recording `actorId` = acting user; the due-date-guarded update makes a double-click a no-op (exactly one history row under a real row lock) — `src/lib/server/db/actions/tasks/cursor.ts:81-118` · test: `src/lib/server/db/actions/tasks/toggleTaskComplete.real.test.ts` › "double-click race completes exactly once under a real row lock"
- Skip ≠ complete: `advanceToNext` moves the cursor with no history row and no count increment — `src/lib/server/db/actions/tasks/cursor.ts:125-147` · test: `src/lib/server/db/actions/tasks/tasks.test.ts` › "advanceCursor … late/pinned completion slides from today"
- Undo restores the previous cursor, decrements `greatest(0, count-1)`, and deletes the latest history row in one transaction; the client's `previousDueDate` is only trusted when strictly before the current due, otherwise the previous cursor is derived by rewinding until re-advance reproduces the current due — `src/lib/server/db/actions/tasks/cursor.ts:159-240`
- Overdue pinning: open, dated Recurring Tasks whose due is strictly before today's start are pinned to 23:59:00 in the caller's zone before any list read (the readers own sync-before-read); the pin is one batched UPDATE scoped to own tasks + the family's tasks, and is a no-op when nothing is stale — `src/lib/server/db/actions/tasks/cursor.ts:65-71,256-306`; `src/lib/server/db/actions/tasks/queries.ts:21-26` · test: `src/routes/api/tasks/server.test.ts` › "pins overdue recurring rows to today-end BEFORE reading the list", "pins to 23:59 in the token owner's stored zone (#214)"
- Completion history is append-only: a row is written on completion only, never on un-completion or skip — `src/lib/server/db/actions/tasks/mutations.ts:125-150`
- Mutation rights: owner always; a personal Task only by its live (pending/accepted) assignee; a Family Task by the assignee or any member of its family. `role`/`memberType` are never consulted — `src/lib/server/db/actions/tasks/auth.ts:14-46` · test: `src/lib/server/db/actions/tasks/tasks.test.ts` › "denies other family members on a PUBLIC personal task (read-only visibility)", "denies a stale assignee row (no pending/accepted status)"
- Lack of rights answers `404 Task not found` (not 403) on every mutation endpoint; only visibility and assignment-authority have an explicit 403 — `src/routes/api/tasks/[id]/+server.ts:245-273,312-315`
- Task Visibility: `public` default at create, enum-validated when explicit, owner-only to change; a Public Task is read-only for other family members; Private Tasks are filtered out of `?eventId=` for non-owners — `src/routes/api/tasks/+server.ts:71-73,158-166`; `src/routes/api/tasks/[id]/+server.ts:139-152` · test: `src/routes/api/tasks/server.test.ts` › "hides the creator's private task from a non-owner member reading the event"
- Assignment handoff: self-assign is `accepted`, assigning someone else is `pending`; the assignee must be the creator or a member of the target family; accept/decline is allowed only for the current assignee (decline clears the assignee and sets status `none`); re-sending an unchanged `assignedTo` is a no-op — `src/routes/api/tasks/+server.ts:170-181`; `src/routes/api/tasks/[id]/+server.ts:158-190,260-273`; `src/lib/server/db/actions/tasks/assignment.ts:48-84` · test: `src/routes/api/tasks/[id]/server.test.ts` › "lets the current assignee accept their own pending assignment", "403s a family member reassigning"
- Alerts on handoff: create → `assignment_pending` to the new assignee; PUT → `assignment_accepted`/`assignment_declined` to the owner, `assignment_pending` to a reassigned user, `task_completed` to the owner on an open→done toggle (never on un-check, never to self) — `src/routes/api/tasks/+server.ts:219-241`; `src/routes/api/tasks/[id]/+server.ts:76-98,276-311`
- Section reads: `myTasks` = my personal rows (any visibility) + accepted assignments; `pendingAssignments` = assigned to me while pending; `requestedByMe` = my rows with any assignee; the public family tab = `public` personal rows whose creator is a current member — `src/lib/server/db/actions/tasks/queries.ts:174-195,203-223`; `src/lib/server/db/actions/tasks/assignment.ts:16-43`
- Task Priority `low|normal|high`, default `normal`, unknown input normalizes to `normal`; ranking weight high < normal < low, and the viewer's own rows lead (mine-first) then priority → overdue → due-today → next-due → title — `src/lib/server/db/actions/taskPriority.ts:17-31`; `src/lib/utils/taskSort.ts:20-37`; `src/lib/server/db/actions/dashboard.ts:61-100`
- Tags are lowercased, trimmed, deduped and sorted on every write; a PUT replaces the whole set — `src/lib/server/db/actions/tasks/tags.ts:15-26`; `src/lib/server/db/actions/tasks/mutations.ts:95-101`
- Categories are unique per user case-insensitively; a case variant resolves to the stored spelling; setting an unknown Task category auto-adds it to the caller's list; rename/delete propagate only to Tasks owned by or assigned to the caller (matching case-insensitively), inside a transaction — `src/lib/server/db/actions/taskCategories.ts:10-35,73-77,106-134,171-203`
- TaskFocus `focusMinutes`: absent or null on PUT never wipes the stored value; explicit whole minutes ≥ 0 overwrite; invalid is rejected before any mutation; POST defaults to `null` — `src/routes/api/tasks/+server.ts:183-189`; `src/routes/api/tasks/[id]/+server.ts:194-207`; `src/lib/server/utils/focusStartedAt.ts:12-19` · test: `src/routes/api/tasks/[id]/server.test.ts` › "absent field: patch carries undefined (stored minutes untouched)", "null is tolerated as unchanged (phone edits never know the field)"
- Phone focus overlay: `phoneFocusMinutes` = floor of the SUMMED closed unabsorbed session durations per Task (0 when none), `phoneFocusStartedAt` = start of the caller's open session; desktop `focusMinutes`/`focusStartedAt` stay untouched; only the caller's sessions count — `src/lib/server/db/actions/taskfocusSessions.ts:336-375` · test: `src/lib/server/db/actions/taskfocusSessions.test.ts` › "floors the SUMMED duration (two 90 s sessions = 3 min, not 2)"
- Phone session invariants: one open session per user enforced by a partial unique index → `409` with `openSessionId`; a finished POST is never refused; start ≤ 5 min ahead, `endedAt > startedAt` and ≤ 12 h (both bounds inclusive); absorbed sessions are immutable (PATCH/DELETE → 409), absorb is idempotent and refuses open sessions — `src/lib/server/db/actions/taskfocusSessions.ts:70-84,215-330`; `src/lib/server/db/schema.ts:607-609` · test: `src/routes/api/taskfocus/sessions/server.test.ts` › "409 with openSessionId when an open session already runs; a finished POST still succeeds", "200 marks a closed session absorbed; repeat is 200 (idempotent)"
- Commands are a per-user FIFO: oldest first, ≤ 25 per read, > 10 min dropped on read, ack always `204`; a TaskFocus command channel that answers 404/405 is "unsupported" to the client — `src/routes/api/taskfocus/commands/+server.ts:16-19,28-70`; `src/lib/client/taskFocus.ts:31-35`
- Stats count `taskCompletions`, never `tasks.completedAt`/`completionCount`: attributed to the viewer by `actorId` with the legacy owner fallback; `doneBy` is deliberately scoped to the viewer's own Task rows; `recurringTasks` counts Task rows; recent = 10, top assigners/assignees = 5 — `src/lib/server/db/actions/taskStats.ts:45-150`; `src/lib/server/db/actions/completionAttribution.ts:9-18` · test: `src/lib/server/db/actions/taskStats.attribution.test.ts` › "counts every viewer-facing figure by actor with legacy-owner fallback"
- Weekly streak: ISO weeks, one skipped week per gap forgiven, the open current week is grace not a break, empty history is zero — `src/lib/server/services/streakService.ts:50-94` · test: `src/lib/server/services/streakService.test.ts` › "forgives ONE skipped week per gap (freeze keeps it alive)", "TWO consecutive skipped weeks end the streak"

### Page and UI behaviour worth keeping

- `/calendar/tasks` lists MY tasks under chips `Every scope | Public | Private | Family` (family = Family Tasks assigned to me); per-chip empty copy: "No tasks yet / Add your first task above", "No public tasks / Public tasks also show on your family's Public tasks tab", "No private tasks", "No family tasks assigned to you" — `src/lib/components/tasks/TaskToolbar.svelte:5-9`; `src/lib/components/tasks/TasksMainList.svelte:91-104`
- Jump bar `All | Overdue | Today | Up next | Done` with bucket counts; a late row prints "1 day late"/"N days late"; nothing left → "All caught up 🎉 / Nothing open right now"; nothing matching → "No matching tasks / Try another chip, or clear the search and filters" — `src/lib/utils/taskUrgency.ts:21-26,67-73,99-105`; `src/lib/components/tasks/TasksMainList.svelte:280-285,340-360`
- Completion is optimistic (per-id override on top of server data), celebrates with a 15 ms vibrate, re-reads with `invalidateAll`, then toasts `"<title>" marked done.`; a network failure enqueues the same PUT for offline replay and keeps the optimistic state — `src/routes/(calendar)/calendar/tasks/+page.svelte:261-300,369-373`
- Recurring feedback toasts: complete → "✅ Done for this {day|week|month|year} — counts toward your streak. Next: <date>." with an Undo action; skip → "Skipped this occurrence — not counted toward your streak."; undo failure → "Couldn't undo — the task may have changed. Refresh and try again.", success → "↩️ Undone — back to the previous occurrence." — `src/lib/client/taskFeedback.ts:48-99`
- Edit dialog saves via PUT and toasts `Saved "<title>".` / `Couldn't save "<title>" — <reason>`; it closes only on success and sends `visibility` only when the viewer owns the Task — `src/lib/client/taskEditSave.ts:20-46`; `src/lib/utils/taskEditPayload.ts:53-86`
- Assignment responses toast `Accepted "<title>" — it's on your list.` / `Declined "<title>" — sent back to the requester.` — `src/routes/(calendar)/calendar/tasks/+page.svelte:123-141`
- Delete is inline-confirmed, then `Deleted "<title>".`; "clear completed" is inline-confirmed, then "Completed tasks cleared — fresh start." — `src/routes/(calendar)/calendar/tasks/+page.svelte:375-414`
- Focus start/stop on a row goes through the command channel (never writes minutes), flips the row optimistically, re-reads after `FOCUS_SETTLE_MS` 4000; an unsupported server shows "This server can't start focus yet."; the row shows "Focusing · Nm"/"Nm focus" — `src/lib/client/taskFocus.ts:10-47`; `src/routes/(calendar)/calendar/tasks/+page.svelte:338-368`; `src/lib/components/tasks/TaskRow.svelte:106-113`
- Category manager is optimistic (rename/delete applied locally, rollback + `role="alert"` + toast on error) — `src/lib/components/tasks/TaskCategoryManager.svelte:12-95`
- Event modal checklist reads `/api/tasks?eventId=`, adds/toggles/removes inline, and reports `hasTasks` so the parent can warn before deleting the Event — `src/lib/components/calendar/ChecklistSection.svelte:10-30,46-125`
- Quick add parses `@member`/`for Name`, `#tags`, `#public`/`#private`, `@family`, priority phrases, cadences ("every 2 weeks") and due dates; an unknown/ambiguous `@member` becomes an inline error rather than a silent drop; `@family` without a family errors; a cadence with no date gets an end-of-day cursor — `src/lib/utils/taskQuickAdd.ts:13-19,114-127`; `src/lib/client/taskSubmit.ts:38-73`
- Sort key and tag filter persist in `localStorage` (`familyplanz:tasksSortBy`, `familyplanz:tagFilter`); search matches title, notes, tags and assignee names — `src/routes/(calendar)/calendar/tasks/+page.svelte:105-112,213-230`

### Probably accidental (candidates to drop, owner to confirm)

- PUT accepts a raw `completedAt` string and writes it directly, bypassing the recurrence cursor and the history row — `src/routes/api/tasks/[id]/+server.ts:234-238` — why: the spec tells clients not to send it; it lets stats and the cursor diverge.
- PUT never validates `dueDate` (`body.dueDate || null`), so garbage reaches the UPDATE, while POST answers `400 Invalid dueDate` for the same input — `src/routes/api/tasks/[id]/+server.ts:231` vs `src/routes/api/tasks/+server.ts:105-112` — why: inconsistent contract, one of them 500s.
- `assignmentStatus: 'declined'` is never stored: the route rewrites it to `{assignedTo:null, assignmentStatus:'none'}`, yet the UI badges `declined` — `src/routes/api/tasks/[id]/+server.ts:186-188`; `src/lib/components/tasks/AssignmentsCard.svelte:119` — why: unreachable state; the declared `declined` wire value never exists.
- POST passes `notes: body.notes || null` straight through, so any truthy non-string (object/number) goes to a text column — `src/routes/api/tasks/+server.ts:205` — why: no type check, 500 instead of 400.
- A whitespace-only `title` on PUT is silently ignored (stays unchanged) instead of being rejected — `src/routes/api/tasks/[id]/+server.ts:229` — why: a no-op where every other invalid input is a 400.
- `GET /api/tasks` returns every row of the caller's family, whatever its visibility or assignment — `src/lib/server/db/actions/tasks/queries.ts:27-36` — why: contradicts CONTEXT "Family Task … appears on an individual's list only when assigned to them"; the page uses `myTasks` instead.
- The `?eventId=` branch returns raw task rows without `tags`, `eventTitle` or `eventCalendarId ?? null` shaping that the main list branch applies — `src/routes/api/tasks/+server.ts:71-74`; `src/lib/server/db/actions/tasks/queries.ts:72-79` — why: two different Task shapes on one route.
- `POST /api/taskfocus/commands` validates `taskId` ownership even for `stop`, so a stop carrying a foreign task id is a 400 though stop ignores the id — `src/routes/api/taskfocus/commands/+server.ts:72-85` — why: stricter than the documented contract ("stop whatever is running").
- `advanceTaskToNext` writes `completedAt: null`, silently reopening a completed recurring row on skip — `src/lib/server/db/actions/tasks/cursor.ts:144` — why: skip should not change completion state.
- The command queue caps reads at 25 with no cursor/paging, so a backlog beyond 25 is invisible until acked — `src/routes/api/taskfocus/commands/+server.ts:19,46` — why: spec describes the whole queue oldest-first.
- `advanceRecurringTask` inserts the history row after the guarded UPDATE outside a transaction — `src/lib/server/db/actions/tasks/cursor.ts:99-113` — why: a crash between the two loses a completion from stats/streaks.
- `deleteCompletedTasks` archives only rows the caller owns, leaving completed accepted assignments behind — `src/lib/server/db/actions/tasks/mutations.ts:196-201` — why: the page's "clear completed" leaves rows it displays.
- Focus is offered only when `task.userId === currentUserId`, so an accepted assignee cannot focus a Task they can otherwise complete — `src/lib/components/tasks/TaskRow.svelte:113` — why: narrower than `canMutateTask`.
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#079](../../archive/issues/079-tasks-page-spacing.md) Filter-row, inbox and row-meta spacing polish. | DESIGN | keep markup; do not regress |
| [#113](../../archive/issues/113-tasks-ts-six-modules-in-one-file.md) tasks.ts split, shared section select, eventCalendarId on every list query, merge the 7 vi… | STRUCTURE | FIX-IN-PORT for structure (the tasks port supersedes it); adding eventCalendarId to other lists is additive and stays a ticket |
| [#320](../../archive/issues/320-desktop-task-read-panel.md) Desktop task read panel (feature in progress on test). | BEHAVIOUR | arrives through sync-with-test; port what has landed |
| [#321](../../archive/issues/321-convert-task-to-jira-linear.md) Convert task to Jira/Linear. | OWNER | owner |

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# tasks: 0% ported

legacy source files left (59/59, 8321 LOC):
  - src/lib/client/taskCategories.ts (44 LOC, client) importers: 1
  - src/lib/client/taskEditSave.ts (46 LOC, client) importers: 2
  - src/lib/client/taskFeedback.ts (99 LOC, client) importers: 5
  - src/lib/client/taskFocus.ts (44 LOC, client) importers: 1
  - src/lib/client/taskSubmit.ts (83 LOC, client) importers: 2
  - src/lib/components/TaskQuickAddHelp.svelte (57 LOC, ui) importers: 4
  - src/lib/components/TaskQuickAddPreview.svelte (94 LOC, ui) importers: 2
  - src/lib/components/calendar/ChecklistSection.svelte (269 LOC, ui) importers: 2
  - src/lib/components/calendar/TaskDetailBar.svelte (75 LOC, ui) importers: 1
  - src/lib/components/calendar/TaskDetailModal.svelte (295 LOC, ui) importers: 8
  - src/lib/components/tasks/AddTaskCard.svelte (500 LOC, ui) importers: 1
  - src/lib/components/tasks/AssignmentsCard.svelte (134 LOC, ui) importers: 1
  - src/lib/components/tasks/CategoryChip.svelte (24 LOC, ui) importers: 6
  - src/lib/components/tasks/CategoryField.svelte (57 LOC, ui) importers: 3
  - src/lib/components/tasks/CategorySelect.svelte (141 LOC, ui) importers: 2
  - src/lib/components/tasks/EditTaskDialog.svelte (291 LOC, ui) importers: 4
  - src/lib/components/tasks/FamilyCompletedTaskList.svelte (61 LOC, ui) importers: 1
  - src/lib/components/tasks/FamilyOpenTaskRow.svelte (215 LOC, ui) importers: 1
  - src/lib/components/tasks/FamilyTaskAddForm.svelte (156 LOC, ui) importers: 0
  - src/lib/components/tasks/FamilyTaskFilterBar.svelte (88 LOC, ui) importers: 0
  - src/lib/components/tasks/FamilyTaskRow.svelte (298 LOC, ui) importers: 2
  - src/lib/components/tasks/FamilyTasksList.svelte (141 LOC, ui) importers: 0
  - src/lib/components/tasks/TaskCategoryManager.svelte (205 LOC, ui) importers: 1
  - src/lib/components/tasks/TaskCompletedRow.svelte (110 LOC, ui) importers: 1
  - src/lib/components/tasks/TaskRow.svelte (452 LOC, ui) importers: 1
  - src/lib/components/tasks/TaskTagFilter.svelte (59 LOC, ui) importers: 2
  - src/lib/components/tasks/TaskToolbar.svelte (222 LOC, ui) importers: 2
  - src/lib/components/tasks/TasksHeader.svelte (33 LOC, ui) importers: 1
  - src/lib/components/tasks/TasksMainList.svelte (402 LOC, ui) importers: 1
  - src/lib/server/db/actions/completionAttribution.ts (18 LOC, server) importers: 2
  - src/lib/server/db/actions/taskCategories.ts (216 LOC, server) importers: 9
  - src/lib/server/db/actions/taskPriority.ts (32 LOC, model) importers: 3
  - src/lib/server/db/actions/taskStats.ts (156 LOC, server) importers: 3
  - src/lib/server/db/actions/taskfocusSessions.memoryStore.ts (80 LOC, server) importers: 0
  - src/lib/server/db/actions/taskfocusSessions.ts (376 LOC, server) importers: 5
  - src/lib/server/db/actions/tasks/assignment.ts (133 LOC, server) importers: 1
  - src/lib/server/db/actions/tasks/auth.ts (47 LOC, server) importers: 3
  - src/lib/server/db/actions/tasks/cursor.ts (307 LOC, server) importers: 3
  - src/lib/server/db/actions/tasks/index.ts (47 LOC, server) importers: 1
  - src/lib/server/db/actions/tasks/mutations.ts (220 LOC, server) importers: 1
  - src/lib/server/db/actions/tasks/queries.ts (225 LOC, server) importers: 2
  - src/lib/server/db/actions/tasks/tags.ts (51 LOC, server) importers: 4
  - src/lib/server/db/actions/tasks/types.ts (75 LOC, server) importers: 4
  - src/lib/server/services/statsData.ts (46 LOC, server) importers: 2
      NOTE: Uses dashboard.ts getCompletionTimestamps: that reader moves into tasks (it reads taskCompletions).
  - src/lib/server/services/streakService.ts (95 LOC, model) importers: 2
  - src/lib/server/services/tasksData.ts (61 LOC, server) importers: 2
  - src/lib/server/utils/focusStartedAt.ts (21 LOC, model) importers: 2
  - src/lib/utils/familyTaskActions.ts (144 LOC, model) importers: 5
  - src/lib/utils/familyTaskGroups.ts (62 LOC, model) importers: 2
  - src/lib/utils/familyTaskList.ts (93 LOC, model) importers: 0
  - src/lib/utils/priorityTone.ts (72 LOC, model) importers: 9
  - src/lib/utils/taskBulk.ts (65 LOC, model) importers: 1
  - src/lib/utils/taskCategory.ts (39 LOC, model) importers: 8
  - src/lib/utils/taskDisplay.ts (40 LOC, model) importers: 13
  - src/lib/utils/taskEditPayload.ts (86 LOC, model) importers: 1
  - src/lib/utils/taskQuickAdd.ts (599 LOC, model) importers: 8
  - src/lib/utils/taskRecurrence.ts (35 LOC, model) importers: 2
  - src/lib/utils/taskSort.ts (79 LOC, model) importers: 5
  - src/lib/utils/taskUrgency.ts (106 LOC, model) importers: 4

route files not yet wiring-only (20/20):
  - src/routes/(calendar)/calendar/archive/+page.server.ts  /calendar/archive
  - src/routes/(calendar)/calendar/archive/+page.svelte  /calendar/archive
  - src/routes/(calendar)/calendar/stats/+page.server.ts  /calendar/stats
  - src/routes/(calendar)/calendar/stats/+page.svelte  /calendar/stats
  - src/routes/(calendar)/calendar/stats/statsPageModel.ts  /calendar/stats
  - src/routes/(calendar)/calendar/tasks/+page.server.ts  /calendar/tasks
  - src/routes/(calendar)/calendar/tasks/+page.svelte  /calendar/tasks
      NOTE: Fat page: extract state into `<name>.state.svelte.ts` + pure rules; the screen component stays under ~250 lines.
  - src/routes/api/archive/+server.ts  /api/archive
  - src/routes/api/stats/+server.ts  /api/stats
  - src/routes/api/task-categories/+server.ts  /api/task-categories
  - src/routes/api/task-categories/[id]/+server.ts  /api/task-categories/[id]
  - src/routes/api/taskfocus/commands/+server.ts  /api/taskfocus/commands
      NOTE: Inline drizzle on taskfocusCommands -> tasks repo (focus commands).
  - src/routes/api/taskfocus/commands/[id]/+server.ts  /api/taskfocus/commands/[id]
  - src/routes/api/taskfocus/sessions/+server.ts  /api/taskfocus/sessions
  - src/routes/api/taskfocus/sessions/[id]/+server.ts  /api/taskfocus/sessions/[id]
  - src/routes/api/taskfocus/sessions/[id]/absorb/+server.ts  /api/taskfocus/sessions/[id]/absorb
  - src/routes/api/tasks/+server.ts  /api/tasks
  - src/routes/api/tasks/[id]/+server.ts  /api/tasks/[id]
      NOTE: 353-line PUT: each branch (undo, advance, toggle, assignment response, field patch) becomes its own tasks service function; the endpoint dispatches by body shape. Keep the focusMinutes never-wipe rule.
  - src/routes/api/tasks/completed/+server.ts  /api/tasks/completed
  - src/routes/api/tasks/sections/+server.ts  /api/tasks/sections

legacy test files left (71/71) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/client/taskCategories.test.ts [pure, 3 tests]
  - src/lib/client/taskEditSave.test.ts [pure, 5 tests]
  - src/lib/client/taskFeedback.test.ts [mocked, 3 tests]
  - src/lib/client/taskFocus.test.ts [pure, 5 tests]
  - src/lib/client/taskSubmit.test.ts [pure, 8 tests]
  - src/lib/components/calendar/TaskDetailBar.svelte.test.ts [component, 4 tests]
  - src/lib/components/calendar/TaskDetailModal.svelte.test.ts [component, 3 tests]
  - src/lib/components/tasks/AddTaskCard.svelte.test.ts [component, 8 tests]
  - src/lib/components/tasks/AssignmentsCard.svelte.test.ts [component, 9 tests]
  - src/lib/components/tasks/CategoryChip.svelte.test.ts [component, 1 tests]
  - src/lib/components/tasks/CategorySelect.svelte.test.ts [component, 5 tests]
  - src/lib/components/tasks/EditTaskDialog.svelte.test.ts [component, 9 tests]
  - src/lib/components/tasks/FamilyCompletedTaskList.svelte.test.ts [component, 3 tests]
  - src/lib/components/tasks/FamilyOpenTaskRow.svelte.test.ts [component, 5 tests]
  - src/lib/components/tasks/FamilyTaskAddForm.svelte.test.ts [component, 5 tests]
  - src/lib/components/tasks/FamilyTaskFilterBar.svelte.test.ts [component, 2 tests]
  - src/lib/components/tasks/FamilyTaskRow.svelte.test.ts [component, 6 tests]
  - src/lib/components/tasks/FamilyTasksList.svelte.test.ts [component, 2 tests]
  - src/lib/components/tasks/TaskCategoryManager.svelte.test.ts [component, 8 tests]
  - src/lib/components/tasks/TaskCompletedRow.svelte.test.ts [component, 4 tests]
  - src/lib/components/tasks/TaskRow.svelte.test.ts [component, 21 tests]
  - src/lib/components/tasks/TaskTagFilter.svelte.test.ts [component, 2 tests]
  - src/lib/components/tasks/TaskToolbar.svelte.test.ts [component, 10 tests]
  - src/lib/components/tasks/TasksHeader.svelte.test.ts [component, 3 tests]
  - src/lib/components/tasks/TasksMainList.svelte.test.ts [component, 20 tests]
  - src/lib/server/db/actions/taskCategories.real.test.ts [real-db, 3 tests]
  - src/lib/server/db/actions/taskCategories.test.ts [pure, 17 tests]
  - src/lib/server/db/actions/taskStats.attribution.test.ts [stub-db, 3 tests]
  - src/lib/server/db/actions/taskStats.completions.test.ts [stub-db, 2 tests]
  - src/lib/server/db/actions/taskStats.test.ts [pure, 4 tests]
  - src/lib/server/db/actions/taskfocusSessions.real.test.ts [real-db, 5 tests]
  - src/lib/server/db/actions/taskfocusSessions.test.ts [stub-db, 9 tests]
  - src/lib/server/db/actions/tasks/advanceTaskToNext.test.ts [stub-db, 7 tests]
  - src/lib/server/db/actions/tasks/familyTaskSeam.test.ts [stub-db, 8 tests]
  - src/lib/server/db/actions/tasks/queries.category.test.ts [stub-db, 0 tests]
  - src/lib/server/db/actions/tasks/syncRecurringCursors.test.ts [stub-db, 10 tests]
  - src/lib/server/db/actions/tasks/taskMutation.test.ts [stub-db, 18 tests]
  - src/lib/server/db/actions/tasks/tasks.test.ts [stub-db, 31 tests]
  - src/lib/server/db/actions/tasks/toggleTaskComplete.real.test.ts [real-db, 6 tests]
  - src/lib/server/db/actions/tasks/toggleTaskComplete.test.ts [stub-db, 6 tests]
  - src/lib/server/db/actions/tasks/undoRecurringCompletion.test.ts [stub-db, 7 tests]
  - src/lib/server/services/streakService.test.ts [pure, 14 tests]
  - src/lib/utils/familyTaskActions.test.ts [pure, 8 tests]
  - src/lib/utils/familyTaskGroups.test.ts [pure, 9 tests]
  - src/lib/utils/familyTaskList.test.ts [pure, 5 tests]
  - src/lib/utils/priorityTone.test.ts [pure, 5 tests]
  - src/lib/utils/taskBulk.test.ts [pure, 4 tests]
  - src/lib/utils/taskCategory.test.ts [pure, 3 tests]
  - src/lib/utils/taskDisplay.test.ts [pure, 6 tests]
  - src/lib/utils/taskEditPayload.test.ts [pure, 6 tests]
  - src/lib/utils/taskQuickAdd.test.ts [pure, 2 tests]
  - src/lib/utils/taskRecurrence.test.ts [pure, 4 tests]
  - src/lib/utils/taskSort.test.ts [pure, 5 tests]
  - src/lib/utils/taskUrgency.test.ts [pure, 10 tests]
  - src/routes/(calendar)/calendar/archive/page.svelte.test.ts [component, 16 tests]
  - src/routes/(calendar)/calendar/stats/page.svelte.test.ts [component, 13 tests]
  - src/routes/(calendar)/calendar/stats/statsPageModel.test.ts [route, 14 tests]
  - src/routes/(calendar)/calendar/tasks/page.server.test.ts [route, 4 tests]
  - src/routes/(calendar)/calendar/tasks/page.ssr.test.ts [route, 7 tests]
  - src/routes/(calendar)/calendar/tasks/page.svelte.test.ts [component, 5 tests]
  - src/routes/api/stats/server.test.ts [route, 6 tests]
  - src/routes/api/task-categories/server.test.ts [route, 13 tests]
  - src/routes/api/taskfocus/commands/[id]/server.test.ts [route, 3 tests]
  - src/routes/api/taskfocus/commands/server.test.ts [route, 9 tests]
  - src/routes/api/taskfocus/sessions/server.test.ts [route, 25 tests]
  - src/routes/api/tasks/[id]/bearer.test.ts [route, 3 tests]
  - src/routes/api/tasks/[id]/category.test.ts [route, 6 tests]
  - src/routes/api/tasks/[id]/server.test.ts [route, 36 tests]
  - src/routes/api/tasks/category.test.ts [route, 5 tests]
  - src/routes/api/tasks/sections/server.test.ts [route, 4 tests]
  - src/routes/api/tasks/server.test.ts [route, 28 tests]
```
<!-- census:end -->
