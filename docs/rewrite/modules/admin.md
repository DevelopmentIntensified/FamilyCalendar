# Port sheet: admin

**screen** · port #19 · home: `src/lib/screens/admin/` · README after the port: `src/lib/screens/admin/README.md` (written in S1)

Admin shell: tab layout and badge counts (registers themselves live in feedback).

- **May import:** kernel + any domain (public entries); never another screen.
- **Owns tables:** none.
- **Must be ported first:** feedback (from the legacy import graph; see the ledger).
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

- Admin gate as it runs today: the hooks redirect every `/admin` page request to `302 /login`, both with no cookie (before the anonymous-account fallback) and with a signed-in non-admin. The layout's own non-admin → `/calendar` branch is unreachable behind the hooks. A Bearer caller bypasses the hook gate, so `/api/admin/*` keeps its own role check (`403 {"error":"Forbidden"}`).
- Badge counts degrade to 0, never 500.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/admin` | GET | admin role only (cookie session or Bearer token) | none | 200 `{ openBugs: number, openPhrases: number }` | 401 `{ "error": "Unauthorized" }`; 403 `{ "error": "Forbidden" }` | `src/routes/api/admin/+server.ts:6-10`, `src/lib/server/services/adminData.ts:24-40` |

`/api/admin/bugs`, `/api/admin/bugs/[id]/resolve`, `/api/admin/nlp` and `/api/admin/nlp/[id]/resolve` belong to feedback but are gated by this module's `requireAdminJson` — `src/routes/api/admin/server.test.ts:37-96`.

### Rules the module must keep
- The admin gate is segment-based (`/admin` anywhere in the path) and runs in hooks BEFORE the anonymous-account fallback: no cookie on an admin route → 302 `/login`, never a freshly created Anonymous Account — `src/hooks.server.ts:21-40,64-72`
- A signed-in non-admin on an admin route is redirected 302 `/login` by hooks; the layout repeats the check (no user → `/login`, non-admin → `/calendar`) — `src/hooks.server.ts:118-120`, `src/routes/(admin)/+layout.server.ts:6-15`
- Admin means the `admin` role on the user row, nothing else (`isAdminUser`) — `src/lib/server/services/adminData.ts:15-18`
- The layout loads the two badge counts through `guard('admin-counts', 0, …)` per leg, so a failing count degrades to 0 instead of 500ing every admin page — `src/lib/server/services/adminData.ts:33-40`, `src/routes/(admin)/+layout.server.ts:13-14` · test: `src/routes/api/admin/server.test.ts` › "counts degrade to 0 per leg"
- The JSON guard returns 401 without a user and 403 `Forbidden` for a signed-in non-admin, before any register is read or resolved — `src/lib/server/services/adminData.ts:20-31` · test: `src/routes/api/admin/server.test.ts` › "%s: 401 without auth", "%s: 403 for a non-admin, nothing resolved"
- The admin shell has exactly two section tabs, in this order: Bug Reports (badge `openBugs`, red) and Unmatched Phrases (badge `openPhrases`, slate); a tab is active on its exact path or any child path — `src/routes/(admin)/+layout.svelte:7-20,22,32-51`
- `adminData` also exposes the register reads used by the feedback pages: `loadBugReports()` and `loadUnmatchedPhrases()` each return `{ open, resolved }` — `src/lib/server/services/adminData.ts:42-53`
- Admin pages are their own shell: no app Navbar, no BottomNav, no breadcrumbs; the header carries the Admin home link, the section nav, "← Back to app" → `/calendar`, and a Toaster — `src/routes/(admin)/+layout.svelte:25-63`
- `/api/admin` returns the same counts object the layout consumes, so the nav badges and the JSON cannot disagree — `src/routes/api/admin/+server.ts:5-10`

### Page and UI behaviour worth keeping
- Header reads `🛠 Admin` (aria-label "Admin home"); nav has aria-label "Admin sections"; "← Back to app" is pushed right — `src/routes/(admin)/+layout.svelte:25-59`
- `/admin` index: title `Admin · Family Planz`, heading "Admin", subtitle "Triage user feedback and parser gaps.", and two cards — "🐞 Bug Reports" (`N open`, "User-submitted reports, newest first. Resolve what's fixed.") and "💬 Unmatched Phrases" (`N open`, "Instructions the parsers couldn't handle. Add patterns for frequent ones.") — `src/routes/(admin)/admin/+page.svelte:5-42`
- Counts render as `0` when the layout data omits them (`?? 0`) — `src/routes/(admin)/+layout.svelte:11-19`, `src/routes/(admin)/admin/+page.svelte:21,35`

### Probably accidental (candidates to drop, owner to confirm)
- Two different redirect targets for a signed-in non-admin: hooks sends `/login`, the layout's code says `/calendar`; because hooks intercepts every `/admin` path the layout's `/calendar` branch is unreachable (the port sheet's "non-admin → /calendar" is not what runs) — `src/hooks.server.ts:118-120`, `src/routes/(admin)/+layout.server.ts:10-12`
- The two admin destinations are duplicated as literal href/label pairs in the layout and again in the index page instead of one shared list — `src/routes/(admin)/+layout.svelte:7-20`, `src/routes/(admin)/admin/+page.svelte:13-41`
- The layout uses the Svelte 4 `export let data` + `<slot />` style, unlike the runes-based layouts elsewhere — `src/routes/(admin)/+layout.svelte:5,61`
- A fully broken database still yields 200 `{openBugs:0,openPhrases:0}` from `/api/admin`, so a client cannot tell "nothing open" from "counts failed" — `src/lib/server/services/adminData.ts:33-40`
<!-- inventory:end -->

## Carry-over tickets

None.

## Plan

### New files (S3–S7)

| file | role | contents |
|---|---|---|
| `admin.contract.ts` | contract | `AdminCounts` zod schema + type: `{ openBugs: whole, openPhrases: whole }` for the `/api/admin` body; the layout and component props infer from it. |
| `admin.sections.rules.ts` | rules | `ADMIN_SECTIONS` — the closed, ordered list (href, label, count key, badge classes); `isAdminSectionActive(pathname, href)` — exact path or child path. |
| `admin.sections.rules.test.ts` | test | Tables: active on `/admin/bugs` and `/admin/bugs/42`, inactive on `/admin`, `/admin/nlpx`, `/adminx`; the list's order, hrefs and count keys. |
| `admin.service.server.ts` | service | `getAdminCounts(ctx)`: `Promise.all` over feedback's two open-count services, each leg wrapped by a local `degradeToZero` that logs `ctx.log.warn('admin_count_failed', { leg })` and returns 0. No fault filing: a degraded badge is not a bug report. |
| `admin.service.db.test.ts` | test | Open-only counts from seeded feedback rows; zeros with no rows; a ctx whose db fails one count query yields the other real count and 0, with one warning. |
| `admin.http.server.ts` | http | `adminCountsEndpoint = endpoint({ auth: 'admin', handle })`; `adminLayoutLoad = pageLoad({ auth: 'admin', handle })` returning `AdminCounts`. |
| `admin.http.db.test.ts` | test | S2 goldens, written against the legacy handler now. |
| `ui/AdminShell.svelte` | ui | Runes shell: header, section nav with active state and badges, Back to app, children snippet, Toaster; `data-testid`s; no app chrome. |
| `ui/AdminHome.svelte` | ui | Index heading, subtitle and the two section cards (`N open`) built from `ADMIN_SECTIONS`. |
| `ui/AdminShell.svelte.test.ts`, `ui/AdminHome.svelte.test.ts` | test | Render with counts and with empty data: exact copy, nav order, active state, `0` fallback (S7). |

### Where each legacy export goes

- `isAdminUser` → dies. The rule's one home is kernel `ADMIN_ROLE` / `actor.isAdmin` (`src/lib/kernel/ctx/actor.ts`); `endpoint`/`pageLoad` auth `admin` consult it. No second copy of `roles.includes('admin')`.
- `requireAdminJson` → dies. `endpoint({ auth: 'admin' })` owns the 401 `{"error":"Unauthorized"}` / 403 `{"error":"Forbidden"}` bodies; the golden pins the wording.
- `loadAdminCounts` → `getAdminCounts` here (same shape, same per-leg zero, plus a log line).
- `loadBugReports`, `loadUnmatchedPhrases` → `feedback`'s public server interface (feedback owns the registers; its S1 fixes the names). They leave this module.
- `src/routes/(admin)/+layout.server.ts` → `adminLayoutLoad`; the route keeps `export const load = adminLayoutLoad;` only.
- `src/routes/(admin)/+layout.svelte` → `ui/AdminShell.svelte`; the route keeps `<AdminShell data={data}>{@render children()}</AdminShell>`.
- `src/routes/(admin)/admin/+page.svelte` → `ui/AdminHome.svelte` (the `<svelte:head>` title stays in the route).
- `src/routes/api/admin/+server.ts` → `export const GET = adminCountsEndpoint.handler;`.

### Performance plan (ADR 0010)

Pages this screen owns: `/admin` (index) and the `(admin)` group layout shared by `/admin`, `/admin/bugs` and `/admin/nlp`.

- **Above the fold:** header with the two tabs + count badges; on `/admin`, the heading, subtitle and two cards. Data is exactly `AdminCounts` (two numbers): the layout load runs the two count queries in parallel (`Promise.all`, as legacy does) and nothing else; the index page has no load of its own.
- **Bounded:** each count is one aggregate over one table filtered by one flag (`resolvedAt IS NULL`, `resolved = false`); the index renders no rows. The registers' row lists belong to feedback and are not in this load.
- **Streams / skeletons:** nothing streams and no skeleton is needed — the two numbers are the whole payload and a failed leg renders 0 inline (the degradation rule doubles as the fallback), so the shell always paints in the same response.
- **On demand:** nothing heavy on `/admin`; no modals, editors or server-only libraries are imported, so the page's client JS is the shell plus kernel's Toaster only. Feedback's registers (and their export textareas) load with those pages.
- **Legacy costs found:** the counts are already parallel (no waterfall), so the layout adds one TTFB round-trip. Both counts filter a column with no index (`bug_reports_status_created_idx` is `status, createdAt`; the phrase unique index is `source, phrase`), so they are sequential scans of two small admin-only tables — fine at the budget, and the schema is frozen, so no new index (owner can revisit). Bodies and page data are two numbers: no unbounded payloads.
- **Budget:** desktop ready target 300 ms / hard 1 s; the load is two small-table aggregates plus a static shell. `npm run perf:check -- admin` measures it at S7.

## Notes

- The `/admin` page gate stays in the app's session pipeline: hooks match the `admin` path **segment** and redirect `/login` both with no cookie (before the anonymous-account fallback) and for a signed-in non-admin — verified `src/hooks.server.ts:23-40,64-74,115-120`. This screen does not repeat the segment match; its layout load still uses `pageLoad` auth `admin` as defence in depth, whose non-admin `/calendar` branch is unreachable behind the hook — exactly the legacy layout's dead branch (`src/routes/(admin)/+layout.server.ts:10-12`). The screen's own reachable pin is the `/api` 403.
- `/api/admin` is this screen's only endpoint. `/api/admin/bugs`, `/api/admin/bugs/[id]/resolve`, `/api/admin/nlp` and `/api/admin/nlp/[id]/resolve` belong to feedback and must use `endpoint` auth `admin` too, so the 401/403 pair keeps one implementation; their goldens live in feedback's sheet.
- `src/lib/server/services/adminData.ts` is kept until S8: eight route files read its register exports and several belong to feedback, which is not ported in this worktree. Feedback's S8 removes its reads; this screen's S8 deletes the file and the legacy `src/routes/api/admin/server.test.ts` once no importer remains.
- "Probably accidental" decisions:
  - Duplicate destination lists (layout + index page) — dropped; `ADMIN_SECTIONS` is one home.
  - Svelte 4 `export let` + `<slot />` layout — replaced with runes; internal.
  - Two redirect targets for a signed-in non-admin — unchanged in effect (the hook's `/login` is the only reachable one); the layout's `/calendar` call stays as a dead defence-in-depth branch, so a direct load without hooks behaves like legacy.
  - A fully broken database still answers `200 {openBugs:0,openPhrases:0}`, indistinguishable from "nothing open" — kept; see owner question 1. The degradation is logged (`admin_count_failed`) so monitoring can see what clients cannot.
- There is no `admin.fixtures.server.ts`: the screen owns no rows. Service and http tests seed feedback's `bugReports` / `unmatchedPhrases` rows directly, because feedback owns those tables.
- The golden test's failing-leg case drops the `resolved` column of `unmatchedPhrases` for one request — dropping the column the count filters on makes that leg's read fail while the other leg still counts real rows — and the `finally` block restores the exact column definition (the re-added column sits last, which no query depends on because every query names its columns); the db project runs one file at a time in a single fork (`vite.config.ts`), so no other test observes the change.
- CONTEXT.md uses **admin** only for a Family Member's membership role; this screen's `admin` is the global `admin` role on the user row (kernel `ADMIN_ROLE`). Two different concepts share one spelling — owner question 2.

### Questions for the owner

1. Should `/api/admin` distinguish "counts failed" from "nothing open"? Context: both legs degrade to 0, so the shell cannot tell (§ Probably accidental). Options: (a) keep `200` with zeros and log only — recommendation: this; the badges are chrome and no installed client reads the field; (b) add `degraded: { openBugs?: true, openPhrases?: true }` — a wire addition with no client need; (c) answer 503 when both legs fail — breaks the "never 500" rule. Recommendation: (a) now, revisit if monitoring needs the signal.
2. Should the global `admin` role and a Family Member's `admin` membership role get distinct names in CONTEXT.md? Context: "Family Member" defines the membership role `creator | admin | member`, while this screen reads the user row's `roles`, a different concept. Options: (a) name the global one **Instance Admin** (or similar) in CONTEXT.md and the sheets; (b) leave the docs as they are. Recommendation: (a) at the next CONTEXT.md pass — no code change either way; this screen's rule is already kernel `ADMIN_ROLE`.

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# admin: 0% ported

legacy source files left (1/1, 55 LOC):
  - src/lib/server/services/adminData.ts (55 LOC, server) importers: 8

route files not yet wiring-only (4/4):
  - src/routes/(admin)/+layout.server.ts  /
  - src/routes/(admin)/+layout.svelte  /
  - src/routes/(admin)/admin/+page.svelte  /admin
  - src/routes/api/admin/+server.ts  /api/admin

legacy test files left (1/1) — reference only, kinds explained in docs/architecture/testing.md:
  - src/routes/api/admin/server.test.ts [route, 4 tests]
```
<!-- census:end -->
