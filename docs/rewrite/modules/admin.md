# Port sheet: admin

**screen** · port #19 · home: `src/lib/screens/admin/` · README after the port: `src/lib/screens/admin/README.md` (written in S1)

Admin shell: tab layout and badge counts (registers themselves live in feedback).

- **May import:** kernel + any domain (public entries); never another screen.
- **Owns tables:** none.
- **Must be ported first:** feedback (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [x] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [x] S2 `/api` goldens, green on legacy — S2 commit sha: `66a11131`
- [x] S3 contract + rules
- [x] S4 repo (skipped: a screen owns no tables)
- [x] S5 service
- [x] S6 http + route wiring (goldens unchanged since S2)
- [x] S7 UI rebuild (rules, api, state, components, screen) + visual check — visual/perf checks are the orchestrator's
- [x] S8 rewire importers, delete legacy code and legacy tests
- [x] S9 README final, census --write, gate:push, ledger done

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

`/api/admin/bugs`, `/api/admin/bugs/[id]/resolve`, `/api/admin/nlp` and `/api/admin/nlp/[id]/resolve` belong to feedback; they use `endpoint` auth `admin` too, so the 401/403 pair keeps one implementation — `feedback.http.db.test.ts` › "answers 401 when signed out and 403 for a signed-in non-admin".

### Rules the module must keep
- The admin gate is segment-based (`/admin` anywhere in the path) and runs in hooks BEFORE the anonymous-account fallback: no cookie on an admin route → 302 `/login`, never a freshly created Anonymous Account — `src/hooks.server.ts:21-40,64-72`
- A signed-in non-admin on an admin route is redirected 302 `/login` by hooks; the layout repeats the check (no user → `/login`, non-admin → `/calendar`) — `src/hooks.server.ts:118-120`, `src/routes/(admin)/+layout.server.ts:6-15`
- Admin means the `admin` role on the user row, nothing else (`isAdminUser`) — `src/lib/server/services/adminData.ts:15-18`
- The layout loads the two badge counts through `guard('admin-counts', 0, …)` per leg, so a failing count degrades to 0 instead of 500ing every admin page — `src/lib/server/services/adminData.ts:33-40`, `src/routes/(admin)/+layout.server.ts:13-14` · test: `admin.http.db.test.ts` › "degrades a failing count leg to 0 instead of 500ing the badges"
- The JSON guard returns 401 without a user and 403 `Forbidden` for a signed-in non-admin, before any register is read or resolved — `src/lib/server/services/adminData.ts:20-31` · test: `admin.counts.http.db.test.ts` › "answers 401 … without a session", "answers 403 … for a signed-in non-admin"; the golden's cookie/Bearer rows keep the wire variant
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
| `admin.service.server.ts` | service | `getAdminCounts(ctx)`: feedback's two open-count services one leg after the other (`openBugReportCount`, then `openUnmatchedPhraseCount`), each wrapped by a local `degradeToZero` that logs `ctx.log.warn('admin_count_failed', { leg })` and returns 0. No fault filing: a degraded badge is not a bug report. |
| `admin.service.db.test.ts` | test | Open-only counts from seeded feedback rows; zeros with no rows; a query that fails for one leg (its WHERE column dropped for the rolled-back transaction) yields the other real count and 0, with one `admin_count_failed` warning and no fault. |
| `admin.http.server.ts` | http | `adminCountsEndpoint = endpoint({ auth: 'admin', handle })`; `adminLayoutLoad = pageLoad({ auth: 'admin', handle })` returning `AdminCounts`. |
| `admin.http.db.test.ts` | test | S2 goldens, written against the legacy handler now; unchanged after S6. |
| `admin.pages.http.db.test.ts` | test | The `(admin)` layout load through `invokeLoad`: the counts for an admin, and the two legacy redirects (`302 /login`, `302 /calendar`). |
| `admin.counts.http.db.test.ts` | test | `GET /api/admin`'s gate against the ported handler: 401 without a session, 403 for a signed-in non-admin, the counts for an admin (replaces the deleted legacy route test). |
| `ui/AdminShell.svelte` | ui | Runes shell: header, section nav with active state and badges, Back to app, children snippet, Toaster; `data-testid`s; no app chrome. |
| `ui/AdminHome.svelte` | ui | Index heading, subtitle and the two section cards (`N open`) built from `ADMIN_SECTIONS`. |
| `ui/AdminShell.svelte.test.ts`, `ui/AdminHome.svelte.test.ts` | test | Render with counts and with empty data: exact copy, nav order, active state, `0` fallback (S7). |

### Where each legacy export goes

- `isAdminUser` → dies. The rule's one home is kernel `ADMIN_ROLE` / `actor.isAdmin` (`src/lib/kernel/ctx/actor.ts`); `endpoint`/`pageLoad` auth `admin` consult it. No second copy of `roles.includes('admin')`.
- `requireAdminJson` → dies. `endpoint({ auth: 'admin' })` owns the 401 `{"error":"Unauthorized"}` / 403 `{"error":"Forbidden"}` bodies; the golden pins the wording.
- `loadAdminCounts` → `getAdminCounts` here (same shape, same per-leg zero, plus a log line).
- `loadBugReports`, `loadUnmatchedPhrases` → `feedback`'s public server interface: `listFeedback(ctx, actor, 'bug' | 'phrase')` (the register read) and `resolveFeedback(ctx, actor, kind, id)` (the page action's write). They leave this module. Register read and resolve, never feedback's repo.
- `src/routes/(admin)/admin/bugs/+page.server.ts` → `adminBugRegisterPageLoad` + `{ resolve: adminResolveBugReportAction }`; `src/routes/(admin)/admin/bugs/+page.svelte` → `ui/AdminBugRegister.svelte`.
- `src/routes/(admin)/admin/nlp/+page.server.ts` → `adminPhraseRegisterPageLoad` + `{ resolve: adminResolveUnmatchedPhraseAction }`; `src/routes/(admin)/admin/nlp/+page.svelte` → `ui/AdminPhraseRegister.svelte`.
- `src/routes/(admin)/+layout.server.ts` → `adminLayoutLoad`; the route keeps `export const load = adminLayoutLoad;` only.
- `src/routes/(admin)/+layout.svelte` → `ui/AdminShell.svelte`; the route keeps `<AdminShell pathname={page.url.pathname} openBugs={data.openBugs} openPhrases={data.openPhrases}>{@render children()}</AdminShell>` (the path from `$app/state`).
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
- S5 legs run sequentially, not in `Promise.all` as the plan first said: `ctx.db` may be one transaction session (feedback's `countOpenFeedback` documents the same constraint), and a failed leg must leave the other's real count standing. The golden's failing-leg case still passes — the bug count returns before the phrase read fails.
- Per-leg counts needed one feedback change, recorded here because it crosses modules: `feedback`'s public interface had only `countOpenFeedback(ctx)` (both reads in one call), which cannot keep the other count alive when one leg throws, so the frozen `/api/admin` golden (`{openBugs:1, openPhrases:0}` with the phrase column dropped) could not pass. Feedback's S5 now splits it into `openBugReportCount(ctx)` / `openUnmatchedPhraseCount(ctx)` (owner-approved; `countOpenFeedback` composes them, behaviour unchanged), each with its own `rollbackTest`, exported from feedback's `index.server.ts` and documented in feedback's README. This screen imports those two through the entry, never the repo.
- `/api/admin` is this screen's only endpoint; `/api/admin/bugs`, `/api/admin/bugs/[id]/resolve`, `/api/admin/nlp` and `/api/admin/nlp/[id]/resolve` belong to feedback and must use `endpoint` auth `admin` too, so the 401/403 pair keeps one implementation; their goldens live in feedback's sheet. The register pages' loads and `?/resolve` actions are page handlers (`pageLoad` / `formAction` auth `admin`), not endpoints.
- `src/lib/server/services/adminData.ts` was kept until S8 if the register page handlers still read it; it is **deleted in S8** once both pages moved to feedback's public service (see the S8 note).
- The legacy route test `src/routes/api/admin/server.test.ts` is **deleted** in S6 (security fix F1): it mocked legacy actions the ported handlers never read and never handed the kernel endpoint a `locals.ctx`, so it could no longer reach `/api/admin`'s gate. The gate is pinned by `admin.counts.http.db.test.ts` (401/403/counts) and the S2 golden's cookie/Bearer rows; feedback's register endpoints keep their own goldens.
- "Probably accidental" decisions:
  - Duplicate destination lists (layout + index page) — dropped; `ADMIN_SECTIONS` is one home.
  - Svelte 4 `export let` + `<slot />` layout — replaced with runes; internal.
  - Two redirect targets for a signed-in non-admin — unchanged in effect (the hook's `/login` is the only reachable one); the layout's `/calendar` call stays as a dead defence-in-depth branch, so a direct load without hooks behaves like legacy.
  - A fully broken database still answers `200 {openBugs:0,openPhrases:0}`, indistinguishable from "nothing open" — kept; see owner question 1. The degradation is logged (`admin_count_failed`) so monitoring can see what clients cannot.
- There is no `admin.fixtures.server.ts`: the screen owns no rows. Service and http tests seed feedback's `bugReports` / `unmatchedPhrases` rows directly, because feedback owns those tables.
- The golden test's failing-leg case drops the `resolved` column of `unmatchedPhrases` for one request — dropping the column the count filters on makes that leg's read fail while the other leg still counts real rows — and the `finally` block restores the exact column definition (the re-added column sits last, which no query depends on because every query names its columns); the db project runs one file at a time in a single fork (`vite.config.ts`), so no other test observes the change.
- CONTEXT.md uses **admin** only for a Family Member's membership role; this screen's `admin` is the global `admin` role on the user row (kernel `ADMIN_ROLE`). Two different concepts share one spelling — owner question 2.
- **S7 UI decisions (2026-11-21).** Files: `ui/AdminShell.svelte`, `ui/AdminHome.svelte`, `ui/AdminBugRegister.svelte`, `ui/AdminPhraseRegister.svelte`, `admin.toasts.state.svelte.ts`, plus their tests; the four route files under `(admin)/` are now wiring only (ten non-blank lines or fewer each) and `src/routes/api/admin/+server.ts` was already `export const GET = adminCountsEndpoint.handler;`.
  - **The register page bodies live here, not in feedback.** Feedback's S7 supplied the reusable register body (`FeedbackRegister`), the export panel (`FeedbackExport`), the two state classes and the browser api; this screen owns each page's heading, subtitle, spacing and the state's construction, which is exactly the split feedback's sheet planned ("the page shell belongs to the admin screen").
  - **Two page components, not one `kind` prop.** `AdminBugRegister` and `AdminPhraseRegister` each build their own state class with their own typed page data; one union-typed component would need discriminants and assertions to reach the same place. The shared part is already feedback's `FeedbackRegister`/`FeedbackExport`, so the duplication left is the heading and one wrapper div.
  - **`AdminShell` takes `pathname` as a prop.** Components never read `$app/*` (port-ui), so the route layout reads `$app/state` and passes the path; the active rule is `isAdminSectionActive`.
  - **The section list grew two presentational fields.** `ADMIN_SECTIONS` now carries each card's `icon` and `blurb` as well as href/label/count/badge, so the nav, the cards and the active rule read one list; the alternative (a second per-href copy table in `AdminHome`) would have re-created exactly the drift the list removes.
  - **One toast list, `admin.toasts.state.svelte.ts`.** Kernel's `Toaster` renders a list and the export panel/resolve push into it, so the shell and the pages must share one; legacy used one module-level list too (`$lib/client/toasts.ts`). It is a module-level runes store rather than a class because nothing about a list needs instance state; the `.state` role is the schema's only fit for a `.svelte.ts` module (R15).
  - **The page `?/resolve` action is kept although the rebuilt UI does not post it.** The register resolves through `POST /api/admin/{bugs,nlp}/{id}/resolve` optimistically (issue 262); the form action preserves the legacy route surface (`{ success: true }`, unknown and blank id included) and is pinned by `admin.pages.http.db.test.ts`.
  - **Two refusals changed shape, both intentional.** The register loads use kernel `pageLoad` auth `admin`, whose non-admin branch is `302 /calendar` where legacy pages redirected `/login`; behind the hook (which redirects every `/admin` path to `/login`) both are unreachable, exactly like the layout's dead branch. The page actions answer the kernel's `fail(403, { success: false, error: 'Forbidden' })` instead of throwing `error(403, 'Forbidden')`; the reachable refusal for a non-admin remains the hook, and the allow-list is unchanged (admin role only).
  - **Visual baselines: none existed to move.** The harness names a snapshot `__screenshots__/<project>/<module>-<name>.png` (`snapshotPathTemplate` in `playwright.pages.config.ts`; `visual.spec.ts` passes `<module>-<name>.png` to `toHaveScreenshot`), so moving the catalog entries changes the two register pages' expected files from `feedback-admin-bugs.png` / `feedback-admin-nlp.png` to `admin-admin-bugs.png` / `admin-admin-nlp.png` in both `desktop/` and `mobile/`; `admin-admin-home.png` is unaffected. Neither the feedback-prefixed files nor any other admin image exist: the repo's history on every branch contains only `groceries-groceries.png` (`git log --all -- '*.png'`), and all 109 registered worktrees hold only those two groceries files. So nothing was moved. The orchestrator should capture the legacy look from the pre-port commit `51bbc0a6` (`npm run visual:baseline -- admin` there) and commit the six images before `npm run visual:check -- admin`; `perf-baseline.json` does not exist either, so the module move orphans no JS ceiling.
  - **Expected visual differences from the legacy markup:** the resolved rows now sit in one `<details>` per page (feedback's `FeedbackRegister`), the bug area chip is kernel `Pill tone="danger"` (`font-medium` where legacy used `font-semibold` — feedback recorded the same alignment), and `AdminHome`'s cards keep the legacy Tailwind classes.
  - **The page harness's `ready` selector stays `h1` on all three pages** (each body still renders its legacy heading), so `perf:check -- admin` now measures the register pages too.
- **S8 rewire and deletions (2026-11-21).** Rewired: `src/routes/(admin)/admin/bugs/+page.server.ts` and `…/nlp/+page.server.ts` now re-export `adminBugRegisterPageLoad`/`adminResolveBugReportAction` and `adminPhraseRegisterPageLoad`/`adminResolveUnmatchedPhraseAction`; the two `+page.svelte` files are wiring over the new components; `+layout.svelte` and `admin/+page.svelte` are wiring over `AdminShell`/`AdminHome`. Deleted with their last importer: `src/lib/admin/export.ts`, `src/lib/admin/AdminExport.svelte` (feedback already replaced and tested both) and `src/lib/server/services/adminData.ts`. No legacy admin test survived to delete: `src/lib/admin/export.test.ts`, `AdminExport.svelte.test.ts` and `src/routes/(admin)/admin/bugs/page.svelte.test.ts` went in feedback's S8, and `src/routes/api/admin/server.test.ts` in this screen's S6.
  - **Legacy sources kept, with the reason:** `src/lib/server/db/actions/bugReports.ts` and `unmatchedPhrases.ts` stay because unported code still imports them — `hooks.server.ts` (`createBugReport`), `src/lib/server/utils/apiError.ts`, `src/lib/server/services/autoBugReport.ts` (all APP-03) and `src/routes/api/cron/cleanup/+server.ts` (APP-01). They are feedback's legacy files, not this screen's; their rows are pinned by feedback's tests.
  - **Census stale:** the block below still lists `adminData.ts`, the old route files and a route test that no longer exist. The command is not allowed to this agent; the orchestrator should run `npm run census -- --write`.
- **S9 (2026-11-21).** README Files table covers every file beside it, the Invariants name the pinning test for each UI and page rule, and Depends on lists Calls / Called by. Checks the orchestrator must run for this module: `npm run test:mod -- admin`, `npm run typecheck`, `npm run visual:check -- admin`, `npm run perf:check -- admin`, `npm run census -- --write`, then `npm run gate:push`. No boxes ticked and no LEDGER edit here, per the contract.

### Questions for the owner

1. Should `/api/admin` distinguish "counts failed" from "nothing open"? (Q-084) Context: both legs degrade to 0, so the shell cannot tell (§ Probably accidental). Options: (a) keep `200` with zeros and log only — recommendation: this; the badges are chrome and no installed client reads the field; (b) add `degraded: { openBugs?: true, openPhrases?: true }` — a wire addition with no client need; (c) answer 503 when both legs fail — breaks the "never 500" rule. Recommendation: (a) now, revisit if monitoring needs the signal.
2. Should the global `admin` role and a Family Member's `admin` membership role get distinct names in CONTEXT.md? (Q-085) Context: "Family Member" defines the membership role `creator | admin | member`, while this screen reads the user row's `roles`, a different concept. Options: (a) name the global one **Instance Admin** (or similar) in CONTEXT.md and the sheets; (b) leave the docs as they are. Recommendation: (a) at the next CONTEXT.md pass — no code change either way; this screen's rule is already kernel `ADMIN_ROLE`.

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# admin: 100% ported

legacy source files left (0/1, 0 LOC):

route files not yet wiring-only (0/4):

legacy test files left (0/1) — reference only, kinds explained in docs/architecture/testing.md:
```
<!-- census:end -->
