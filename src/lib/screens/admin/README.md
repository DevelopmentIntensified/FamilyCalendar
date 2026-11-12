# admin

**screen** — Admin shell: tab layout and badge counts (registers themselves live in feedback).

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns: the admin area's frame — header, the two section tabs with their open-count badges, "← Back to app", and the Toaster; the `/admin` index page's heading and two section cards.
- Owns: the one badge-count read that both the `(admin)` layout data and `/api/admin` answer with, including the per-leg rule that a failing count reads 0 instead of failing the page or the JSON call.
- Does not own: the bug-report and unmatched-phrase registers (rows, resolve actions, exports) — those belong to `feedback`. This screen never touches their tables; it asks `feedback` for the two counts.
- Does not own: the `/admin` page gate. The app's session pipeline (hooks) redirects `/admin` document requests; this screen only makes the reachable `/api/admin` check explicit through `endpoint` auth `admin`. The global `admin` role rule itself is kernel's `actor.isAdmin`, built once from the user row.

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: `AdminCounts` and the closed, ordered section list (`ADMIN_SECTIONS`) that the shell and the index cards both render, so the destinations cannot drift apart. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: `getAdminCounts` (the per-leg-degrading composition), `adminCountsEndpoint` (`GET /api/admin`) and `adminLayoutLoad`. | — |
| [ui/index.ts](ui/index.ts) | entry | Public components: `AdminShell` (the frame) and `AdminHome` (the index cards). | — |
| [admin.http.db.test.ts](admin.http.db.test.ts) | test | Golden contract for `GET /api/admin`: the full body, both refusals for cookie and Bearer callers, and a failing count leg degrading to 0. Written against the legacy handler, so it runs unchanged after the port. | itself (db project, committed mode) |

## Public interface

Designed in S1, before the code. `AdminCounts`, `ADMIN_SECTIONS` and `getAdminCounts` each have two or more callers, so deleting one would paste its body unchanged into each (the deletion test). `adminCountsEndpoint` and `adminLayoutLoad` are the builder definitions their route files re-export (conventions: no logic in routes); the two components are the screen's markup, kept under `ui/` per the file-role table.

- `index.ts`:
  - `AdminCounts` — `{ openBugs: number; openPhrases: number }` (from `admin.contract.ts`). The layout model, the shell badges and the `/api/admin` body share this one shape, so the nav and the JSON cannot disagree.
  - `ADMIN_SECTIONS` — the closed, ordered list of admin sections: href, label, which count key feeds its badge, and the badge colours. Bug Reports (red, `openBugs`) first, Unmatched Phrases (slate, `openPhrases`) second. One home for the destinations the legacy layout and index page each hard-coded.
- `index.server.ts`:
  - `getAdminCounts(ctx)` → `AdminCounts` — reads `feedback`'s two open counts in parallel; each leg independently degrades to 0 and logs a warning. The single composition behind both the layout data and `/api/admin`.
  - `adminCountsEndpoint` — `GET /api/admin`: `endpoint` with auth `admin`, no input, body `AdminCounts`.
  - `adminLayoutLoad` — the `(admin)` group layout `load`: `pageLoad` with auth `admin`, returning `AdminCounts` as the layout data the shell consumes (the shell still renders 0 for a missing count).
- `ui/index.ts`:
  - `AdminShell` — the admin frame: header with `🛠 Admin` (aria-label "Admin home"), the section nav (aria-label "Admin sections") with active state and count badges, "← Back to app" → `/calendar`, a children snippet, and the Toaster. No app Navbar, BottomNav or breadcrumbs.
  - `AdminHome` — the `/admin` index: heading "Admin", subtitle "Triage user feedback and parser gaps.", and the two section cards with `N open` badges.

## How to test

- Whole module: `npm run test:mod -- admin` (add `--legacy` while legacy tests remain).
- Pure rules: `admin.sections.rules.test.ts`, plain tables of input → expected output, no setup.
- Database + services: `admin.service.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: `admin.http.db.test.ts` pins status + body of `GET /api/admin` (golden tests, committed mode because the legacy handler writes through the legacy `db` singleton).
- UI: `ui/*.svelte.test.ts` render with props; the shell's active-section rule is tested without a DOM in `admin.sections.rules.test.ts`.
- Fixtures: none — the screen owns no rows, so db tests seed `feedback`'s `bugReports` / `unmatchedPhrases` rows directly.

## Invariants

Behaviour that must not change, each with the test that pins it (`file › test title`):

- `GET /api/admin` answers `200 { openBugs, openPhrases }` for an admin, counting only open rows: bug reports with `resolvedAt` null and phrases with `resolved:false`; resolved rows never count — evidence `src/lib/server/services/adminData.ts:33-40`, `src/lib/server/db/actions/bugReports.ts:89-95`, `src/lib/server/db/actions/unmatchedPhrases.ts:103-109` · `admin.http.db.test.ts › returns the open badge counts for an admin`.
- `GET /api/admin` answers `401 {"error":"Unauthorized"}` with no session and no token — evidence `src/lib/server/services/adminData.ts:24-26` · `admin.http.db.test.ts › answers 401 …`.
- `GET /api/admin` answers `403 {"error":"Forbidden"}` for a signed-in non-admin, whether the caller used the session cookie or a Bearer token, before any count is read — evidence `src/lib/server/services/adminData.ts:20-31`; Bearer bypasses the hook gate at `src/hooks.server.ts:47-61`, so the route itself must check · `admin.http.db.test.ts › answers 403 … (cookie)` and `› … (Bearer)`.
- A Bearer token owned by an admin reads the counts; the route, not the hook, decides — evidence `src/lib/server/services/adminData.ts:24-31`, `src/hooks.server.ts:47-61` · `admin.http.db.test.ts › lets an admin Bearer token read the counts`.
- A failing count leg yields 0 and the call still answers 200; one broken leg never takes the other down — evidence `src/lib/server/services/adminData.ts:33-40`, `src/lib/server/utils/guard.ts:14-22` · `admin.http.db.test.ts › degrades a failing count leg to 0 …`; the service test repeats it with a failing ctx.
- Admin means the global `admin` role on the user row and nothing else (a Family Member's membership role `admin` is a different word) — evidence `src/lib/server/services/adminData.ts:15-18`; one home is kernel `ADMIN_ROLE`/`actor.isAdmin` · `admin.http.db.test.ts › answers 403 … (cookie)`.
- An `/admin` document request with no session cookie gets `302 /login` before any Anonymous Account is created — evidence `src/hooks.server.ts:64-74` · the app module owns this gate; pinned by `src/lib/app`'s request-pipeline test (planned APP-03), not by this screen.
- A signed-in non-admin on any path containing the `admin` segment gets `302 /login` from the hook; the layout's own non-admin → `/calendar` branch is unreachable behind it — evidence `src/hooks.server.ts:115-120`, `src/routes/(admin)/+layout.server.ts:6-12` · same app request-pipeline test; this screen's reachable refusal is the `/api` 403 above.
- The admin shell has exactly two section tabs, in this order: Bug Reports (badge `openBugs`, red) then Unmatched Phrases (badge `openPhrases`, slate); a tab is active on its exact path or any child path — evidence `src/routes/(admin)/+layout.svelte:7-20,32-51` · `admin.sections.rules.test.ts › marks a tab active on its exact path or a child` + `ui/AdminShell.svelte.test.ts` (S7).
- Admin pages are their own shell: header reads `🛠 Admin` (aria-label "Admin home"), nav aria-label "Admin sections", "← Back to app" → `/calendar` is pushed right, no app Navbar/BottomNav/breadcrumbs, and a Toaster is mounted — evidence `src/routes/(admin)/+layout.svelte:25-63` · `ui/AdminShell.svelte.test.ts` (S7) + the S7 visual check.
- The `/admin` index renders the title `Admin · Family Planz`, heading "Admin", subtitle "Triage user feedback and parser gaps.", and the two cards with exactly the legacy copy and `N open` badges — evidence `src/routes/(admin)/admin/+page.svelte:5-42` · `ui/AdminHome.svelte.test.ts` (S7) + the S7 visual check.
- Counts render as `0` when the layout data omits them (`?? 0`) — evidence `src/routes/(admin)/+layout.svelte:11-19`, `src/routes/(admin)/admin/+page.svelte:21,35` · `ui/AdminShell.svelte.test.ts` and `ui/AdminHome.svelte.test.ts` with empty data (S7).
- The layout data and `/api/admin` answer the same counts from the same composition, so the badges and the JSON cannot disagree — evidence `src/routes/api/admin/+server.ts:5-10`, `src/routes/(admin)/+layout.server.ts:13-14` · `admin.http.db.test.ts › returns the open badge counts for an admin` + `admin.service.db.test.ts`.

## Depends on

- May import: kernel + every domain (public entries only); never another screen.
- Owns tables: none.
- Reads (join only): none.
- Calls: `feedback` — one open-count read per register (the legacy names are `countOpenBugReports`, `countOpenUnmatchedPhrases`; feedback's S1 fixes the final names). Two separate calls, not one combined read, so each badge leg can degrade independently.
- Called by: `src/routes/(admin)/+layout.server.ts`, `src/routes/(admin)/+layout.svelte`, `src/routes/(admin)/admin/+page.svelte` and `src/routes/api/admin/+server.ts` (all wiring only), plus the app's session pipeline, which gates `/admin` document requests before any of them run.
