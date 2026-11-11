# Port sheet: shell

**screen** · port #17 · home: `src/lib/screens/shell/` · README after the port: `src/lib/screens/shell/README.md` (written in S1)

App chrome: root + group layouts, nav bars, alert bell slot, offline banner, error page.

- **May import:** kernel + any domain (public entries); never another screen.
- **Owns tables:** none.
- **Must be ported first:** identity, alerts, feedback (from the legacy import graph; see the ledger).
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

- One navigation source (`navItems`): 6 app destinations, desktop hides the bell.
- Root layout is the single `app.css` import (#062); no `bind:` on components (#200).
- Error page: 404 vs 500 branches + report-bug link; offline banner; PWA manifest `start_url /calendar`.
- Anonymous-account countdown banner (90 days, urgent ≤ 14), unverified-email banner, guest-merge banner, time-zone probe once per user.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
none (shell owns no `/api/**` route; its logout form posts to `/api/logout`, which belongs to identity).

### Rules the module must keep
- There is one app destination list: six entries (`/calendar?dashboardView=1`, `/calendar/dashboard`, `/calendar/tasks`, `/calendar/groceries`, `/calendar/notifications`, `/family`); `loggedInNavItems` drops the bell-replaced item, `bottomNavItems` keeps all six — `src/lib/utils/navItems.ts:35-76` · test: `src/lib/utils/navItems.test.ts` › "ships the marketing + app item sets", "never hides a destination from the tab bar that the desktop nav shows"
- Alerts is the only permitted difference: the desktop nav represents it as the bell, the tab bar as a tab (`bellInstead`) — `src/lib/utils/navItems.ts:55-63,73-76` · test: `src/lib/utils/navItems.test.ts` › "keeps alerts in the tab bar — the bell is desktop-only"
- Every tab needs an icon and a label of at most 9 characters (`shortLabel` where needed, e.g. Groceries → "Shop") — `src/lib/utils/navItems.ts:1-20,70-71` · test: `src/lib/utils/navItems.test.ts` › "gives every tab an icon and a label that fits a 320px bar"
- Active state is longest-prefix-wins on the pathname only, so `/calendar/tasks/abc` highlights Tasks and `/calendars` matches nothing; query-carrying hrefs still highlight — `src/lib/utils/navItems.ts:78-92` · test: `src/lib/utils/navItems.test.ts` › "lets the longest prefix win so /calendar/tasks highlights Tasks", "does not match partial segments (/calendars ≠ /calendar)"
- The marketing nav is the fixed four `/features`, `/pricing`, `/about`, `/contact` — `src/lib/utils/navItems.ts:22-27` · test: `src/lib/utils/navItems.test.ts` › "ships the marketing + app item sets"
- Any completed navigation closes both menus (bell goto, bottom tab, logo), not just clicks on menu links; Escape and an outside click close the profile dropdown — `src/lib/components/Navbar.svelte:25-50,69-73` · test: `src/lib/components/Navbar.svelte.test.ts` › "closes the mobile menu when any navigation completes"
- The Report-a-Bug link carries the current path plus search as `?from=` (path only while `building`), never for `/report-bug` itself, and rejects foreign origins/junk — `src/lib/components/Navbar.svelte:57-58`, `src/lib/utils/reportBug.ts:1-41` · test: `src/lib/components/Navbar.svelte.test.ts` › "passes the current path as ?from="
- Logout is a plain `POST /api/logout` form; on submit it fire-and-forgets `{type:'purge-data-cache'}` to the service worker controller so cached authed data is dropped — `src/lib/components/Navbar.svelte:38-42`, `src/lib/components/NavbarProfileMenu.svelte:88-94`
- The root layout is the single `app.css` import for the whole app (#062); no group imports a global stylesheet — `src/routes/+layout.svelte:1-14`
- Never `bind:` a component prop: the offline banner reports visibility through `onVisibleChange`, and only the banner-stack `<div>` uses `bind:clientHeight` (#200) — `src/routes/(calendar)/calendar/+layout.svelte:81-94,143-148`
- `<main>` is offset by the measured height of the fixed banner stack (40px guess before first measurement), not a fixed margin (#259) — `src/routes/(calendar)/calendar/+layout.svelte:88-94,266-269` · test: `src/routes/(calendar)/calendar/layout.svelte.test.ts` › "offsets main by the measured banner-stack height, not a fixed mt-10"
- `(calendar)` and `(family)` groups require a user: both redirect 302 `/login` when `locals.user` is absent; the calendar layout additionally loads `userSettings`, `familyId`, `familyMembers` once per group entry via `loadUserScope` — `src/routes/(calendar)/calendar/+layout.server.ts:5-21`, `src/routes/(family)/+layout.server.ts:5-13`
- Time-zone probe runs at most once per user per browser: only when settings timeZone is still `'UTC'`, gated by `localStorage['familyplanz:tzProbed:<userId>']`, then `POST /calendar/setUserDefaultTimeZone` with `keepalive` and `invalidateAll()` — `src/routes/(calendar)/calendar/+layout.svelte:17-49`
- Anonymous Account countdown is the 90-day Inactivity Window from `lastActiveAt`, rounded up and floored at 0 (no `lastActiveAt` → 90); urgent at ≤ 14 days switches amber copy to red and shows the days left — `src/routes/(calendar)/calendar/+layout.svelte:51-58,247-263`
- Top-notice precedence is a single `else-if` chain: `?claimed=1` success → unverified email → `?merged=N&tasks=M` success → anonymous countdown; the first three are dismissable, the anonymous one is not — `src/routes/(calendar)/calendar/+layout.svelte:59-80,149-264`
- The unverified-email banner is self-sufficient: inline code input posts `/signup/password/verify`, Resend posts `/signup/password/resend`, errors render inline, "Sent again ✓" clears after 3 s — `src/routes/(calendar)/calendar/+layout.svelte:65-136,165-226`
- Guest-merge banner pluralises `mergedCount` and only mentions tasks when `tasks > 0` — `src/routes/(calendar)/calendar/+layout.svelte:227-246`
- OfflineBanner is visible while offline, while changes are pending, or while the "Synced N changes." receipt (4 s) is up; the offline paragraph renders only when actually offline; coming back online re-reads pending counts after 2 s — `src/lib/components/OfflineBanner.svelte:17-84` · test: `src/lib/components/OfflineBanner.svelte.test.ts` › "does not claim \"offline\" while online with changes pending", "shows the offline explanation when offline"
- BottomNav fetches `/api/notifications` only for a logged-in user, treats non-ok/throw as `0`, re-fetches on every route change and on `visibilitychange`, and caps the badge at `99+` with the accessible name `Alerts (n unread)` — `src/lib/components/BottomNav.svelte:21-72,124-150` · test: `src/lib/components/BottomNav.svelte.test.ts` › "does not fetch the badge for guests", "shows the unread badge when logged in", "hides the badge when the summary fetch fails"
- BottomNav hides (class-only, never unmounts) while the on-screen keyboard is open, detected as `innerHeight - visualViewport.height > 150` — `src/lib/components/BottomNav.svelte:75-107`
- The error page has three branches: 404 ("We can't find that page"), other 4xx (shows `$page.error.message`, never claims notification), 5xx (claims automatic notification and adds the report CTA); only the 5xx branch links `reportBugHref` — `src/routes/+error.svelte:6-23,66-73` · test: `src/routes/error.svelte.test.ts` › "shows the reason for a 4xx and does not claim we were notified", "keeps the notified copy and report CTA for 5xx"
- The PWA manifest's `start_url` is `/calendar` — `static/manifest.webmanifest:5`, `src/app.html:7-8`
- Touch targets: the mobile hamburger is 44×44 (`h-11 w-11`), and both navs use `env(safe-area-inset-*)` padding — `src/lib/components/Navbar.svelte:142-152,76`, `src/lib/components/BottomNav.svelte:129` · test: `src/lib/components/Navbar.svelte.test.ts` › "gives the mobile hamburger a 44px square target"

### Page and UI behaviour worth keeping
- Desktop header: wordmark → `/`, inline nav links (preload on hover), bell + avatar dropdown when logged in, "Sign In" and "Get Started" when not; mobile hamburger with Open/Close menu labels — `src/lib/components/Navbar.svelte:75-181`
- Profile dropdown (focus-trapped, 150 ms slide): signed-in name/email header only for registered accounts (never the anonymous placeholder), admin-only Admin/Bug Reports links, Settings, Family Management, Task Stats, Archive, Report a Bug, red Logout — `src/lib/components/NavbarProfileMenu.svelte:22-95` · test: `src/lib/components/NavbarProfileMenu.svelte.test.ts` › "never shows a guest the #196 placeholder email (#242)", "gates admin links on the admin role"
- Mobile menu (200 ms slide): bell row for logged-in users, the nav list with active highlight, then Settings / Task Stats / Archive / Report a Bug / admin links, then Logout or Sign In + Get Started — `src/lib/components/NavbarMobileMenu.svelte:29-115` · test: `src/lib/components/NavbarMobileMenu.svelte.test.ts` › "shows sign-in CTAs for guests", "highlights the active item for logged-in users"
- Calendar shell: fixed navbar, one fixed banner stack (offline + notices) under it, bottom tab bar, Toaster, and an md-only fixed footer (© year, About, Privacy, Contact) — `src/routes/(calendar)/calendar/+layout.svelte:139-287`
- Family shell: navbar + non-stacked OfflineBanner + main + bottom tab bar + Toaster; no footer — `src/routes/(family)/+layout.svelte:18-28`
- OfflineBanner copy: offline explains the recent-months cache and auto-sync; pending copy is `N changes waiting to sync.`; success copy is `Synced N changes.` — `src/lib/components/OfflineBanner.svelte:66-83`
- 404/4xx/5xx card keeps "Back to calendar" as the primary action and renders status as `Error {status}` with `<title>{status} · Family Planz</title>` — `src/routes/+error.svelte:26-75`
- Breadcrumbs render chevrons between crumbs, links for every crumb except the last, and the last in bold slate-900 — `src/lib/components/Breadcrumbs.svelte:1-32`

### Probably accidental (candidates to drop, owner to confirm)
- `NavbarMobileMenu` imports `trapFocusAction` but never applies it, so the mobile menu has no focus trap while the profile dropdown does — `src/lib/components/NavbarMobileMenu.svelte:4`, `src/lib/components/NavbarProfileMenu.svelte:23`
- Layouts mix conventions: calendar uses runes + `children` snippet, while `(family)` and account use `export let data` + `<slot />` — `src/routes/(calendar)/calendar/+layout.svelte:15`, `src/routes/(family)/+layout.svelte:11-24`
- `(family)` renders a non-stacked OfflineBanner fixed at `top: calc(4rem + safe-area)` while `<main>` only gets static padding, so the banner can cover page content — `src/routes/(family)/+layout.svelte:20-21`, `src/lib/components/OfflineBanner.svelte:61-63`
- The time-zone probe writes its "already probed" flag before the request, so a failed POST is never retried for that user/browser — `src/routes/(calendar)/calendar/+layout.svelte:28-46`
- `NavbarProfileMenu`/`NavbarMobileMenu` default `reportBugHref` to `/report-bug`, silently dropping `?from=` if a caller omits the prop — `src/lib/components/NavbarProfileMenu.svelte:19`, `src/lib/components/NavbarMobileMenu.svelte:25`
- `(calendar)/calendar/+layout.server.ts` and `(marketing)/+layout.server.ts` start with a stale `// +page.server.ts` comment — `src/routes/(calendar)/calendar/+layout.server.ts:1`
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
# shell: 0% ported

legacy source files left (7/7, 786 LOC):
  - src/lib/components/BottomNav.svelte (181 LOC, ui) importers: 3
  - src/lib/components/Breadcrumbs.svelte (32 LOC, ui) importers: 9
  - src/lib/components/Navbar.svelte (183 LOC, ui) importers: 5
  - src/lib/components/NavbarMobileMenu.svelte (116 LOC, ui) importers: 1
  - src/lib/components/NavbarProfileMenu.svelte (96 LOC, ui) importers: 1
  - src/lib/components/OfflineBanner.svelte (86 LOC, ui) importers: 3
  - src/lib/utils/navItems.ts (92 LOC, model) importers: 3

route files not yet wiring-only (6/6):
  - src/routes/(calendar)/calendar/+layout.server.ts  /calendar
  - src/routes/(calendar)/calendar/+layout.svelte  /calendar
  - src/routes/(family)/+layout.server.ts  /
  - src/routes/(family)/+layout.svelte  /
  - src/routes/+error.svelte  /
  - src/routes/+layout.svelte  /

legacy test files left (8/8) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/components/BottomNav.svelte.test.ts [component, 7 tests]
  - src/lib/components/Navbar.svelte.test.ts [component, 3 tests]
  - src/lib/components/NavbarMobileMenu.svelte.test.ts [component, 3 tests]
  - src/lib/components/NavbarProfileMenu.svelte.test.ts [component, 4 tests]
  - src/lib/components/OfflineBanner.svelte.test.ts [component, 2 tests]
  - src/lib/components/propsDestructure.test.ts [pure, 2 tests]
  - src/lib/utils/navItems.test.ts [pure, 11 tests]
  - src/routes/error.svelte.test.ts [component, 3 tests]
```
<!-- census:end -->
