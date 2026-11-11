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

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

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
