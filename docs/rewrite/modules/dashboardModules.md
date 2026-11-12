# Port sheet: dashboardModules

**domain** · rank 5 · port #5 · home: `src/lib/domains/dashboardModules/` · README after the port: `src/lib/domains/dashboardModules/README.md` (written in S1)

Dashboard Module registry, family master switches, per-user hides, the one visibility answer.

- **May import:** kernel, identity, billing, alerts, family.
- **Owns tables:** `dashboardModuleSwitches`.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
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

- Module ids are persisted state; retired ids stay inert; an absent row means visible.
- Family master switch off hides the module for everyone; a user hide affects only that user; a switch row exists only while OFF.
- Daily Verse is gated by the module AND `showDailyVerse`.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/families/{id}/modules/{module}` | PUT | admin+ of `{id}` | `{enabled:boolean}`; required, any non-boolean rejected | 200 `{success:true}` (a family master switch; `enabled:true` deletes the row, `enabled:false` writes it) | 401 `Unauthorized`; 400 `Invalid JSON`; 400 `enabled must be a boolean`; 403 `You do not have permission to perform this action`; 400 `Module is required`; 400 `Unknown dashboard module: {module}` / `Module is not family-scoped: {module}` (thrown by the action, returned as `{error}`) | `src/routes/api/families/[id]/modules/[module]/+server.ts:11-22`; `src/lib/server/services/familyData.ts:353-368`; `src/lib/server/db/actions/dashboardModules.ts:29-47` |
| `/api/me/dashboard-modules` | PUT | signed-in viewer | `{hidden: string[]}`; each element must be a string; unknown ids are dropped, order is rebuilt from the canonical list; empty body reads `{}` and fails the array check | 200 `{success:true, message, hidden}` — message counts cards on, e.g. `Dashboard modules saved — 7 of 8 cards on.`; creates the settings row when absent | 401 `Unauthorized`; 400 `Invalid JSON`; 400 `hidden must be an array of module ids`; 500 `Failed to save dashboard modules` | `src/routes/api/me/dashboard-modules/+server.ts:13-26`; `src/lib/server/services/accountData.ts:209-243`; test: `src/routes/api/me/account.server.test.ts` › "keeps canonical ids only" |

### Rules the module must keep
- The canonical module ids, labels, scopes and bands are declared once, in this order: `verse` (personal, info), `glance`, `top3`, `completed` (personal, card), `board`, `kids`, `groceries`, `meals` (family, card) — `src/lib/dashboardModules.ts:19-34` · test: `src/lib/dashboardModules.test.ts` › "the Daily Verse is the one module in the info band"
- The id is the saved state: moving a module between bands must not change its id. Retiring an id removes it, saved lists naming it are filtered out, and no data migration is owed — `src/lib/dashboardModules.ts:11-17,51-53,144` · test: `src/lib/dashboardModules.test.ts` › "keeps every pre-move module id canonical, so saved states still apply"
- **Absent is not hidden**: a missing map, a missing entry, or a non-canonical id leaves the module visible; only an explicit `false` hides it — `src/lib/dashboardModules.ts:59-67` · test: `src/lib/dashboardModules.test.ts` › "an absent module in a present map is visible too"
- `dashboardVisibility` composes the whole answer once, purely: a family master switch applies only to family-scoped modules; the per-user hidden list applies to every module; the Daily Verse additionally requires `settings.showDailyVerse === true` (no settings row ⇒ verse hidden); every canonical id is present in the returned map — `src/lib/dashboardModules.ts:135-168` · test: `src/lib/dashboardModules.test.ts` › "no settings row means no verse — the setting is the gate, not a default-on"
- Family-off outranks a user's own preference: hiding or showing for yourself never lights up a module the family switched off — `src/lib/dashboardModules.ts:145-151` · test: `src/lib/server/db/actions/dashboardModules.test.ts` › "user hides do not bypass a family-off switch"
- Reads are declared with the modules that consume them (`verse`, `familyTasks`, `familyRoster`, `familyDayEvents`, `kidsAttendance`, `groceries`); `needs(read)` is true while any visible module consumes it, so a loader may skip an expensive read only when nothing visible needs it — `src/lib/dashboardModules.ts:69-104,165-167` · test: `src/lib/dashboardModules.test.ts` › "Kids' Schedule alone does not buy the whole family task board"
- Persisted family switches are per family-scoped module and **rows exist only while OFF**: the read seeds every family module `true` then applies rows; enabling deletes the row; disabling inserts with `onConflictDoNothing`; an unknown or personal module id throws — `src/lib/server/db/actions/dashboardModules.ts:12-47` · `src/lib/server/db/schema.ts:326-350` · test: `src/lib/server/db/actions/dashboardModules.test.ts` › "a family master switch off hides that module for everyone"
- A row collapses (scope, family switch, viewer hide) into exactly one state: `off` whenever the master switch is off, otherwise `hidden-for-me` for a family module the viewer hid, otherwise `on`; family-off wins over hidden-for-me — `src/lib/utils/moduleRowState.ts:20-28` · test: `src/lib/utils/moduleRowState.test.ts` › "family-off outranks hidden-for-me — one row, one truth"
- Scope and state vocabulary is fixed: `Family-wide` / `Personal`, `On` / `Off` / `Hidden for you`, each state with its own tone; the toggle posts the opposite of the current family switch — `src/lib/utils/moduleRowState.ts:31-55` · test: `src/lib/utils/moduleRowState.test.ts` › "submits the opposite of the current family switch"
- Only canonical ids are ever stored for the per-user hides; the saved list is rebuilt from the canonical array, so a retired id cannot be written back — `src/routes/api/me/dashboard-modules/+server.ts:22-25` · `src/lib/server/services/accountData.ts:230-238` · test: `src/lib/server/db/actions/dashboardModules.test.ts` › "cannot be written back: the saved list is rebuilt from canonical ids"
- The row holds no state of its own: it submits `module` + `enabled`, carries `aria-pressed` and `aria-busy`, and accepts an optimistic override plus an acknowledge callback from its owner — `src/lib/components/dashboard/DashboardModuleRow.svelte:18-52,55-82` · test: `src/lib/components/dashboard/DashboardModuleRow.svelte.test.ts` › "acknowledges the click in the same tick, without deciding what changes"

### Page and UI behaviour worth keeping
- The family page's settings card lists only the family-scoped modules, under the copy "Family-wide master switches. A switched-off card is hidden for everyone — each member can still hide or show a card for themself alone in Account settings."; a click flips the row immediately, the row dims while in flight, and it settles on the server's answer — `src/routes/(family)/family/[familyId]/+page.svelte:57-58,188-215,680-700` · `src/lib/components/dashboard/DashboardModuleRow.svelte:30-52`
- Each row reads as one line: label (truncated, never widening the row, no horizontal overflow at 320px), a scope chip, and a state chip with its own tone — `src/lib/components/dashboard/DashboardModuleRow.svelte:65-82` · test: `src/lib/components/dashboard/DashboardModuleRow.svelte.test.ts` › "truncates the label rather than widening the row"
- A plain (non-JS) submit still works with no caller callback, posting the form to `?/toggleDashboardModule` by default — `src/lib/components/dashboard/DashboardModuleRow.svelte:29,50,55-56` · test: `src/lib/components/dashboard/DashboardModuleRow.svelte.test.ts` › "still submits a plain form without a caller callback"
- The account page's per-user hides reuse the same canonical list, so hiding a module there is the same fact the dashboard composes from — `src/lib/dashboardModules.ts:144` · `src/lib/server/services/accountData.ts:230-238`

### Probably accidental (candidates to drop, owner to confirm)
- `moduleRowState` returns `hidden-for-me` only for family-scoped modules, so a personal module the viewer hid renders `On`; its only caller lists family modules, so the personal branch is unreachable today — `src/lib/utils/moduleRowState.ts:26` vs `src/routes/(family)/family/[familyId]/+page.svelte:690` — dead branch with a misleading answer
- `top3` and `completed` declare no reads although ranking the family's tasks and counting today's completions plainly read tasks; a loader following `DASHBOARD_READS` would fetch them anyway — `src/lib/dashboardModules.ts:93-94` — the read vocabulary under-declares (UNSURE)
- `setFamilyModuleSwitch` writes `enabled:false` with `onConflictDoNothing`, so an existing row (only possible from outside this action) is never corrected, and re-enabling deletes rather than updates — `src/lib/server/db/actions/dashboardModules.ts:35-46` — two write shapes for one fact
- `/api/me/dashboard-modules` silently drops any id it does not recognise and answers 200, while the family switch route 400s on the same kind of unknown id — `src/routes/api/me/dashboard-modules/+server.ts:22` vs `src/lib/server/services/familyData.ts:361-366` — inconsistent tolerance of junk input
<!-- inventory:end -->

## Carry-over tickets

None.

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

- 2026-11-11 (owner, [Q-002](../questions.md)): `meals` stays in the registry (family scope) although its card and endpoint are deleted; `UNMOUNTED_MODULES` keeps its switch off `/account`. Do not retire the id: `/api/dashboard` and the family switches would change.

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# dashboardModules: 0% ported

legacy source files left (4/4, 356 LOC):
  - src/lib/components/dashboard/DashboardModuleRow.svelte (84 LOC, ui) importers: 1
  - src/lib/dashboardModules.ts (168 LOC, model) importers: 13
  - src/lib/server/db/actions/dashboardModules.ts (48 LOC, server) importers: 3
  - src/lib/utils/moduleRowState.ts (56 LOC, model) importers: 2

route files not yet wiring-only (2/2):
  - src/routes/api/families/[id]/modules/[module]/+server.ts  /api/families/[id]/modules/[module]
  - src/routes/api/me/dashboard-modules/+server.ts  /api/me/dashboard-modules

legacy test files left (4/4) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/components/dashboard/DashboardModuleRow.svelte.test.ts [component, 11 tests]
  - src/lib/dashboardModules.test.ts [pure, 27 tests]
  - src/lib/server/db/actions/dashboardModules.test.ts [pure, 20 tests]
  - src/lib/utils/moduleRowState.test.ts [pure, 10 tests]
```
<!-- census:end -->
