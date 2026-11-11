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

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

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
