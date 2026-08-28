# Day Dashboard — Research & Plan

Status: **planning — decisions resolved 2026-08-28 via grill-with-docs review with the user.** Research only, no code written. Domain language per [CONTEXT.md](../CONTEXT.md) (Task, Recurring Task cursor, Task Priority, Family Member, Member Type, Daily Verse, Day Dashboard, Dashboard Module).

---

## 0. Decisions (resolved with the user)

1. **Top-3 scope** — family-wide, **mine-first**: rank = my Tasks lead → Task Priority → overdue → due-today → next-due. A **High-priority Task with no due date still ranks in** (priority is the gate, not the date).
2. **Family Task Board** — all *open* family Tasks (not just today's), grouped by **assignee ?? creator**. Complements the today-focused Top-3. (UI may say "chores"; canonical term Family Task Board.)
3. **Task Priority column** — `tasks.priority` (`'low'|'normal'|'high'`, default `'normal'`), added in **Phase 1**. Set via: task create/edit form picker **+** inline stepper on dashboard rows; NLP quick-add keywords ("…high priority") are a Phase 2+ extension.
4. **Placement** — separate route `(calendar)/calendar/dashboard` surfaced from the **calendar toolbar actions cluster** (Import · Print · Settings) (Calendar.svelte:237-271). `userSettings.defaultView` untouched for now — **a `'dashboard'` opt-in landing was added in Phase 2** (Account → Default View).
5. **Per-day dashboards** — the route shows *today* in Phase 1; a `?date=YYYY-MM-DD` param lands later, and month-view day taps offer "open day dashboard" alongside the existing drill-down.
6. **Verse module** — the existing **Daily Verse** (ESV, gate `showDailyVerse`/`verseTranslation`, schema.ts:54-58) rendered on the dashboard via `getTodayVerse` + `DailyVerseCard`; the in-calendar strip stays as-is. Saved-verses **Verse Vault** is a separate, unbuilt future feature (spec'd only).
7. **Kid identification** — new `familyMembers.memberType` (`'parent'|'child'|'member'`, default `'member'`), **separate from** the permission `role` ladder (`creator|admin|member`, family/[familyId]+page.server.ts:43,92). Kids' Schedule = today's events where a **Child** is an attendee (`eventAttendance`, schema.ts:296). Kids are user accounts (Anonymous or claimed) — invite flow already covers joining.
8. **Meals** — new `meals` table (Phase 3) **+ a family-level "don't use meals" switch** (rides the Dashboard Module config, item 9).
9. **Dashboard Module config — both layers**: family-level master enable switch per module (admin-controlled) + per-user hide override. A family-level off hides it for everyone.
10. **Member strip status** — per-member **open-task count today** + a dot when the member attends an event today (`eventAttendance` join). No live presence.
11. **Empty states** — when there's no family (`getUserFamilyId` null), family modules (Family Task Board, Kids' Schedule, Member Strip, Meals) are **hidden**, not broken; personal modules (Top-3, Today at a Glance, Daily Verse) render from personal data.
12. **"Today" boundary** — everything uses the user's own zone via `getUserZone`/`zonedNow` (userTimezone util), same as the calendar load. No new timezone machinery.

**Assumptions (not yet user-confirmed):** ad events are excluded from the dashboard (personal action surface); the calendar Daily Verse strip is retained alongside the dashboard module; the Top-3 card may show fewer than three Tasks when fewer qualify.

---

## 1. Vision

A **Day Dashboard** is an at-a-glance view for a busy parent opening the app to answer one question:

> *"What do I need to know — and do — about today?"*

It consolidates the stuff scattered across calendar + tasks + family onto a single scroll: today's events and timeline, the few Tasks that matter right now, who in the family owns what, what's for dinner, and a quiet daily verse. It's a **composition layer over existing Tasks/events/family** — not a new data model — that turns *"open the calendar"* into *"see the day."* Phase 1 renders *today*; a `?date=` parameter later makes any chosen day the subject (decision 5).

Target user: a **father-facing** persona ("dad opens the app, skim, act, close"). Signal, not chrome. Every module pulls from the existing schema where possible — the single Phase 1 schema addition is `tasks.priority` (decisions 1+3) — and degrades gracefully when a family has no data yet.

---

## 2. Modules (canonical names in bold)

### 2.1 Today at a Glance
Hero strip: today's date, a compact day-timeline of timed events (DayView lane-layout concept), all-day events, and a progress line — today's completion count vs open, plus the weekly streak from `taskCompletions`. Data: events, dueTasks, streak. No schema change. With `?date=` (Phase 2) it renders *any* viewed day as "that day at a glance" — the card title becomes "Day at a Glance" for non-today days, and the done/open progress is computed for the viewed day.

### 2.2 Top-3 Priorities
The three family Tasks that most need handling today: **my Tasks lead**, then Task Priority → overdue → due-today → next-due (decision 1). High-priority Tasks without a due date rank in. Row has check-off + assignee name + inline priority stepper.

### 2.3 Family Task Board
Every open family Task grouped by **assignee ?? creator** (unassigned Tasks fall to their creator — CONTEXT.md:43, tasks.ts:86), each with a check-off. Full board, not today-only (decision 2); the today focus lives in Top-3.

### 2.4 Kids' Schedule
Today's events with a **Child** as attendee (`memberType='child'`, `eventAttendance` join) — sports, lessons, pickups — as a simple agenda. Requires decision 7 (memberType, Phase 3). Caveat: kids must be marked as attendees on events for this to populate — a documented product behavior, not a bug.

### 2.5 Member Strip
Horizontal row of family avatars/names; each pill shows the member's **open-task count today** and a dot when they attend an event today (decision 10). Roster via `getFamilyRoster`; `avatarColor` util exists.

### 2.6 Meals
"What's for dinner" — today's `meals` rows (Phase 3 table) with quick-add/edit, per `kind` (breakfast/lunch/dinner/snack). Rides the family-level "don't use meals" switch (decisions 8+9). No recurrence in MVP.

### 2.7 Daily Verse
The existing Daily Verse reused verbatim (decision 6): `DailyVerseCard` + `getTodayVerse(verseTranslation)`, gated on `showDailyVerse`. No new data. Verse Vault (saved verses) is future scope, not built here.

---

## 3. Data feasibility per module

Existing tables (src/lib/server/db/schema.ts): `users` (16), `userSettings` (39), `families` (276), `familyMembers` (210), `calendars` (286), `events` (332), `eventExceptions` (358), `eventAttendance` (296), `tasks` (404), `taskCompletions` (436), `notifications` (458), `pushSubscriptions` (575).

| Module | Feasible today? | What exists | Gaps / addition |
|---|---|---|---|
| Today at a Glance | ✅ Yes | events+start/end (schema:342-349); `expandEventsForUser`+`parseEvents` (eventDisplayService.ts:5,30); dueTasks (tasks.ts:97); `computeWeeklyStreak` (streakService.ts:50), `getTaskStats` (taskStats.ts:29) | none structural |
| Top-3 Priorities | ✅ 1 small migration | **new `tasks.priority`** (Phase 1) + dueDate/completedAt/assignmentStatus/assignedTo (schema:410-420), `getTasksForUser` (tasks.ts:97) | priority column + ranking helper |
| Family Task Board | ✅ Yes | `tasks.familyId` (424) `assignedTo` (419), `getTasksForFamily` (tasks.ts:139) w/ assignee join, roster (families.ts:149), toggle `/api/tasks/{id}` | none for read |
| Kids' Schedule | ⚠️ Phase 3 | `eventAttendance` (schema:296) + roster | **new `familyMembers.memberType`** column |
| Member Strip | ✅ Yes | roster (families.ts:149-163), `users.picture` (schema:26) | status = derived counts + attendance dot |
| Meals | ❌ Phase 3 | — | **new `meals` table** + family module switch |
| Daily Verse | ✅ Yes | `DailyVerseCard.svelte`, `getTodayVerse` (verseService.ts:158), settings (schema:54-58) | none — full reuse |

**Honest engineering notes**
- **Permission `role` vs profile `memberType` must stay separate** (decision 7): `PRIVILEGE = {creator:2, admin:1, member:0}` and the `updateRole` whitelist (`['creator','admin','member']`) break if person-types leak into `role` (family/[familyId]+page.server.ts:43,92).
- **Recurring Task caveat**: cursor model (CONTEXT.md:46; tasks.ts:207-237) — exactly one live occurrence; `tasks.priority` rides the row and **persists across cursor advances** (only `dueDate`/`completionCount` move). No special handling.
- **Day boundary**: "today" = `zonedNow(getUserZone(userId))` (calendar +page.server.ts:109) — the same zone that drives existing loads. `?date=` later reuses it with an override.

---

## 4. Component / loader architecture

Follow the existing `(calendar)` route pattern: `+page.server.ts` load → page `.svelte` composer → card components, inside the existing `(calendar)/calendar/+layout.svelte` shell.

### 4.1 Route & nav
- `src/routes/(calendar)/calendar/dashboard/+page.server.ts` + `+page.svelte`; same auth guard as calendar +page.server.ts:22-25.
- Nav: **toolbar actions cluster** in Calendar.svelte (Import · Print · Settings, Calendar.svelte:237-271) gains a Dashboard icon-link (decision 4) — done.
- Phase 2: accept `?date=YYYY-MM-DD` (today when absent; user-zone day boundary); month-view day-cell header gains an "open day dashboard" link alongside the "+" add button, and the dashboard header has prev/today/next day nav — done.

### 4.2 Reuse (no new plumbing)
- **Verse**: `DailyVerseCard` (props reference/text/attribution) + `getTodayVerse(userSettings.verseTranslation)`; gate `showDailyVerse` — pattern copied from calendar +page.server.ts:127-128 and Calendar.svelte:279-287.
- **Events/timeline**: `expandEventsForUser` + `parseEvents`, filter to the target day (DayView.svelte:128-227 markup as reference).
- **Tasks**: `syncRecurringCursors` then `getTasksForUser` / `getTasksForFamily` (tasks.ts:97,139); check-off via `/api/tasks/{id}` PUT (family tasks svelte:101-113). New pure selector `rankTop3(tasks, viewerId)` (priority → overdue → due-today → next, mine-first) — seam for unit tests.
- **Roster**: `getUserFamilyId` (families.ts:140) + `getFamilyRoster` (families.ts:149) — same shape as calendar +page.server.ts:89-97.
- **Progress/streak**: `getTaskStats` (taskStats.ts:29), `computeWeeklyStreak` (streakService.ts:50) as stats/+page.server.ts:14-28.

### 4.3 New components (`src/lib/components/dashboard/`)
- `DayDashboard.svelte` — composer: card grid, empty-state handling (EmptyState pattern, calendar +page.svelte:390-415), renders only family modules when `familyId` exists (decision 11).
- `TodayGlanceCard.svelte` — date, today timeline, progress + streak chip.
- `TopPrioritiesCard.svelte` — ranked rows w/ check-off, assignee, inline priority stepper.
- `FamilyTaskBoardCard.svelte` — open Tasks grouped by `assignee ?? creator`.
- `KidsScheduleCard.svelte` — today's events with a child attendee (Phase 3).
- `MemberStrip.svelte` — avatar pills + open-task count + today-attending dot (`avatarColor` util).
- `MealsCard.svelte` — Phase 3+, from `meals` table.
- Reuse `DailyVerseCard.svelte` verbatim.

### 4.4 Data flow
```
+page.server.ts load()
  ├─ auth guard (redirect /login)                        [copy calendar]
  ├─ date = ?date ?? zonedNow(getUserZone(userId))       [decision 12]
  ├─ getUserSettings → showDailyVerse? getTodayVerse()   [verse]
  ├─ syncRecurringCursors (userId, familyId, zone)
  ├─ familyId = getUserFamilyId(userId)                  [gate family modules]
  ├─ Promise.all:                                        [skip family bits w/out familyId]
  │    ├─ getTasksForUser / getTasksForFamily            [top3 + board]
  │    ├─ expandEventsForUser+parseEvents (user+family)  [glance, kids]
  │    ├─ attendance join for selected day               [member dot, kids]
  │    ├─ getFamilyRoster                                [member strip]
  │    └─ getTaskStats + computeWeeklyStreak             [progress]
  └─ return { date, userEvents, familyEvents, tasks, familyTasks, members,
              streak, stats, dailyVerse, userSettings, familyId,
              moduleSwitches /* family + per-user, Phase 2 */ }
```
Cards are pure presentational; check-offs / priority changes call `/api/tasks/{id}` then `invalidateAll()` (server re-runs the same load — no client state duplication; family tasks svelte:101-113, calendar +page.svelte:304-307).

---

## 5. 3-phase implementation plan

Each phase: **build → test → push `test`** (auto-deploys to https://test.familyplanz.com; wait ~1 min, verify with Vercel MCP). Confirm with the user between phases. Use the `tdd` skill where a seam exists (esp. `rankTop3`, priority migration).

**Migration mechanics:** `npm run db:push` needs an interactive TTY and applies unrelated pre-existing drift — schema changes go through a targeted SQL temp script (`scripts/tmp-schema-apply.mjs`, deleted after running) against the Neon `DATABASE_URL` in `.env`, and the user also gets the raw SQL (per AGENTS.md).

### Phase 1 — Dashboard MVP (one migration)
- Migrate `tasks.priority` (`'low'|'normal'|'high'`, default `'normal'`); update Drizzle `schema.ts` + `Task` type; `updateTask`/`updateTaskInFamily` pass-through (tasks.ts:170,339).
- Priority picker in existing task create/edit forms; quick task form on tasks pages.
- Dashboard route (today-only) + toolbar nav link + composer.
- Cards: **Today at a Glance · Top-3 Priorities · Family Task Board · Member Strip · Daily Verse** (family modules hidden without a family — decision 11).
- `rankTop3` pure selector + tests.

### Phase 2 — Per-day + config (code only)
- ✅ `?date=` param + "open day dashboard" from month-view day taps (day-cell header link + prev/today/next nav on the dashboard).
- ✅ Dashboard Module config: **family-level master switches** (admin-only, family page Settings panel; `toggleDashboardModule` action, back-ended by `dashboardModuleSwitches` — a row exists only while switched off) + **per-user hide overrides** (`/account` → Calendar settings "Dashboard modules" block; stored as `userSettings.hiddenDashboardModules text[]`). Effective visibility = `composeModuleVisibility(familySwitches, hidden)` in the dashboard loader; hidden family modules skip their heavy fetches.
- ✅ Opt-in landing via `userSettings.defaultView: 'dashboard'` — `/calendar` server-redirects to `/calendar/dashboard` unless `?dashboardView=1` (the dashboard's "Back to Calendar" escape). Option surfaced in Account → Default View.
- ✅ NLP priority keywords in quick-add ("…high priority") — extracted to `src/lib/utils/taskQuickAdd.ts` (`parseTaskQuickAdd`), consumed by the tasks-page quick-add (posts `priority` through `/api/tasks`; server clamps via `TASK_PRIORITIES`). **TDD phrase table** in `taskQuickAdd.test.ts` (26 cases incl. word-order/case/colon/hyphen variants + combined date+priority). AGENTS.md NLP rule holds (existing `naturalLanguageService` suite untouched).

### Phase 3 — Kids + meals (two migrations)
- `familyMembers.memberType` (`'parent'|'child'|'member'`, default `'member'`); set in family page; **Kids' Schedule** card (child-attended events).
- `meals` table (`id`, `familyId`, `date`, `kind`, `label`, `createdBy`, timestamps) + CRUD + **Meals** card riding the family module switch.
- Raw SQL for both migrations to the user (AGENTS.md).

---

## 6. Resolution log (grill 2026-08-28)

| # | Question | Resolution |
|---|---|---|
| PG 1 | Top-3 priority basis | **Resolved** — explicit `tasks.priority`; no-due High ranks in (decisions 1,3) |
| PG 2 | Meals data model | **Resolved** — new `meals` table + family "don't use meals" switch (decision 8) |
| PG 3 | Kid identification | **Resolved** — `familyMembers.memberType` separate from role; Kids' Schedule = child-attended events (decision 7) |
| PG 4 | Module config owner | **Resolved** — both layers: family master + per-user hide (decision 9) |
| PG 5 | Route vs default view | **Resolved** — separate route + toolbar link; defaultView opt-in later (decision 4) |
| PG 6 | Member strip status | **Resolved** — open-task count + today-attending dot (decision 10) |
| PG 7 | "Today" boundary | **Resolved** — user-zone `zonedNow`, same as existing loads (decision 12) |
| PG 8 | Empty states | **Resolved** — family modules hidden without a family (decision 11) |
| — | Nav placement | **Resolved** — calendar toolbar actions cluster (decision 4) |
| — | "day dashboards" | **Resolved** — per-day dashboards; today in P1, `?date=` later (decision 5) |
| — | Exclusions | Open (assumed): no ad events on dashboard; calendar verse strip retained; Top-3 may show <3 |

Still-open future specs (deliberately not in build scope): **Verse Vault** (saved verses), meals recurrence, member presence.

---

## Appendix — file:line evidence index

- Schema `tasks` (add priority): src/lib/server/db/schema.ts:404-427
- Schema `familyMembers` (role ladder; add memberType): schema.ts:210-224, esp. 219
- Permission ladder + whitelist: src/routes/(family)/family/[familyId]+page.server.ts:43,92
- Schema `eventAttendance` (RSVP → kid dot/kids' schedule): schema.ts:296-314
- Schema `userSettings` verse + defaultView: schema.ts:54-58, 66
- Calendar load gathers everything: src/routes/(calendar)/calendar/+page.server.ts:130-142 (dueTasks 117-125, verse 127-128, roster 89-97, events 131-133)
- Toolbar actions cluster (nav anchor): Calendar.svelte:237-271; verse strip 279-287
- Verse: DailyVerseCard.svelte:1; verseService.ts:139-160 (`getTodayVerse` 158)
- Tasks: getTasksForUser tasks.ts:97, getTasksForFamily 139, toggleTaskComplete 271, syncRecurringCursors 358
- Roster: getFamilyRoster families.ts:149, getUserFamilyId 140
- Stats/streak: getTaskStats taskStats.ts:29, computeWeeklyStreak streakService.ts:50, stats load stats/+page.server.ts:14-28
- Day view timeline blocks: src/lib/components/calendar/DayView.svelte:128-227
- Family tasks check-off + member naming: src/routes/(family)/family/[familyId]/tasks/+page.svelte:43-52, 101-113
- parseEvents/expandEventsForUser: src/lib/server/services/eventDisplayService.ts:5,30
- Account settings verse config: src/routes/(calendar)/account/+page.svelte:290-322
- Migration mechanics: see §5