# Port sheet: dashboardModules

**domain** · rank 5 · port #5 · home: `src/lib/domains/dashboardModules/` · README after the port: `src/lib/domains/dashboardModules/README.md` (written in S1)

Dashboard Module registry, family master switches, per-user hides, the one visibility answer.

- **May import:** kernel, identity, billing, alerts, family.
- **Owns tables:** `dashboardModuleSwitches`.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `66a11131`
- [x] S3 contract + rules
- [x] S4 repo (+ fixtures)
- [x] S5 service
- [x] S6 http + route wiring (goldens unchanged since S2)
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

Every file lives in `src/lib/domains/dashboardModules/`. Roles per [conventions](../../architecture/conventions.md#file-roles); the visibility answer is the centre, and everything else is either its registry, its persistence, or the row that renders it.

**S1 (this step):**

- `README.md` — done: purpose, files, public interface, invariants with legacy evidence, depends on.

**S2 (this step):**

- `dashboardModules.http.db.test.ts` (test) — golden contract tests for both `/api` routes in committed mode, imported from the route files. Done. Both handlers run in the `db` project, but the me-route chain is env-dependent: `accountData.ts:24` imports `$lib/utils/sendEmail`, which imports `$env/static/private` and constructs `new Resend(RESEND_API_KEY)` at module load. That golden therefore needs `RESEND_API_KEY` in the test environment (it is set on this machine, and it is the only static private var that chain names), so no spec-golden marker is needed while it stays set. If a clean environment lacks it, the me-route describe must switch to the `// golden from spec: legacy handler not runnable here (…)` marker.

**S3 — contract and rules:**

- `dashboardModules.contract.ts` (contract) — zod for the two PUT bodies and their responses, with the legacy wording: `{enabled: boolean}` → `{success: true}`; `{hidden: string[]}` → `{success, message, hidden}`. The registry-entry type `DashboardModule` lives with the registry, not here. It also exports `dashboardModulesSavedMessage(hiddenCount)` — the response `message` is wire copy, and leaving it in the S5 service would put copy in two homes once the account page's form action shares the save. (S3 deviation: one exported formatter added beyond zod.)
- `dashboardModules.registry.rules.ts` (rules) — `DASHBOARD_MODULES`, the `DashboardModule` entry type, `DashboardModuleId`/`DashboardBand`/`ModuleScope`/`ModuleSwitchMap`/`DashboardModuleFilter`, `selectDashboardModules`, `isDashboardModule`, `canonicalHiddenModules` (the per-user save's pure canonicalization: drop unknown and retired ids, registry order, duplicates collapsed — pinned by goldens before, now one home for S5), `showsModule`. Pure; no reads, no "now".
- `dashboardModules.visibility.rules.ts` (rules) — `DashboardRead`, private `DASHBOARD_READS`, `DashboardSettingsFacts`, `DashboardVisibility`, `dashboardVisibility` (the one composition: total map, family-off outranks, verse needs `showDailyVerse === true`, `needs`).
- `dashboardModules.row.rules.ts` (rules) — `ModuleRowState`, `ModuleToggleValue`, `DashboardModuleRowInfo`, `describeDashboardModuleRow` (state + labels + tone + submit value in one answer; legacy `moduleRowState` ported exactly, including personal + hidden-for-viewer → `on`).
- `dashboardModules.registry.rules.test.ts`, `dashboardModules.visibility.rules.test.ts`, `dashboardModules.row.rules.test.ts` (tests) — table-driven, carrying over the legacy pure cases that encode a real rule (id × persisted fact matrix, needs matrix, retired-id inertness).
- `dashboardModules.contract.test.ts` (test) — parse tables for both bodies and responses (the one 400 copy per route; absent, `null`, wrong type and bad element all refused alike; unknown ids accepted, Q-029) and the saved-message copy. (S3 addition, after the feedback example's `feedback.contract.test.ts`.)

**S4 — repo and fixtures:**

- `dashboardModules.repo.server.ts` (repo) — `readFamilyModuleSwitches(db, familyId)` (seeds family ids `true`, applies rows) and `writeFamilyModuleSwitch(db, { familyId, module, enabled, now })` (delete on enable, insert on disable — a row exists only while OFF). Two deviations from the S4 outline: (1) the write takes one named object rather than four positional arguments, so the boolean never sits in a bare positional slot (conventions: no positional booleans) and the insert can stamp `createdAt`/`updatedAt` from the caller's `now` (R5) instead of leaving both to `defaultNow()`/`$onUpdate`; (2) the repo says `read`/`write` where the S5 service says `list`/`set`, because R11 allows one exported function name per home and the service re-exposes both under the outline's names. No authorization, no rules.
- `dashboardModules.repo.db.test.ts` (test) — switch map defaults, OFF rows applied, stale row read verbatim, delete-on-enable (only that module, only that family), insert-on-disable stamped with `now`, the conflict clause keeping the first row, family scoping.
- `dashboardModules.fixtures.server.ts` (fixtures) — `seedFamilyWithRole`, `seedFamilySwitch`; reuse `seedUser`. They take `db` first so they run inside `rollbackTest`; `family`'s fixtures use the `testDb()` singleton and fixed ids, so they cannot. The settings-row builder S5 needs is added then, with its first user.

**S5 — service:**

- `dashboardModules.service.server.ts` (service) — `getDashboardVisibility(ctx, actor, {familyId})` (identity settings + own repo, composed by the pure answer), `listFamilyModuleSwitches(ctx, familyId)`, `setFamilyModuleSwitch(ctx, actor, …)` (family admin check, legacy messages), `saveHiddenModules(ctx, actor, {hidden})` (canonicalize, persist through identity, return the wire message).
- `dashboardModules.service.db.test.ts` (test) — one test per invariant that involves IO, titled after the rule; refusals asserted by `AppError` code.

**S6 — http:**

- `dashboardModules.http.server.ts` (http) — `putFamilyModuleSwitchEndpoint` and `putMyDashboardModulesEndpoint` through `endpoint()`: same auth, statuses, bodies and messages as today; re-exported from `index.server.ts`; the two route files become wiring only.
- No page loads or form actions: this module owns no page. The family and account pages keep their own `formAction`s and call the services.

**S7 — UI and client:**

- `dashboardModules.api.ts` (api) — browser client for the two endpoints, on the kernel api client: `saveHiddenModules`, `setFamilyModuleSwitch`.
- `ui/DashboardModuleRow.svelte` (ui) — the family-hub switch row on kernel/ui primitives (chips, `Pill`, confirm tone): label (truncating), scope chip, state chip, `aria-pressed`/`aria-busy`, optimistic override + acknowledge callback, plain-form fallback.
- `ui/DashboardModuleRow.svelte.test.ts` (test) — the three legacy behavioural pins (acknowledge same tick, plain form, no widening at 320px).
- No state class here: both call sites are page-level saves owned by the `account` and `familyHub` screens; the row is stateless by design, so a module state class would be a second source of truth.

**S8 — delete:** all four legacy source files and their four legacy test files (see the census block), after their importers move to the entries above.

### Where each legacy export goes

| legacy export | home / fate |
|---|---|
| `DASHBOARD_MODULES`, `DashboardModuleId`, `DashboardBand` | `dashboardModules.registry.rules.ts`, unchanged meaning |
| `FAMILY_DASHBOARD_MODULES`, `INFO_DASHBOARD_MODULES`, `CARD_DASHBOARD_MODULES` | die: one `selectDashboardModules({ scope, band })` replaces three filters, so a page cannot filter on the wrong axis |
| `isDashboardModule`, `ModuleSwitchMap`, `showsModule` | `dashboardModules.registry.rules.ts` (absent-is-visible reader stays public: three components read a payload map with it) |
| `DASHBOARD_READS` | stays private inside `dashboardModules.visibility.rules.ts`; `needs()` is its only reader, so exporting it would freeze a table nobody may read |
| `DashboardRead`, `DashboardVisibility`, `dashboardVisibility` | `dashboardModules.visibility.rules.ts` (`DashboardModuleId` stays the registry's type and is imported) |
| `ModuleScope`, `ModuleRowState`, `moduleRowState`, `moduleScopeLabel`, `moduleStateLabel`, `moduleStateClass`, `moduleToggleValue` | `dashboardModules.row.rules.ts` as one `describeDashboardModuleRow`; the seven exports die because the one caller wants all of them at once |
| `getFamilyModuleSwitches` | `readFamilyModuleSwitches` in the repo, re-exposed by the service as `listFamilyModuleSwitches`; the names change because it reads a family's switches, not the viewer's, and the repo and the service may not share an exported name (R11) |
| `setFamilyModuleSwitch` | service (admin check, id validation) + repo `writeFamilyModuleSwitch` (row write); same rule, now split by authorization and SQL |
| `DashboardModuleRow.svelte` | `ui/DashboardModuleRow.svelte`, rebuilt on kernel/ui; legacy markup and its 11 component tests die in S8 |

## Notes

- 2026-11-11 (owner, [Q-002](../questions.md)): `meals` stays in the registry (family scope) although its card and endpoint are deleted; `UNMOUNTED_MODULES` keeps its switch off `/account`. Do not retire the id: `/api/dashboard` and the family switches would change.
- 2026-11-12 (owner, [Q-031](../questions.md), like `meals` in Q-002): the Daily Verse feature and its endpoint are deleted, but the `verse` id and its `verse` read token STAY in the registry and the visibility vocabulary. The id is saved state (a viewer's hidden list may name it) and `showDailyVerse` still gates `modules.verse` on the wire, so retiring either would change `/api/dashboard` and the saved lists.
- **S1 dispositions of "probably accidental" items.**
  - *`moduleRowState` answers `hidden-for-me` only for family modules.* Ported exactly: `describeDashboardModuleRow` returns `on` for a personal module the viewer hid and `off` for a personal module that is off (`moduleRowState.test.ts:28-35`: a stale hidden-list entry cannot downgrade a personal row). The branch is unreachable from today's callers (the family page passes only family scope). **S7 design question, not a decided change:** whether the account page should ever show `hidden-for-me` for a personal module.
  - *`top3` / `completed` declare no reads.* Internal, and not a defect: both consume the viewer's own tasks, and `src/lib/server/services/dashboardData.ts:129-130` fetches `userTasks` unconditionally for every viewer. Read tokens exist to guard **skippable** reads, so an entry for tasks would describe a token that never gates anything. Kept as-is and stated in the README invariant.
  - *`setFamilyModuleSwitch` inserts with `onConflictDoNothing` and deletes instead of updating.* Internal: the wire only ever sees "a row exists only while OFF", which is the Must-survive rule. The conflict clause is a no-op guard for rows written outside the action, not a second write shape; the port keeps one write pair (insert-off / delete-on).
  - *`/api/me/dashboard-modules` tolerates unknown ids with `200` while the family route `400`s.* Visible on the wire → kept as an Invariant, with owner question O-1 below.
- **S5+S6 (2026-11-21).**
  - **Q-030 landed here.** `listFamilyModuleSwitches` is exported from `index.server.ts`; `src/lib/app/ports.server.ts` replaced family's `moduleSwitches` transition bridge with an adapter over it (the port type stays family's, in family's `index.server.ts`).
  - **Family role: a direct call, no port (owner direction, 2026-11-21).** `family` now exports `getViewerRole(ctx, actorId, familyId)` from its entry — the same read `getFamily` uses for its 404 (legacy `getMemberRole` semantics, pinned by three `family.families.service.db.test.ts` rows). Family is rank 4, so `dashboardModules` imports it directly; the earlier `DashboardModulesFamilyRolePort` + the `familyRole` bridge over legacy `getMemberRole` were deleted, and `AppPorts` is `IdentityPorts & FamilyPorts` again.
  - **Contract deviation (S3 value corrected to the frozen wire).** Both body schemas answered the field copy for a non-object body; the S2 golden pins `400 {"error":"Invalid JSON"}` for the array body, and legacy `readJsonObject` refused every non-object with that one sentence. Both schemas now carry `INVALID_JSON_MESSAGE` as their object-level error (the identity/family pattern) and the contract test splits its rows accordingly. No wire change: this is the legacy behaviour the golden already pinned.
  - **Internal deviation: the family route's catch-all is gone.** Legacy `toggleDashboardModule` wrapped the write in `try/catch` and answered `400 {error: error.message}` for any storage failure; the port lets `endpoint()` file that as a 500 fault (logged + `ctx.faults`), which is the module-wide convention for a fault. No golden pins it.
  - **Answered questions for this module, none owed a post-S6 fix:** Q-029 (A, recorded default) — the tolerance it confirms is the behaviour the golden pins (`drops every unknown id and answers 200`); Q-002/Q-031 — registry ids kept as-is (already true). O-1 is **still open** (unknown ids on `/api/me/dashboard-modules`), so no change was made for it.
  - **The S2 env note is moot.** The me-route golden used to need `RESEND_API_KEY` because the legacy chain imported `sendEmail`; the ported chain (identity's settings service) imports no `$env`, so the golden runs in a clean environment and still needs no spec-golden marker.

- **S7 (2026-11-21).**
  - `dashboardModules.api.ts` landed on the kernel api client with a named `DashboardModulesApi` interface (no `ReturnType<typeof …>`), typed by the contract; exported from `index.ts`.
  - `ui/DashboardModuleRow.svelte` rebuilt in Svelte 5 runes on the legacy markup: props in, callbacks out, no `$app/*` — the route passes the framework's `enhance` action as a prop (the `ReportBugForm` pattern), and the default no-op action leaves the plain form submission alone. `ui/index.ts` exports it.
  - New row helpers: `describeDashboardModuleState(scope, state)` and `dashboardModuleToggleValue(enabled)`. `describeDashboardModuleRow` is now their composition, so the component's chips and the family page's submit value read the same tables instead of deriving words twice.
  - **Intentional deviation from the S7 plan:** the two chips are plain spans carrying the rule's `stateClass`, not `Pill`. Pill's neutral tone is `bg-slate-100/text-slate-600` while the legacy off chip is `bg-slate-200/text-slate-500`; `stateClass` is the module's one tone table and would be dead weight with Pill. The row is otherwise rebuilt (markup/classes otherwise unchanged, so the unported family page's screenshot stays identical). No visual/perf check of its own: this module owns no page.
  - **S7 design question answered:** a personal module the viewer hid keeps reading `on` (unchanged). The account page's per-module rows are checkboxes, not this component, so nothing today could show `hidden-for-me` for a personal module; changing it would be a new rule, not a parity fix.
- **S8 (2026-11-21).**
  - **Importers rewired to the module's public entries:** the account section (+ its helper and both tests), `DayDashboard.svelte` (+ test), the three prototype variants, `accountData.ts` (its duplicated saved-message copy is now `dashboardModulesSavedMessage`), `dashboardData.ts` (`dashboardVisibility`), the calendar dashboard SSR test, and the legacy actions file (registry imports).
  - **Deleted legacy tests:** `src/lib/dashboardModules.test.ts`, `src/lib/utils/moduleRowState.test.ts`, `src/lib/components/dashboard/DashboardModuleRow.svelte.test.ts`, `src/lib/server/db/actions/dashboardModules.test.ts`. The last one only exercised the registry + `dashboardVisibility`, now pinned by `dashboardModules.registry.rules.test.ts` / `dashboardModules.visibility.rules.test.ts` and the goldens.
  - **Kept, with importers (the contract's exception):** `src/lib/dashboardModules.ts`, `src/lib/utils/moduleRowState.ts` and `src/lib/components/dashboard/DashboardModuleRow.svelte` are now ~20-line transition bridges, because `src/routes/(family)/family/[familyId]/+page.svelte` (screen `familyHub`, unported, 1051 lines) imports them — and a `+page.svelte` that imports ported code must be wiring-only (R8). They hold no registry, rules or markup of their own; they wrap `selectDashboardModules`, `describeDashboardModuleRow` / `dashboardModuleToggleValue` and the module's `ui/DashboardModuleRow`.
  - **Kept, with importers:** `src/lib/server/db/actions/dashboardModules.ts` — `dashboardData.ts:19` (dayDashboard) and `familyData.ts:18-19` (familyHub) still call it with the `db` singleton; the ported service takes a `Ctx`, which neither unported service has. Both go when their screens' S8 lands (and the file's registry imports already point at the module).
  - `src/lib/app/ports.server.ts` is untouched: Q-030's `listFamilyModuleSwitches` adapter stays the only wiring.

### Questions for the owner

- **O-1 — Should `/api/me/dashboard-modules` reject unknown module ids like the family switch route does?** (Q-029) Context: the per-user save silently drops an id it does not recognise and answers `200` (`src/routes/api/me/dashboard-modules/+server.ts:22`), while a family switch for the same unknown id is `400 {"error":"Unknown dashboard module: …"}` (`src/lib/server/services/familyData.ts:361-366`). Installed clients post back the list they were given, so a retired id after an app update is exactly the case the tolerance covers. Options: (a) keep today's tolerance — no client can break, junk never persists; (b) `400` like the family route — consistent, but any client holding a retired id starts failing; (c) keep `200` and add the dropped ids to the body — a wire addition for no client benefit today. Recommendation: (a), and pin it with the golden that already exists.
- **O-2 — `GET /api/families/{id}` returns `moduleSwitches`, but `family` (rank 4) may not import `dashboardModules` (rank 5).** (Q-030) Context: the families payload carries the family's master-switch map (`docs/guides/task-api-spec.md`, G10b) and the only owner of that fact is this module; R3 forbids `family` reading `dashboardModuleSwitches` and R1 forbids the upward import. Options: (a) record a rank exception in the registry for this one read (`listFamilyModuleSwitches` through this module's public entry) — the rule stays in one place; (b) move the field to a dashboardModules route fragment — a `/api` wire change for Android, needs its own ticket; (c) duplicate the seeding rule in `family` — rejected by R3 and the one-home convention. Recommendation: (a). This belongs to the `family` module's port, not this one; noted here so it is decided before S6 of that module.

Answer (owner, 2026-11-20): **port** — neither (a)'s registry exception nor (b)'s wire change. `family` declares a family-owned `moduleSwitches` port (its interface sits in `index.server.ts`), this module implements it with `listFamilyModuleSwitches`, and `src/lib/app` wires the adapter in. No registry rank exception, no module cycle, `/api` wire unchanged. Family's S5 declares the port; the app wiring lands with family S5+S6.

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# dashboardModules: 0% ported

legacy source files left (4/4, 356 LOC):
  - src/lib/components/dashboard/DashboardModuleRow.svelte (84 LOC, ui) importers: 1
  - src/lib/dashboardModules.ts (168 LOC, model) importers: 12
  - src/lib/server/db/actions/dashboardModules.ts (48 LOC, server) importers: 2
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
