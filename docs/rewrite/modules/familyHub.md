# Port sheet: familyHub

**screen** · port #20 · home: `src/lib/screens/familyHub/` · README after the port: `src/lib/screens/familyHub/README.md` (written in S1)

The family detail page: roster + family tasks + dashboard module switches + recent activity.

- **May import:** kernel + any domain (public entries); never another screen.
- **Owns tables:** none.
- **Must be ported first:** identity, billing, family, dashboardModules, tasks (from the legacy import graph; see the ledger).
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

- Roster, family tasks, module switches and recent activity on one page; every edit role-checked.
- Family Task Board groups by assignee, falling back to the creator.
- `GET /api/families/[id]/tasks` shape (Android).
- After M-tasks ([Q-005a](../questions.md), owner 2026-11-11): the Family Task Board must not show another member's private Task. Both family reads hide a private Task from everyone except its owner and, while it is assigned, its assignee. This screen renders what `tasks` returns and must not add its own visibility filter.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/families/{id}/tasks` | GET | member of `{id}` | none; `{id}` must be the family actually chosen (no fallback) | 200 `{tasks, publicTasks, familyRoster, taskCategories}` (the `/family/tasks` board for that family) | 401 `Unauthorized`; 404 `Family not found` (non-member, missing family, or a family that is not the one the loader chose) | `src/routes/api/families/[id]/tasks/+server.ts:10-23`; `src/lib/server/services/familyData.ts:406-420` |

### Rules the module must keep
- The family detail loader is unreachable by id for a non-member **and** for a missing family, and both are the same answer (`null` → `404 Family not found`); no other error is swallowed into a broken page — `src/lib/server/services/familyData.ts:172-181` · `src/routes/(family)/family/[familyId]/+page.server.ts:26-41` · test: `src/routes/api/families/[id]/server.test.ts` › "404 for a non-member (same answer as a missing family)"
- Detail payload is one read: family, full roster (userId, first/last, email, role, memberType), viewer role defaulted to `'member'`, recent activity, family module switches, the viewer's own hidden modules, the single live invite (plus minting member's first name) and plan usage — `src/lib/server/services/familyData.ts:172-231`
- "Active invitation" means unexpired **and** under `maxUses`; an expired or exhausted code is not an invitation, and no code at all is reported as none — `src/lib/server/services/familyData.ts:147-158` · test: `src/routes/(family)/family/page.server.test.ts` › "does not present an expired or used-up code as an invitation"
- Recent activity is two reads merged and re-sorted newest-first, then cut to 8: `completed` items (any completed Family Task, actor = assignee else creator) and `assigned` items (only `assignmentStatus = 'accepted'`, assignee ≠ creator; actor = creator, target = assignee) — `src/lib/server/db/actions/familyActivity.ts:25-90`
- Every detail-page action goes through `requireUserAction` (unauthenticated POST → `fail(401,{success:false,error:'Not signed in'})`) and maps the service union onto `{success:true}` or `fail(status,{error})`; actions are `removeMember`, `updateRole`, `setMemberType`, `updateFamily`, `toggleDashboardModule` — `src/routes/(family)/family/[familyId]/+page.server.ts:52-118` · test: `src/routes/(family)/family/[familyId]/page.server.test.ts` › "unauthenticated POSTs write nothing"
- `/family/{id}/tasks` is not a second board: signed in it `308` redirects to `/family/tasks`, signed out it `302`s to `/login` — `src/routes/(family)/family/[familyId]/tasks/+page.server.ts:18-25` · test: `src/routes/(family)/family/[familyId]/tasks/page.server.test.ts` › "redirects the old per-family path to the approved board"
- `/family/tasks` picks the family by `?familyId=` when the viewer belongs to it, otherwise the **oldest** family; no family at all `302` redirects to `/family`; no session `302` redirects to `/login` — `src/routes/(family)/family/tasks/+page.server.ts:5-17` · test: `src/routes/(family)/family/tasks/page.server.test.ts` › "falls back to the oldest when the named family is not the user's"
- The board payload adds the viewer's own task-category options for the editor and both task lists already carry their cursors — `src/lib/server/services/familyData.ts:406-420`
- Board grouping lives in one shared helper: one column per assignee, viewer-first then name, urgency (overdue → today → next) inside a column; the helper's creator fallback is used by the dashboard card, while `/family/tasks` passes only assigned Tasks and gives unassigned ones a separate "Nobody" card — `src/lib/utils/familyTaskGroups.ts:28-57` · `src/routes/(family)/family/tasks/+page.svelte:71-107` · test: `src/routes/(family)/family/tasks/page.svelte.test.ts` › "gives unassigned Tasks a home of their own — the approved "Nobody" card"
- An empty column does not render ("a heading about nothing"); a task is never double-counted between an assignee column and Nobody — `src/lib/utils/familyTaskGroups.ts:40-52` · `src/routes/(family)/family/tasks/+page.svelte:100-107` · test: `src/routes/(family)/family/tasks/page.svelte.test.ts` › "does not double-count: an unassigned Task is in the Nobody card only"
- The board keeps both task scopes as tabs (`Family`, `Public`); the Public tab lists other members' public personal tasks read-only (no complete/accept/decline/edit/delete) — `src/routes/(family)/family/tasks/+page.svelte:55-56,227-253,387-430` · test: `src/routes/(family)/family/tasks/page.svelte.test.ts` › "keeps the waiting-for-your-response banner and the two tabs"
- Pending handoffs waiting for the viewer are counted above the board ("N tasks waiting for your response below"); Accept moves the task to the viewer's list, Decline returns it to the assigner, both announced by toast — `src/routes/(family)/family/tasks/+page.svelte:62-64,150-160,219-224`
- Edits stay owner-only and reuse the shared save: toast `Saved "<title>"` and close on success, toast the failure and keep the dialog open on refusal — `src/routes/(family)/family/tasks/+page.svelte:169-190` · test: `src/routes/(family)/family/tasks/page.svelte.test.ts` › "toasts the failure and keeps the dialog open"

### Page and UI behaviour worth keeping
- Detail hero: family initial on the family colour with a blurred colour glow, name, "N members · You: {role pill}"; admins get "Add member" and a gear that jumps to settings — `src/routes/(family)/family/[familyId]/+page.svelte:289-355`
- Members band: header count "N of {memberLimit}", Family Tasks and Groceries links, admin "Add member"; rows show avatar, name, email, role pill, a member-type select for admins (a pill for everyone else), Edit/Remove gated by `canEditRole`/`canRemove`, inline "Remove? Yes/No" confirm, mobile kebab action sheet, and a full-width "+ Add a member" under the list — `src/routes/(family)/family/[familyId]/+page.svelte:360-400,405-560,575-586` · test: `src/routes/(family)/family/[familyId]/page.svelte.test.ts` › "gates Edit and Remove to other members only (never on self)"
- Recent Activity card: "✅/📋 {actor} completed/assigned '{title}' to {target}" with relative time; empty state "No activity yet — complete something to get things moving." — `src/routes/(family)/family/[familyId]/+page.svelte:589-614`
- Family Settings (admins only, inline — no toggle): name field, six named swatches plus the free colour input, "Colour tints the calendar, the members and the family calendar chip.", Save Changes with "Saving…", and the Day Dashboard Modules list — `src/routes/(family)/family/[familyId]/+page.svelte:618-700`
- Colour/module fields re-seed only when the server's `id|name|color` changes, so an unrelated reload never clobbers a half-typed name — `src/routes/(family)/family/[familyId]/+page.svelte:78-92`
- Module rows acknowledge in the same tick (optimistic flip), dim while in flight, and settle on the server's truth — `src/routes/(family)/family/[familyId]/+page.svelte:188-215,682-700`
- Settings card failure surfaces `form.error` as an alert banner; every successful action re-reads `data` so removed members, new names and changed roles appear — `src/routes/(family)/family/[familyId]/+page.svelte:29-30` · test: `src/routes/(family)/family/[familyId]/page.svelte.test.ts` › "re-gates the admin controls when the viewer role changes"
- Side rail, visible to every member (not admin-gated): "Shared data" (Family tasks, Grocery list, Family calendar, Invitations → Manage codes), "Active invitation" (Code, Uses "N of M or ∞", Expires, Created by), "Plan" (tier or "No plan", AI events bar `{used}/{limit}`, Families, Members, Archive days, Export enabled/not on this plan), and "Children are users" with a link onward — `src/routes/(family)/family/[familyId]/+page.svelte:796-827,830-866,880-930,932-960` · test: `src/routes/(family)/family/[familyId]/page.svelte.test.ts` › "says "no plan" rather than naming a tier the user does not have"
- Admins also get an "Invitations" card linking to `/family/invitations` — `src/routes/(family)/family/[familyId]/+page.svelte:708-782`
- Board page: one card per assignee (1/2/3/4 columns by width), big plain person headings with open-task counts, overdue task first in its column, blushed "Nobody" card explaining "Nobody is on the hook for these…", "No family tasks yet" and "All caught up 🎉" empty states, tag filter with its own no-match message — `src/routes/(family)/family/tasks/+page.svelte:255-300,305-385` · test: `src/routes/(family)/family/tasks/page.svelte.test.ts` › "puts the overdue task at the top of its column, before the ones that are not"

### Probably accidental (candidates to drop, owner to confirm)
- The detail page still falls back to `'#3b82f6'` for the seeded colour field, the hero wash and the hero glow, although the palette retired that blue in favour of terracotta — `src/routes/(family)/family/[familyId]/+page.svelte:77,87,295,302` — stale default that disagrees with the palette
- Completed-activity `actorName` is the task's assignee (else creator), not whoever completed it, so a completion by another member is credited to the wrong person — `src/lib/server/db/actions/familyActivity.ts:69-77` — no `completedBy` fact is read
- The "assigned" half of Recent Activity only includes `accepted` assignments, so a pending handoff — the event a reader most needs — never appears in the feed — `src/lib/server/db/actions/familyActivity.ts:57-66` — filter looks like an oversight (UNSURE)
- `planUsage` coerces a missing limit to `0` (`?? 0`), so the rail can print "3 of 0" for an unsubscribed or partially configured account — `src/lib/server/services/familyData.ts:220-231` — a limit that is unknown is rendered as none
- The admin "Invitations" card and the rail's "Shared data → Invitations" entry both link to the same page from the same screen — `src/routes/(family)/family/[familyId]/+page.svelte:708-782` vs `:820-827` — duplicated door
- The old per-family board route keeps a loader whose only job is two redirects, and census still lists `+page.svelte` for it though none exists — `src/routes/(family)/family/[familyId]/tasks/+page.server.ts:18-25` — vestigial route
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#098](../../archive/issues/098-first-family-is-a-guess.md) Duplicate family-tasks route crashes; two-family API tests. | BEHAVIOUR | keep URLs; add two-family goldens during the family/familyHub ports |

## Plan

### Design

One folder, two pages, one endpoint, one redirect loader. The screen owns **composition only**: no tables, no repo, no SQL (rule R3). Its service calls the `family`, `billing`, `dashboardModules`, `tasks` and `identity` domains through their `index.server.ts`, and its http file turns those compositions into the page loads, the five form actions and the JSON twin. Everything the page shows is one typed model (`FamilyHubModel` / `FamilyBoardModel`) so components type their props from it instead of hand-mirroring wire shapes.

Public interface (details and deletion-test justifications in the README):

- `index.ts` — `FamilyHubModel`, `FamilyBoardModel`, `FamilyBoardResponse`.
- `index.server.ts` — `familyHubPageLoad`, `familyHubActions` (5 named handlers in one object), `familyBoardPageLoad`, `familyBoardEndpoint`, `legacyFamilyBoardPathLoad`.
- `ui/index.ts` — `FamilyHubScreen`, `FamilyBoardScreen`.

### New files

The two fat legacy pages are split the way [port-ui.md › Fat pages](../../playbooks/port-ui.md#fat-pages) prescribes: pure rules first (`familyHub.detail.rules.ts`, `familyHub.board.rules.ts`), then one state class per page, then one component per visual section, then a screen that is layout only. `family/[familyId]/+page.svelte` (1,090 lines) yields `FamilyHubScreen` plus the `ui/` section components below; `family/tasks/+page.svelte` yields `FamilyBoardScreen` plus `BoardColumn`/`NobodyCard` and `tasks`' own rows and dialog.

| file | role | contents |
|---|---|---|
| `familyHub.contract.ts` | contract | `FamilyBoardResponse` (tasks/family/category schemas taken from the owning domains' contracts), and the five form schemas: `RemoveMemberForm {userId}`, `UpdateRoleForm {userId, role}`, `SetMemberTypeForm {userId, memberType}`, `UpdateFamilyForm {name?, color?}` (both may be empty = unchanged), `ToggleModuleForm {module, enabled: 'true' or 'false'}`. |
| `familyHub.detail.rules.ts` | rules | `seedFamilySettings(previousKey, family, current)` (re-seed only when `id\|name\|color` changes; colour fallback is the palette default), `inviteUsesLabel(invite)`, `aiUsagePercent(used, limit)` (0 when the limit is 0), `activityLine(item)` (the ✅/📋 copy). |
| `familyHub.board.rules.ts` | rules | `boardEmptyState({open, completed, publicCount, tagFilter})` → which of the five empty states shows, `pendingForViewer(tasks, viewerId)`, `publicTabLabel(count)`. Grouping itself is `tasks`' rule: this screen calls `groupFamilyBoard(open, nameFor, viewerId)` and renders `{columns, unassigned}`. |
| `familyHub.service.server.ts` | service | `loadFamilyHub(ctx, actor, {familyId})` → `FamilyHubModel`, `notFound('Family not found')` for a non-member and a missing family; `loadFamilyBoard(ctx, actor, {familyId, completedLimit})` → `FamilyBoardModel` (chosen family, `notFound`/`null` rules as today). Reads run in parallel, bounded and with no writes. |
| `familyHub.http.server.ts` | http | `familyHubPageLoad` (`pageLoad` auth `user`), `familyHubActions` (`formAction` × 5, auth `user`, mapping `AppError` onto the legacy `fail(status,{error})` contract), `familyBoardPageLoad` (redirects `/family` when no family), `familyBoardEndpoint` (`endpoint` auth `user`, params `{id}`, 404 `Family not found`, body `{tasks,publicTasks,familyRoster,taskCategories}`), `legacyFamilyBoardPathLoad` (302 `/login`, else 308 `/family/tasks`). |
| `familyHub.detail.state.svelte.ts` | state | `FamilyHubState`: remove confirm, editing role, sheet member, per-member pending flags, saving flag, name/colour inputs + seed key, module optimistic map + pending id; methods `seed`, `begin*`/`settle*` per action, `flipModule`/`settleModule`, toasts in the constructor. No `$effect`. |
| `familyHub.board.state.svelte.ts` | state | `FamilyBoardState`: tab, tag filter, busy id, editing task, saving flag, confirm-delete id; `toggle`, `advance`, `respond(accept)`, `openEdit`, `saveEdit`, `remove` through the `tasks` api client + toasts, rollback and pending flags. |
| `ui/FamilyHubScreen.svelte` | screen | Layout only: hero, main column (members, activity, settings, invitations), side rail; builds `FamilyHubState` from `data`, passes `refresh`/`enhance`. |
| `ui/FamilyHero.svelte` | ui | Family initial on its colour + blurred glow, name, "N members · You: role", admin Add member + settings gear (scrolls to the band). |
| `ui/MembersBand.svelte` | ui | Header ("Members", "N of {memberLimit}", Family Tasks/Groceries links, admin Add member), the list and the full-width "+ Add a member". |
| `ui/MemberRow.svelte` | ui | One roster row: avatar, display name, email, role pill/inline role editor, Member Type select (admins) or pill, Edit, Remove with inline "Remove? Yes/No", mobile kebab. Callbacks in, no fetching. |
| `ui/RecentActivityCard.svelte` | ui | The feed: one line per item from `activityLine` + `relativeTime`, and the empty state. |
| `ui/FamilySettingsBand.svelte` | ui | Name field, six named swatches + colour input, the colour copy, Save Changes/"Saving…", the Day Dashboard Modules list (reuses `dashboardModules`' `DashboardModuleRow`), and the `form.error` banner. |
| `ui/InvitationsCard.svelte` | ui | Admin-only card: Manage invitations, Add member. |
| `ui/SideRail.svelte` | ui | The rail's four bands in order: Shared data (four links), Active invitation, Plan, Children are users. |
| `ui/InviteBand.svelte` | ui | Code, Uses "N of M or ∞", Expires, Created by, the "send this link" / "get a join link" affordances, and the none state. |
| `ui/PlanBand.svelte` | ui | Tier pill or "No plan", AI events bar `{used}/{limit}`, Families, Members, Archive days, Export. |
| `ui/FamilyBoardScreen.svelte` | ui | Board page body: heading + My tasks link, pending banner, tabs, tag filter, column grid, Nobody card, completed list, Public Tasks list; dynamic `import()`s the edit dialog on first edit. |
| `ui/BoardColumn.svelte` | ui | One assignee card: avatar + name + open count, tasks in urgency order (row component from `tasks`' ui). |
| `ui/NobodyCard.svelte` | ui | The blush-washed unassigned card with its explanation. |
| `familyHub.detail.rules.test.ts` | test | Tables: seed key, invite label, AI percent, activity copy. |
| `familyHub.board.rules.test.ts` | test | Tables: empty states, pending count, public tab label. |
| `familyHub.service.db.test.ts` | test | Every invariant with IO: 404 parity, detail composition, active invite, activity merge/cut, role refusals and messages, the two redirects and the family selection. |
| `familyHub.detail.state.test.ts` / `familyHub.board.state.test.ts` | test | State classes with a fake api + `memoryToasts()`, no DOM. |
| `ui/MembersBand.svelte.test.ts`, `ui/FamilySettingsBand.svelte.test.ts`, `ui/SideRail.svelte.test.ts`, `ui/FamilyBoardScreen.svelte.test.ts` | test | What renders and which callback fires. |

Legacy exports that die or move (each destination is a v2 module; nothing new is written under `src/lib/server` or `src/lib/utils`):

| legacy symbol | destination |
|---|---|
| `familyData.loadFamilyDetail` | split: `familyHub.service.loadFamilyHub` composes; the sub-reads become `family`/`billing`/`dashboardModules`/`identity` services. |
| `familyData.loadFamilyTasks` | split: `familyHub.service.loadFamilyBoard` composes `tasks`' family/public reads, roster and categories. |
| `familyData.pickActiveInvite` | `family` rules, now taking `now` as a parameter (R5). |
| `familyData.getMemberRole`, `roleRank`, `PRIVILEGE`, `requireMinRole`, `FamilyResult`, `refuse` | `family` service/rules; refusals become `AppError` with the same messages. |
| `familyData.removeMember`, `updateMemberRole`, `setMemberType`, `updateFamilyDetails` | `family` service use-cases; the screen's actions call them. |
| `familyData.toggleDashboardModule` | `dashboardModules` service; the screen's action calls it. |
| `familyData.firstNameOf`, `fullName` | die — `identity`'s `displayName` already answers both. |
| `familyData.loadFamiliesOverview`, `loadInvitations`, `createFamilyWithMembers`, `cleanMemberIds`, `CreateFamilyInput`, `CreateFamilyResult` | `family` http/service (the `/family`, `/family/invitations` and `/family/create` pages are not this screen). |
| `familyActivity.getRecentFamilyActivity`, `FamilyActivityItem` | `tasks` service `listRecentFamilyActivity` (it reads task rows); `toIso` folds into `kernel/time`, `fullName` into `identity`'s `displayName`. |
| `$lib/utils/familyTaskGroups` | `tasks` rules (`groupFamilyBoard`, with the Nobody split as an option), because the Day Dashboard card uses it too. |
| `$lib/utils/familyDisplay`, `$lib/utils/familyPalette`, `$lib/utils/moduleRowState`, `$lib/utils/avatarColor` | `family` / `dashboardModules` rules and `kernel/ui` `colorHash`. |
| `$lib/client/toasts`, `$lib/utils/dateUtils.relativeTime`, `$lib/utils/focusTrap`, `Breadcrumbs` | `kernel/client` toasts, `kernel/time`, `kernel/ui` `Sheet`, `shell` ui. |
| `src/routes/(family)/family/[familyId]/+page.svelte` (1090 lines) | deleted; its logic is in `familyHub.detail.rules.ts` + `FamilyHubState` + the `ui/` components; the route keeps `+page.server.ts` and a ≤25-line `+page.svelte`. |
| `src/routes/(family)/family/tasks/+page.svelte` | deleted; its logic is in `familyHub.board.rules.ts` + `FamilyBoardState` + `FamilyBoardScreen`; the rows, tag filter, completed list and edit dialog come from `tasks`' ui. |

### Performance (ADR 0010)

**`/family/[familyId]`** — above the fold at 390 px is the hero (name, member count, viewer role) and the members band. Load plan: one membership+family read (the 404 gate), then roster and the billing member limit in parallel — three queries before anything renders. Streamed as promises with skeletons: Recent Activity (two queries), the rail (active invite — one code, not the list; plan tier + AI usage; families count) and the settings band's module rows (family switches + the viewer's hides). Legacy costs: `loadFamilyDetail` awaits membership, family, roster, activity, switches and settings **sequentially** (6 round trips) and only then runs five more in parallel; `getFamilyInviteCodes` reads every code to use one; the page renders nothing until all of it lands. No N+1: the roster is one read for the whole band; activity is already cut to 8.

**`/family/tasks`** — above the fold is the heading, the pending banner, the two tabs and the first column(s). Load plan: memberships + chosen family (one read), then the family tasks, Public Tasks and roster in parallel; the editor's category list is **not** loaded with the page — the dialog asks `tasks`' api on first open. The completed list is windowed: the page asks for the newest 50 completed rows plus their true total, while the endpoint keeps today's unbounded body (the wire must not shrink). Grouping runs once over the open set through `tasks`' rule, never per cell; column names come from a `Map` built once from the roster. Legacy costs: two sequential awaits, then four parallel reads where each task read runs `syncRecurringCursors` (a **write** in the read path) and then `attachTags` (a second query) — up to eight queries; every completed row is returned and rendered; `EditTaskDialog` (291 lines) is imported statically even when nobody edits; `TaskTagFilter`, the row components and the completed list are all static.

Deliberate changes to log at S7 (visual baseline + Notes): the colourless-family fallback becomes the palette default instead of the retired blue; the completed list is windowed with the true count in its heading; the editor's categories arrive when it opens.

## Notes

### S1 verification

- Every inventory line used in the README was checked against the cited code on 2026-11-11. Three refinements: (a) the board's per-column order is `compareUrgency` from `familyTaskGroups.ts:46-48` and then a stable overdue-first re-sort (`family/tasks/+page.svelte:114-121,306`) — the second pass is redundant but harmless, so it is dropped rather than pinned; (b) the census lists `src/routes/(family)/family/[familyId]/tasks/+page.svelte`, which does not exist (only `+page.server.ts`); the route really is redirect-only; (c) `getRecentFamilyActivity` filters `assignmentStatus = 'accepted'` and `assignedTo ≠ userId` (`familyActivity.ts:57-66`), so a pending handoff never reaches the feed — the inventory's "UNSURE" stands.
- The detail loader is 6 sequential reads then 5 parallel (`familyData.ts:172-201`), and `/family/tasks` runs `syncRecurringCursors` inside a read (`tasks/queries.ts:84,208`). Both are the main cost items recorded in the Plan.
- `pickActiveInvite` and the invite read live in the family service today; the screen must not decide "active" itself after the port (one home).

### Goldens

- `familyHub.http.db.test.ts` (S2) pins `GET /api/families/{id}/tasks`: the exact four-key 200 body (with a family Task + tag, a public personal Task, a private personal Task that must stay out, and the viewer's categories), 401, 404 parity for non-member/missing family, the two-family selection (#098) and GET idempotence.
- Carry-over ticket [#098](../../archive/issues/098-first-family-is-a-guess.md) asked for two-family API tests; the "reads the family named by the id, never the oldest (#098)" golden covers this route. No behaviour fix is needed on this route — it already refuses to fall back.

### Probably accidental — dispositions

| item | disposition |
|---|---|
| `#3b82f6` fallback for a colourless family (`+page.svelte:77,87,295,302`) while the palette retired that blue (`familyPalette.ts:1-12`) | **drop** — use `DEFAULT_FAMILY_COLOR` (terracotta). Visible only for a family whose colour is null; logged as an intentional S7 difference and an owner question below. |
| Completed activity credits the assignee (else creator), not whoever completed it (`familyActivity.ts:69-77`) | **keep** — there is no `completedBy` fact in the schema; fixing it is DDL, not rewrite work. Pinned as invariant 10 + owner question. |
| The "assigned" half includes only `accepted` handoffs (`familyActivity.ts:57-66`) | **keep** and pin — the feed's shape is wire-visible through `GET /api/families/{id}`; owner question below. |
| `planUsage` coerces a missing limit to `0`, so the rail can read "3 of 0" (`familyData.ts:220-231`) | **keep** and pin — same wire, owner question below. |
| Admin "Invitations" card and the rail's Shared data → Invitations are two doors (`+page.svelte:708-782` vs `:820-827`) | **keep both** — the approved page has both; owner question below. |
| The old per-family board loader (`/family/[familyId]/tasks`) | **keep the two redirects** (bookmarks must not 404) but rewrite as `legacyFamilyBoardPathLoad`; the route file keeps only wiring. No page returns. |

### Questions for the owner

1. **Colour fallback for a family with no colour.** Context: the detail page falls back to `#3b82f6`, which the palette retired in favour of terracotta (`src/lib/utils/familyPalette.ts:1-12`). Options: A) fall back to `DEFAULT_FAMILY_COLOR`; B) keep the blue until a data migration sets every colour. Recommendation: **A** — the retired blue is an unapproved colour and families are created with a palette colour since #099, so the fallback is rarely seen.
2. **Recent Activity credits the wrong person on a completion.** Context: `familyActivity.ts:69-77` names the assignee (else creator); no column records who checked it off. Options: A) keep and document; B) add a `completedBy` column (schema change, separate ticket) and credit the completer. Recommendation: **A** for this rewrite; B if the feed's accuracy matters more than the DDL freeze.
3. **Pending handoffs never appear in Recent Activity.** Context: only `assignmentStatus = 'accepted'` rows are read (`familyActivity.ts:57-66`), so the event a reader most needs is missing. Options: A) keep today's feed and pin it; B) add pending handoffs as a third kind (wire-visible on `GET /api/families/{id}`). Recommendation: **A** now, B as a follow-up with Android in the loop.
4. **A missing plan limit renders as `0`.** Context: `familyData.ts:220-231` uses `?? 0` for `familyLimit`, `memberLimit`, `archivedRetentionDays` and `aiLimit`. Options: A) keep `0` (pin); B) send `null` for "unknown" and render "—" / "∞" (wire change on `GET /api/families/{id}`). Recommendation: **A**.
5. **Two doors to Invitations.** Context: the admin card and the rail link both point at `/family/invitations` on the same screen. Options: A) keep both (approved layout); B) drop the admin card and keep the rail. Recommendation: **A** — dropping one changes an approved page and needs a new visual baseline.
6. **Bounding the completed list.** Context: the board renders every completed Task (`FamilyCompletedTaskList.svelte` has no cap); a long-lived family accumulates thousands. Options: A) page load asks for the newest 50 + the true count, endpoint unchanged; B) leave it unbounded. Recommendation: **A** (ADR 0010 requires bounded lists); the heading keeps the true number, so the only visible difference is which completed rows are listed.
7. **A write in the board's read path.** Context: `getTasksForFamily` / `getPublicTasksForFamily` call `syncRecurringCursors` before reading (`tasks/queries.ts:84,208`). Options: A) `tasks` moves the cursor pin to the write path (complete/advance) and a scheduled sweep; B) keep write-before-read. Recommendation: **A** — flag for M-tasks; this screen will not call a writing read.

### Other decisions and doubts

- **Payload size vs the fixed wire.** ADR 0010 asks for small payloads, but G11's body is pinned by the goldens and the Android client; the page load reuses the wire model instead of trimming it. Trimming needs an owner-approved wire change, so it is parked.
- **Kept legacy files.** `src/lib/server/services/familyData.ts` (11 importers) and `src/lib/server/db/actions/familyActivity.ts` (1 importer) stay until their importers are rewired; `familyData.ts` is split across the `family` domain and this screen, `familyActivity.ts` moves into `tasks`. S8 removes them only when the family http and account pages no longer import them.
- **Outside this task's targets.** The three route files and the `shell` wiring are not edited in S1/S2 (not in TARGETS); S6 replaces them with `familyHubPageLoad`/`familyHubActions`/`familyBoardPageLoad`/`familyBoardEndpoint`/`legacyFamilyBoardPathLoad` wiring.
- `familyHub.http.db.test.ts` was written against the legacy route; it must be run (`npm run test:mod -- familyHub`) before S2 is committed and must not change until S6 proves the port identical.

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# familyHub: 0% ported

legacy source files left (2/2, 600 LOC):
  - src/lib/server/db/actions/familyActivity.ts (91 LOC, server) importers: 1
  - src/lib/server/services/familyData.ts (509 LOC, server) importers: 11
      NOTE: SPLIT: member/role/member-type/invite/create use-cases -> family service; loadFamilyDetail/loadFamilyTasks read models -> familyHub screen; loadFamiliesOverview/loadInvitations -> family http.

route files not yet wiring-only (6/6):
  - src/routes/(family)/family/[familyId]/+page.server.ts  /family/[familyId]
  - src/routes/(family)/family/[familyId]/+page.svelte  /family/[familyId]
      NOTE: Fat page: extract state into `<name>.state.svelte.ts` + pure rules; the screen component stays under ~250 lines.
  - src/routes/(family)/family/[familyId]/tasks/+page.server.ts  /family/[familyId]/tasks
  - src/routes/(family)/family/tasks/+page.server.ts  /family/tasks
  - src/routes/(family)/family/tasks/+page.svelte  /family/tasks
      NOTE: Fat page: extract state into `<name>.state.svelte.ts` + pure rules; the screen component stays under ~250 lines.
  - src/routes/api/families/[id]/tasks/+server.ts  /api/families/[id]/tasks

legacy test files left (6/6) — reference only, kinds explained in docs/architecture/testing.md:
  - src/routes/(family)/family/[familyId]/links.test.ts [route, 7 tests]
  - src/routes/(family)/family/[familyId]/page.server.test.ts [route, 1 tests]
  - src/routes/(family)/family/[familyId]/page.svelte.test.ts [component, 24 tests]
  - src/routes/(family)/family/[familyId]/tasks/page.server.test.ts [route, 4 tests]
  - src/routes/(family)/family/tasks/page.server.test.ts [route, 5 tests]
  - src/routes/(family)/family/tasks/page.svelte.test.ts [component, 13 tests]
```
<!-- census:end -->
