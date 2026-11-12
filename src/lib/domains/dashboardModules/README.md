# dashboardModules

**domain** — Dashboard Module registry, family master switches, per-user hides, the one visibility answer.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- **Owns:** the canonical Dashboard Module registry (one list: id, label, scope, band, meaning); the family master switches (`dashboardModuleSwitches`) that admins flip; the per-user hidden ids saved on the user's settings row; `dashboardVisibility`, the one composition that answers "is this module visible to this viewer, and which expensive read may the loader skip?"; and the family-hub row vocabulary ("Family-wide · Off", the chip tone, the value a click submits).
- **Does not own:** the user settings row itself (identity owns `userSettings`; the hidden list is read and written through identity's public interface), the family role check (`family` owns it; this module asks for admin), the dashboard page and its loader (`dayDashboard` calls the visibility answer and renders the data), or what a module displays — `meals` stays a registry id with no card (owner Q-002) because the id is saved state and retiring it would change `/api/dashboard` and the family switches.

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [README.md](README.md) | doc | This file: the registry's rules, the visibility contract, and the wire this module pins. | — |
| [index.ts](index.ts) | entry | Public isomorphic interface: the registry, the visibility answer, the row vocabulary. | the three `*.rules.test.ts` files (S3) |
| [index.server.ts](index.server.ts) | entry | Public server interface: family switches, per-user hides, the visibility use-case, the two `/api` handlers. | [dashboardModules.http.db.test.ts](dashboardModules.http.db.test.ts), `dashboardModules.service.db.test.ts` (S5) |
| [ui/index.ts](ui/index.ts) | entry | Public components: the family-hub switch row. | `ui/DashboardModuleRow.svelte.test.ts` (S7) |
| [dashboardModules.http.db.test.ts](dashboardModules.http.db.test.ts) | test | Golden contract tests for both `/api` routes, run against the legacy handlers today and unchanged after the port. | itself |

## Public interface

Everything other modules and routes may use, grouped by entry file. One line each.

`index.ts`:

- `DASHBOARD_MODULES` — the canonical registry in its fixed order: `{ id, label, scope, band, meaning }` per module. Deleting it copies eight literals into every screen, so it stays.
- `selectDashboardModules({ scope?, band? })` — the registry filtered for one page (the account page's info and card bands, the family hub's family-wide rows). One predicate, so a wrong filter cannot silently show a customer the wrong switch.
- `isDashboardModule(id)` — the canonical check. The per-user save uses it to drop retired ids; a saved list naming one must never resurrect it.
- `showsModule(map, id)` — reads a visibility map that came off a payload; an absent map or entry is **visible**.
- `dashboardVisibility({ settings, familySwitches })` — **the module's core**: one pure answer for one viewer, `{ modules, shows(id), needs(read) }`. Every id is present in `modules`, so a loader, a page payload and a component all derive from this and nobody composes two booleans again.
- `describeDashboardModuleRow({ scope, enabled, hiddenForViewer })` — one row's whole story: `{ state, scopeLabel, stateLabel, stateClass, submitValue }`. Family-off outranks hidden-for-me, and the submit value is the opposite of the current family switch.
- Types: `DashboardModule`, `DashboardModuleId`, `DashboardBand`, `ModuleScope`, `ModuleSwitchMap`, `ModuleRowState`, `DashboardRead`, `DashboardVisibility`.

`index.server.ts`:

- `getDashboardVisibility(ctx, actor, { familyId })` — the read use-case: identity's settings row plus this module's family switches, composed by `dashboardVisibility`. This is what the Day Dashboard loader and `/api/dashboard` call.
- `listFamilyModuleSwitches(ctx, familyId)` — the persisted half: every family-scoped id seeded `true`, then the OFF rows applied.
- `setFamilyModuleSwitch(ctx, actor, { familyId, module, enabled })` — an admin-only master switch; a row exists only while OFF, so enabling deletes it.
- `saveHiddenModules(ctx, actor, { hidden })` — canonicalizes the posted ids, writes them on the user's settings row (identity), and returns `{ hidden, message }` with the wire's card count.
- `putFamilyModuleSwitchEndpoint`, `putMyDashboardModulesEndpoint` — the two `/api` handlers; route files stay wiring only.

`ui/index.ts`:

- `DashboardModuleRow` — the family-hub switch row: label, scope chip, state chip. It holds no state of its own: it submits `module` + `enabled`, carries `aria-pressed`/`aria-busy`, and accepts an optimistic override plus an acknowledge callback from its owner.

## How to test

- Whole module: `npm run test:mod -- dashboardModules` (add `--legacy` while legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup: the registry, `dashboardVisibility` and the row vocabulary.
- Database + services: `dashboardModules.repo.db.test.ts` and `dashboardModules.service.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: [dashboardModules.http.db.test.ts](dashboardModules.http.db.test.ts) pins status + body of both endpoints in committed mode (`beforeEach(truncateAll)`), because the legacy handlers write through the `db` singleton.
- UI: `ui/DashboardModuleRow.svelte.test.ts` renders the row with props; no `vi.mock`.
- Fixtures: `dashboardModules.fixtures.server.ts` — `seedFamilyWithRole`, `seedFamilySwitch`, `seedHiddenModules` (S4).

## Invariants

Behaviour that must not change, each with the test that pins it (`file › test title`):

- The canonical registry is one list in one order — `verse` (personal, info) then `glance`, `top3`, `completed` (personal, card), `board`, `kids`, `groceries`, `meals` (family, card) — `src/lib/dashboardModules.ts:19-34`; `dashboardModules.registry.rules.test.ts › keeps the canonical ids, scopes and bands in one fixed order`.
- The id is the saved state: moving a module between bands keeps its id; a retired id is rejected and inert, never resurrected, and no data migration is owed — `src/lib/dashboardModules.ts:11-17,51-53,144`; `dashboardModules.registry.rules.test.ts › rejects a retired id and keeps every pre-move id canonical`.
- **Absent is not hidden**: no map, no entry, or a non-canonical id leaves a module visible; only an explicit `false` hides it — `src/lib/dashboardModules.ts:59-67`; `dashboardModules.registry.rules.test.ts › treats an absent map, an absent entry and an unknown id as visible`.
- `dashboardVisibility` composes once and purely: the family master switch applies only to family-scoped modules, the viewer's hidden list applies to every module, and every canonical id is present in `modules` — `src/lib/dashboardModules.ts:135-168`; `dashboardModules.visibility.rules.test.ts › composes the family switch and the hidden list into one total map`.
- **Family-off outranks the viewer's preference**: hiding or showing for yourself never lights up a module the family switched off — `src/lib/dashboardModules.ts:145-152`; `dashboardModules.visibility.rules.test.ts › a family-off switch wins over any user preference`.
- The Daily Verse is gated by its module **and** `settings.showDailyVerse === true`; no settings row means no verse — `src/lib/dashboardModules.ts:156-165`; `dashboardModules.visibility.rules.test.ts › no settings row means no verse — the setting is the gate, not a default-on`.
- `needs(read)` is true while any visible module consumes the read, so a loader skips an expensive read only when nothing on screen needs it; `top3`/`completed` declare no read because they consume the always-fetched user tasks — `src/lib/dashboardModules.ts:69-104,167-169`, `src/lib/server/services/dashboardData.ts:129-130`; `dashboardModules.visibility.rules.test.ts › needs() follows the visible consumers, not the module count`.
- Persisted switches are per family-scoped module and **rows exist only while OFF**: the read seeds every family module `true` then applies rows; enabling deletes the row; disabling inserts one; an unknown or personal id is refused with the legacy message — `src/lib/server/db/actions/dashboardModules.ts:12-47`; `dashboardModules.http.db.test.ts › PUT /api/families/{id}/modules/{module} › re-enabling deletes the row — a row exists only while OFF` and `› rejects an unknown module id with the legacy message`.
- A switch-off is scoped to its family and answers `200 {"success":true}` — `src/routes/api/families/[id]/modules/[module]/+server.ts:11-22`; `dashboardModules.http.db.test.ts › PUT /api/families/{id}/modules/{module} › lets an admin switch a family module off and writes the OFF row`.
- Only an admin or the creator may flip a family switch; a member and a stranger both get `403 {"error":"You do not have permission to perform this action"}`, and the role check runs before the module name — `src/lib/server/services/familyData.ts:258-267,359`; `dashboardModules.http.db.test.ts › PUT /api/families/{id}/modules/{module} › checks permission before the module name, so a non-admin cannot probe ids`.
- A signed-out caller gets `401 {"error":"Unauthorized"}` on both routes — `src/routes/api/families/[id]/modules/[module]/+server.ts:11` and `src/routes/api/me/dashboard-modules/+server.ts:13`; goldens `› answers 401 {"error":"Unauthorized"} when signed out`.
- A malformed or non-object JSON body is `400 {"error":"Invalid JSON"}`, never a 500 — `src/lib/server/utils/jsonBody.ts:10-32`; goldens `› answers 400 {"error":"Invalid JSON"} for a malformed or non-object body` and `› answers 400 {"error":"Invalid JSON"} for a malformed body`.
- `enabled` must be a boolean; absent, `null` or any other type is `400 {"error":"enabled must be a boolean"}` — `src/routes/api/families/[id]/modules/[module]/+server.ts:15-18`; golden `› requires a boolean enabled, absent or not`.
- An empty module name is `400 {"error":"Module is required"}` before the registry is consulted — `src/lib/server/services/familyData.ts:361`; golden `› rejects an empty module name`.
- A personal module cannot carry a family switch: `400 {"error":"Module is not family-scoped: verse"}` — `src/lib/server/db/actions/dashboardModules.ts:32-34`; golden `› rejects a personal module: it has no family master switch`.
- A row collapses (scope, family switch, viewer hide) into exactly one state — `off` whenever the master switch is off, otherwise `hidden-for-me` for a module the viewer hid, otherwise `on` — `src/lib/utils/moduleRowState.ts:20-28`; `dashboardModules.row.rules.test.ts › family-off outranks hidden-for-me — one row, one truth`.
- Scope and state vocabulary is fixed (`Family-wide` / `Personal`, `On` / `Off` / `Hidden for you`, each with its own tone) and the toggle posts the opposite of the current family switch — `src/lib/utils/moduleRowState.ts:31-55`; `dashboardModules.row.rules.test.ts › names each state once and submits the opposite of the current switch`.
- The per-user save stores canonical ids only and rebuilds the saved list from the canonical array, so posted order and duplicates cannot stick and a retired id cannot be written back — `src/routes/api/me/dashboard-modules/+server.ts:23-26`, `src/lib/server/services/accountData.ts:209-243`; golden `PUT /api/me/dashboard-modules › saves canonical ids only and reports how many cards stay on` and `› rebuilds the list in canonical order and collapses duplicates`.
- The per-user save answers `200 {"success":true,"message","hidden"}` with the on-cards count, creates the settings row when absent, and leaves every other setting alone — `src/lib/server/services/accountData.ts:209-243`; goldens `› creates the settings row when the user has none` and `› replaces an existing hidden list without touching the other settings`.
- The per-user save tolerates ids it does not recognise (drops them, still `200`), unlike the family switch route — `src/routes/api/me/dashboard-modules/+server.ts:23` vs `src/lib/server/services/familyData.ts:361-366`; golden `› drops every unknown id and answers 200, unlike the family switch route`. (Owner question O-1.)
- `/api/me/dashboard-modules` requires `hidden` to be an array of strings; absent, `null`, a string, or a non-string element is `400 {"error":"hidden must be an array of module ids"}` — `src/routes/api/me/dashboard-modules/+server.ts:20-22`; golden `› requires an array of module ids`.
- The switch row holds no state of its own: it submits `module` + `enabled`, carries `aria-pressed` and `aria-busy`, and accepts an optimistic override plus an acknowledge callback — `src/lib/components/dashboard/DashboardModuleRow.svelte:18-52,55-82`; `ui/DashboardModuleRow.svelte.test.ts › acknowledges the click in the same tick, without deciding what changes`.
- A plain (non-JS) submit still works with no caller callback, posting the form to `?/toggleDashboardModule` by default — `src/lib/components/dashboard/DashboardModuleRow.svelte:29,50,55-56`; `ui/DashboardModuleRow.svelte.test.ts › still submits a plain form without a caller callback`.
- Each row reads as one line: the label truncates instead of widening the row (no horizontal overflow at 320px), with a scope chip and a state chip — `src/lib/components/dashboard/DashboardModuleRow.svelte:65-82`; `ui/DashboardModuleRow.svelte.test.ts › truncates the label rather than widening the row`.

Neither route is rate limited today (`grep rateLimit` finds none in either handler), so no golden pins a 429.

## Depends on

- May import: kernel + identity, billing, alerts, family (public entries only).
- Owns tables: `dashboardModuleSwitches`.
- Reads (join only): none — the per-user hidden list and `showDailyVerse` are read through identity's settings service, not by joining `userSettings`.
- Calls: `identity` — the user's settings row (hidden ids, `showDailyVerse`) and its write; `family` — the admin/creator check on a family master switch. Nothing else: visibility is pure.
- Called by: `dayDashboard` (the screen loader and `/api/dashboard` call `getDashboardVisibility` and use `needs()` to skip reads); `familyHub` (`listFamilyModuleSwitches`, `setFamilyModuleSwitch`, the row vocabulary and `ui/DashboardModuleRow`); `account` (`selectDashboardModules`, `saveHiddenModules`); `family` for the `moduleSwitches` map on `GET /api/families/{id}` (see owner question O-2).
