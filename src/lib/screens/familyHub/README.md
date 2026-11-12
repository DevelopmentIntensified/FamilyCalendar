# familyHub

**screen** — The two family pages: `/family/[familyId]` (roster, members' roles and Member Types, Dashboard Module switches, the live invitation, plan usage and recent activity) and `/family/tasks` (the Family Task Board). It composes domain services and owns no tables.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md). Port sheet: [docs/rewrite/modules/familyHub.md](../../../../docs/rewrite/modules/familyHub.md).

## Purpose

- Owns the **family detail page** and its read model: family, roster, the viewer's role, Recent Activity, the family's Dashboard Module switches plus the viewer's own hides, the one live invitation, plan usage.
- Owns the **Family Task Board** page and its read model: the family's tasks, members' Public Tasks, the roster and the board's per-assignee grouping.
- Owns the **`GET /api/families/{id}/tasks`** endpoint — the board for one family, on the wire Android reads.
- Owns the **redirect** left by the deleted per-family board (`/family/{id}/tasks`): a bookmark lands on the approved board, never on a 404.
- Does **not** own: member/role/Member Type/invite/join/create writes (the `family` domain), task CRUD, grouping rules, cursors and tags (the `tasks` domain), Dashboard Module registry and visibility (the `dashboardModules` domain), plan limits and AI usage (the `billing` domain), identity (the `identity` domain), page chrome, toasts and primitives (the `shell` screen and `kernel`).

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: the two page models and the `/api` body type. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: page loads, the detail page's actions, the board endpoint and the legacy-path redirect. | — |
| [ui/index.ts](ui/index.ts) | entry | Public components: the two screen bodies. | — |
| [familyHub.http.db.test.ts](familyHub.http.db.test.ts) | golden | Pins `GET /api/families/{id}/tasks`: status, exact body, 401/404 answers and the two-family selection (#098). Runs against the real route, committed mode. | itself |

S3–S7 add the rules, contract, service, http wiring, state classes and components; the port sheet's `## Plan` lists every one with its role, and each joins this table in the commit that creates it (D2 keeps the table complete).

## Public interface

Everything other modules and routes may use, grouped by entry file. Nothing else is exported from this folder.

- `index.ts`:
  - `FamilyHubModel` — the detail page's one typed model: family, roster, viewer role, activity, module rows, live invite, plan usage. Components type their props from it.
  - `FamilyBoardModel` — the board page's model: chosen family, viewer, tasks, Public Tasks, roster, categories and the completed-window count.
  - `FamilyBoardResponse` — the wire body of `GET /api/families/{id}/tasks`, exactly `{tasks, publicTasks, familyRoster, taskCategories}`.
- `index.server.ts`:
  - `familyHubPageLoad` — `pageLoad` for `/family/[familyId]`; composes `FamilyHubModel` and answers `notFound('Family not found')` for a non-member and a missing family alike.
  - `familyHubActions` — the detail page's form actions in one object: `removeMember`, `updateRole`, `setMemberType`, `updateFamily`, `toggleDashboardModule`. One entry, five handlers, so the route stays `export const actions = familyHubActions;`.
  - `familyBoardPageLoad` — `pageLoad` for `/family/tasks`; picks the family (`?familyId=` else the oldest) and redirects to `/family` when the viewer has none.
  - `familyBoardEndpoint` — `endpoint` for `GET /api/families/{id}/tasks`; the board composition as JSON from the same service the page load uses. The wire keeps every row; the page's load passes the completed-window limit (see the sheet's Plan).
  - `legacyFamilyBoardPathLoad` — the redirect-only loader for `/family/[familyId]/tasks`: 302 to `/login` signed out, 308 to `/family/tasks` signed in.
- `ui/index.ts`:
  - `FamilyHubScreen` — the detail page body: hero, members band, activity, admin settings, admin invitations card, side rail. Takes `data`, `refresh` (`invalidateAll`) and `enhance`.
  - `FamilyBoardScreen` — the board page body: tabs, pending banner, assignee columns, Nobody card, completed list, Public Tasks list, on-demand editor.

Why so small: those five exports are the only things a route or a test needs; each is deleted only by moving the same composition into the route (forbidden by R8) or into another screen. Section components stay internal because nothing outside the screen lays them out — deleting one would move its markup into the screen unchanged. Rules, state classes and the service are internal for the same reason: their callers all live in this folder.

## How to test

- Whole module: `npm run test:mod -- familyHub` (add `--legacy` while the legacy files below still exist).
- HTTP contract: `familyHub.http.db.test.ts` — committed mode (`beforeEach(truncateAll)`), importing the route module, so it stays green before and after the port. Never edit a golden after S2 except for an answered owner question (playbook [characterize-endpoints.md](../../../../docs/rewrite/playbooks/characterize-endpoints.md)).
- Page loads and actions: `familyHub.service.db.test.ts` drives the service and the built `pageLoad`/`formAction` handlers with `testCtx({ db })`, `seedUser` and this module's own fixtures — page data is internal, so it gets no golden.
- Pure rules: `familyHub.detail.rules.test.ts` and `familyHub.board.rules.test.ts` — tables of input → expected output.
- State classes: `familyHub.detail.state.test.ts` and `familyHub.board.state.test.ts` — a fake api + `memoryToasts()`, no DOM.
- Components: `ui/MembersBand.svelte.test.ts`, `ui/FamilySettingsBand.svelte.test.ts`, `ui/SideRail.svelte.test.ts`, `ui/FamilyBoardScreen.svelte.test.ts` — what the user sees and which callback fired.
- Look and speed: `npm run visual:check -- familyHub`, `npm run perf:check -- familyHub` (K-10 / K-11).
- Needs Postgres for the db files: `docker start familycalendar-db`.

## Invariants

Behaviour that must not change, each with its evidence and the planned test that pins it (`file › test title`). Rules marked *(wire)* are visible to Android or TaskFocus and need the owner before they change.

1. *(wire)* `GET /api/families/{id}/tasks` answers `200` with exactly four keys — `tasks`, `publicTasks`, `familyRoster`, `taskCategories` — and no envelope — `src/routes/api/families/[id]/tasks/+server.ts:10-23` · `familyHub.http.db.test.ts › answers with that family's board and nothing else`.
2. *(wire)* Signed out it is `401 {"error":"Unauthorized"}`; a missing family and a family the viewer is not a member of are the **same** `404 {"error":"Family not found"}`, never a fallback board — `src/routes/api/families/[id]/tasks/+server.ts:11-21` · `src/lib/server/services/familyData.ts:406-420` · `familyHub.http.db.test.ts › answers 401 {"error":"Unauthorized"} when signed out`; `familyHub.http.db.test.ts › 404 for a non-member — the same answer as a missing family`.
3. *(wire)* The id addresses that family and nothing else: the API never falls back to the oldest (the page does) — `src/routes/api/families/[id]/tasks/+server.ts:16-19` vs `src/routes/(family)/family/tasks/+page.server.ts:5-17` · `familyHub.http.db.test.ts › reads the family named by the id, never the oldest (#098)`.
4. *(wire)* `tasks` is every non-archived Family Task of that family with assignee/creator first names and tags attached; `publicTasks` is the Public Tasks of **current** members (personal rows, `visibility = 'public'`), so another member's private personal Task never appears — `src/lib/server/db/actions/tasks/queries.ts:82-119,203-227` · `familyHub.http.db.test.ts › answers with that family's board and nothing else`.
5. *(wire)* A roster row is `userId, firstName, lastName, email, role, memberType`; `role` is the permission and `memberType` the profile label — `src/lib/server/db/actions/families.ts:272-294` · `familyHub.http.db.test.ts › answers with that family's board and nothing else`.
6. *(wire)* `taskCategories` is the **viewer's own** category list, name-sorted, as `{id, name}`; another member's list never leaks in, and a failed read yields `[]` rather than an error — `src/lib/server/db/actions/taskCategories.ts:143-163` · `familyHub.http.db.test.ts › answers with that family's board and nothing else`.
7. The detail loader is unreachable by id for a non-member **and** for a missing family, both `404 Family not found`; only an unexpected fault becomes `500 Could not load this family` (thrown redirects/404s are re-thrown, not swallowed) — `src/routes/(family)/family/[familyId]/+page.server.ts:26-41` · `src/lib/server/services/familyData.ts:172-181` · `familyHub.service.db.test.ts › a non-member and a missing family get the same notFound`.
8. The detail payload is one model: family, full roster, viewer role defaulted to `'member'`, activity, family module switches, the viewer's own hidden modules, the single live invitation and plan usage — `src/lib/server/services/familyData.ts:172-231` · `familyHub.service.db.test.ts › composes the detail model from the domains`.
9. "Active invitation" means unexpired **and** under `maxUses`; an expired or exhausted code is not an invitation and no code at all is reported as none; `inviteCreatedBy` is the minting member's first name — `src/lib/server/services/familyData.ts:147-158,183-220` · `familyHub.detail.rules.test.ts › an expired or used-up code is not an invitation`.
10. Recent Activity is two reads merged and re-sorted newest-first, cut to 8: `completed` items (actor = assignee else creator, no target) and `assigned` items (only `assignmentStatus = 'accepted'`, assignee ≠ creator, actor = creator, target = assignee) — `src/lib/server/db/actions/familyActivity.ts:25-90` · `familyHub.service.db.test.ts › recent activity is two reads merged newest-first and cut to eight`.
11. Every detail action goes through the auth guard: an unauthenticated POST answers `fail(401, {success:false, error:'Not signed in'})` and writes nothing; a success is `{success:true}`; a refusal is `fail(status, {error})` with the service's own message — `src/routes/(family)/family/[familyId]/+page.server.ts:52-118` · `familyHub.service.db.test.ts › unauthenticated POSTs write nothing`.
12. Role rules inside those actions: removing and renaming need admin+, the family creator cannot be removed and its role cannot change, nobody changes their own role, only the creator promotes to `creator`; Member Type is admin-only and `parent|child|member`; an empty name/colour means unchanged; a module switch needs admin+ and a family-scoped id — `src/lib/server/services/familyData.ts:259-368` · `familyHub.service.db.test.ts › role and Member Type refusals keep the legacy messages`.
13. `/family/{id}/tasks` is not a second board: signed in it `308` redirects to `/family/tasks`, signed out it `302`s to `/login`, and no page renders there — `src/routes/(family)/family/[familyId]/tasks/+page.server.ts:18-25` · `familyHub.service.db.test.ts › the old per-family path redirects to the approved board`.
14. `/family/tasks` picks `?familyId=` when the viewer belongs to it, otherwise the **oldest** family; no family at all `302`s to `/family`, no session `302`s to `/login` — `src/routes/(family)/family/tasks/+page.server.ts:5-17` · `familyHub.service.db.test.ts › falls back to the oldest when the named family is not the user's`.
15. The board groups by assignee (viewer first, then name; urgency inside a column), gives unassigned Tasks their own **Nobody** card, never double-counts one Task between a column and Nobody, and renders no empty column — `src/lib/utils/familyTaskGroups.ts:28-57` · `src/routes/(family)/family/tasks/+page.svelte:88-107` · `familyHub.board.rules.test.ts › unassigned Tasks are the Nobody card only`.
16. The board keeps both scopes as tabs (`Family tasks`, `Public tasks (N)`), the Public tab is read-only, and the page keeps its states and copy: the pending banner "N tasks waiting for your response below.", "No family tasks yet", "All caught up 🎉", "No tasks match #x", "No public tasks yet", the Nobody explanation, and the 1/2/3/4-column card layout with open counts in the headings — `src/routes/(family)/family/tasks/+page.svelte:219-300,305-430` · `familyHub.board.rules.test.ts › the empty state says which kind of empty it is`.
17. Editing a Task stays owner-only and reuses the shared save: on success the dialog closes and a toast says `Saved "<title>"`; on refusal the dialog stays open and the toast carries the failure — `src/routes/(family)/family/tasks/+page.svelte:167-203` · `familyHub.board.state.test.ts › toasts the failure and keeps the dialog open`.
18. Accept/Decline and complete/advance each acknowledge first (pending row) and then report the outcome — a toast for Accept/Decline/delete, the shared recurring-task feedback for complete/advance; Accept moves the Task to the viewer's list, Decline returns it to the assigner — `src/routes/(family)/family/tasks/+page.svelte:123-165` · `familyHub.board.state.test.ts › accept announces the move`.
19. Detail page copy and gates: hero shows the family initial on its colour, the name, "N members · You: {role}"; admins get "Add member" and the settings gear; the members band header reads "N of {memberLimit}" with Family Tasks and Groceries links; rows carry avatar, name, email, role pill, a Member Type select for admins (a pill otherwise), Edit/Remove gated to other members only, an inline "Remove? Yes/No", a mobile kebab sheet, and a full-width "+ Add a member" — `src/routes/(family)/family/[familyId]/+page.svelte:289-355,360-586` · `ui/MembersBand.svelte.test.ts › gates Edit and Remove to other members only`.
20. Settings band (admins only, inline — no toggle): name field, the six named swatches plus the free colour input, "Colour tints the calendar, the members and the family calendar chip.", Save Changes/"Saving…", and the Day Dashboard Modules list; the name/colour fields re-seed only when the server's `id|name|color` changes, so an unrelated reload never clobbers a half-typed name; `form.error` shows as an alert banner — `src/routes/(family)/family/[familyId]/+page.svelte:78-92,618-700` · `familyHub.detail.rules.test.ts › a reload with the same family keeps the half-typed name`.
21. Module rows acknowledge in the same tick (optimistic flip), dim while in flight, settle on the server's truth, and revert with a toast when the server refuses — `src/routes/(family)/family/[familyId]/+page.svelte:188-235,682-700` · `familyHub.detail.state.test.ts › a refused switch reverts and explains`.
22. The side rail is visible to every member (not admin-gated): "Shared data" (Family tasks, Grocery list, Family calendar, Invitations "Manage codes"), "Active invitation" (Code, Uses "N of M or ∞", Expires, Created by), "Plan" (tier or "No plan", AI events `{used}/{limit}`, Families, Members, Archive days, Export enabled/not on this plan), "Children are users" with its link; admins additionally get an "Invitations" card linking `/family/invitations` — `src/routes/(family)/family/[familyId]/+page.svelte:708-782,796-960` · `ui/SideRail.svelte.test.ts › says "No plan" rather than naming a tier the user does not have`.
23. Recent Activity copy: `✅ {actor} completed '{title}'` / `📋 {actor} assigned '{title}' to {target}` with relative time, and the empty state "No activity yet — complete something to get things moving." — `src/routes/(family)/family/[familyId]/+page.svelte:589-616` · `familyHub.detail.rules.test.ts › labels a completion and an assignment`.

**After M-tasks:** the Family Task Board must not show another member's private Task once `tasks` lands [Q-005a](../../../../docs/rewrite/questions.md) (owner, 2026-11-11): both family reads hide a private Task from everyone except its owner and, while assigned, its assignee. This screen never filters visibility itself — it renders whatever `tasks` returns, so it inherits the fix and must not add a second filter.

## Depends on

- May import: `kernel` (isomorphic and server entries) and **any domain's public entries**; never another screen (rule R1).
- Owns tables: none.
- Reads (join only): none — the screen holds no SQL; every read is a domain service.
- Calls (ports #1–#19 run before this one, so these names are the owning modules' S1 designs; the S9 pass matches them):
  - `identity` — the viewer's display name and settings row (`hiddenDashboardModules` lives here if `dashboardModules` only composes it).
  - `billing` — `getPlanUsage` / subscription limits and AI usage for the Plan band; the member limit in the members band header.
  - `family` — the family + viewer membership + roster read, `getActiveInvite`, the `pickActiveInvite` rule, and the member use-cases behind the five form actions, plus `isFamilyAdmin`/`canEditRole`/`canRemove`/`displayName` rules.
  - `dashboardModules` — the canonical module list, family-scoped modules, switches + the viewer's hides, `moduleRowState`/`moduleToggleValue`, and the `DashboardModuleRow` component (the settings band reuses it; it is not rebuilt here).
  - `tasks` — the board read (`getTasksForFamily` + `getPublicTasksForFamily` semantics), `listRecentFamilyActivity`, the board grouping rule (`groupFamilyBoard`: columns + Nobody split), `matchesTagFilter`, the task api client and the task UI components (rows, tag filter, completed list, edit dialog).
- Called by: the `shell` routes `/family/[familyId]`, `/family/[familyId]/tasks`, `/family/tasks` and `src/routes/api/families/[id]/tasks/+server.ts` — all wiring only.
