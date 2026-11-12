# Port sheet: shell

**screen** · port #17 · home: `src/lib/screens/shell/` · README after the port: `src/lib/screens/shell/README.md` (written in S1)

App chrome: root + group layouts, nav bars, alert bell slot, offline banner, error page.

- **May import:** kernel + any domain (public entries); never another screen.
- **Owns tables:** none.
- **Must be ported first:** identity, alerts, feedback (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: n/a (no `/api` route; see Notes)
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

### Load plan (ADR 0010) — every navigation pays for this module

Shell owns no page; it owns the layouts every page pays for. This section records what the root
layout and the two group layouts load today, verified, and what leaves the critical path.

**Per document request (legacy), before any page code runs**

| # | cost | evidence |
|---|---|---|
| 1 | session validation: 2 queries (`authSession` row, then `users` row) plus a sliding-renewal UPDATE at most once a day | `src/lib/server/auth.ts:191,197-207,210-213` |
| 2 | `lastActiveAt` UPDATE at most once an hour, inside the request | `src/hooks.server.ts:108-113` |
| 3 | calendar group: 3 queries, serial (settings → family id → roster) | `src/lib/server/services/userScope.ts:12-22`, `src/routes/(calendar)/calendar/+layout.server.ts:13` |
| 4 | group data serialises the **whole `users` row** — including `passwordHash`, `receiptIngestToken`, `phonenumber` | `src/routes/(calendar)/calendar/+layout.server.ts:17`, `src/lib/server/db/schema.ts:26,38,44` |
| 5 | both group loads return `pathname: event.url.pathname`; reading `url` in a server load makes SvelteKit re-run that load on **every** navigation, so #3 is 3 queries per navigation, not per group entry | `src/routes/(calendar)/calendar/+layout.server.ts:15`, `src/routes/(family)/+layout.server.ts:10` |

#1 and #2 belong to the session pipeline (APP-03), not to shell; shell only reads the summary it
hands over, and adds no query and no write of its own.

**Per app page after hydration (legacy)**

| # | cost | evidence |
|---|---|---|
| 6 | `GET /api/notifications` from the bell — 50 rows **and** the count — then the same 50-row feed every 60 s just to poll a number | `src/lib/components/NotificationBell.svelte:31-45,151-158`, `src/lib/server/db/actions/notifications.ts:39-51` |
| 7 | the same GET again from the tab bar on mount, on every route change and on `visibilitychange` — while the bar is `md:hidden`, so desktop pays for it too | `src/lib/components/BottomNav.svelte:53-76,122` |
| 8 | `GET /api/push/public-key` on every page load, only to know whether "Enable push" can render | `src/lib/components/NotificationBell.svelte:161-168`, `src/lib/utils/pushClient.ts:64-70` |
| 9 | two IndexedDB opens per group entry: the offline replay (`initOfflineSync`) and the banner's pending count | `src/routes/(calendar)/calendar/+layout.svelte:48`, `src/routes/(family)/+layout.svelte:13-15`, `src/lib/utils/offline.ts:207-224`, `src/lib/components/OfflineBanner.svelte:17,48-50` |
| 10 | first visit per user/browser while settings are still `'UTC'`: probe POST then `invalidateAll()` — a full second data load | `src/routes/(calendar)/calendar/+layout.svelte:28-46` |
| 11 | statically imported into the initial chunk on every chrome render: bell 310 LOC + push client 190 + notification label tables 186 + **luxon** through `relativeTime` + focus trap + both menus + inline icon strings | `src/lib/components/Navbar.svelte:5-10`, `src/lib/utils/dateUtils.ts:1`, `src/lib/utils/notificationTypes.ts`, `src/lib/utils/pushClient.ts` |

**Assets, checked and deliberately unchanged**

- No webfonts: `src/app.css` has no `@font-face`, no `fonts.googleapis` link, no icon font — Tailwind's system stack only. Keep it: a font is a render-blocking request on every page.
- One global stylesheet: `src/app.css` (29 lines: Tailwind directives plus the motion/tap/selection base rules) imported only by the root layout (`src/routes/+layout.svelte:12`, #062). The 243-line `src/lib/marketing/theme.css` is marketing's page cost, not shell's.
- Icons are inline SVG literals in the destination list (`src/lib/utils/navItems.ts:36-69`) — no sprite or network request.
- `src/app.html` carries two tiny inline scripts (test-brand swap `:18-30`, service-worker registration `:31-42`) and the manifest/icon/theme-colour links (`:5-11`). The service worker precaches only `/offline.html` and caches `_app/immutable` at runtime (`static/service-worker.js:11-19,147-160`); `CACHE_NAME`/`DATA_CACHE_NAME` (`:1-2`) bump in the same commit as any change to `app.html`, `static/manifest*.webmanifest` or brand assets (AGENTS.md:61).
- PWA: `start_url` and share target are `/calendar` (`static/manifest.webmanifest:5,42-50`); the manifest is browser-fetched after first paint, so it is not in the critical path.

**Target load plan — root layout (every page)**

- Above the fold: wordmark, desktop links or hamburger, bell slot (app), avatar or Sign In/Get Started.
- Server: **0 queries**. `shellRootLoad` maps `locals.actor`/`locals.user` into `ShellRootModel` (id, names, email, isAdmin, emailVerified, lastActiveAt) plus the server year from `ctx.clock.now()`. It never reads `event.url` and never returns the raw user row.
- New `src/routes/+layout.server.ts` (one wiring line) — no query, no serialised credential, no `url` dependency.
- Chrome mode: `shellChromeForRoute(page.route.id)` = `'app'` for `/(calendar)/calendar/**` and `/(family)/**`, `'none'` for marketing, admin, `/report-bug`, `/share-target`. Marketing's own header is marketing's (a domain cannot import a screen); account (#18) and admin (#19) widen the rule when they port instead of copying chrome.
- Client: **no fetch on mount and none on navigation**. The profile menu and mobile menu `import()` on first open; the bell panel is alerts' lazy component; the unread badge is one count per chrome mount, refreshed on `visibilitychange` only when it is older than 60 s, then updated optimistically on mark-read. That replaces #6, #7 and #8.
- The same chrome subtree survives calendar ↔ family transitions (no navbar/tab-bar remount, no badge flicker, one `initOfflineSync` instead of one per group mount).
- Degradation: a group load that threw leaves the chrome without a model; `ShellRoot` then renders `children` only (the error page still stands).

**Target load plan — calendar group (`/(calendar)/calendar/**`, every signed-in page)**

- Above the fold: chrome (root) + at most one notice + the first screenful of the page.
- Server: `shellCalendarGroupLoad` reads identity settings and the family id in parallel, then the roster (2 round trips instead of the legacy 3 serial queries), passes the root summary through with `event.parent()` (no second query, no `url` read), and returns no `pathname` → it runs once per group entry rather than once per navigation (#3, #5). The whitelisted model removes #4.
- After paint (none of it blocks first paint): time-zone probe on idle behind the localStorage gate → save → targeted `invalidate('shell:scope')` instead of `invalidateAll()` (#10); offline replay + pending count read on idle (#9); badge count (#6/#7/#8 replaced).
- On demand: the verify form renders only when the notice says so; menus and the bell panel are lazy (#11 shrinks to the chrome shell + wordmark).
- Rendering: the notice is decided once by a pure rule over (searchParams, user, daysLeft, dismissals); the single banner stack is measured with `ResizeObserver`; `<main>` offset comes from `shell.frame.rules` (40 px guess before the first measurement); icons stay inline.

**Target load plan — family group (`/(family)/**`)**

- Same frame as calendar, without the footer, and **no group load at all**: the user comes from the root load and the auth guard is the root load's (see Decisions), so `(family)/+layout.server.ts` is deleted and nothing has to wire `pageLoad` there. The legacy user-only load and its `pathname` dependency die with it.

### Files (S3–S7)

| file | role | contents |
|---|---|---|
| `shell.contract.ts` | contract | zod models with inferred types: `ShellRootModel` (whitelisted user summary + year), `ShellScopeModel` (the passed-through root summary + settings, familyId, roster, anonymous days left), `ShellNoticeModel`; plus the narrow ports `ShellBadgePort`, `ShellVerifyPort`, `ShellTimezonePort`, `ShellOfflinePort`. `shellErrorView`'s return is inferred in `shell.error.rules.ts` (one consumer), so there is no error model here. `.strict()` so a leaking field (e.g. `passwordHash`) fails a test instead of shipping. |
| `shell.nav.rules.ts` | rules | `shellNavItems` (the six destinations, labels, short labels, inline icons, `bellInstead`), `ShellNavItem`, `shellActiveHref`. `marketingNavItems` is not here — it goes to marketing. |
| `shell.frame.rules.ts` | rules | `shellChromeForRoute(routeId)`, `shellBannerOffset(measuredHeight, bannerCount)` (the 40 px fallback), `shellIsKeyboardOpen(innerHeight, visualViewportHeight)` (the 150 px threshold). |
| `shell.notices.rules.ts` | rules | `shellDaysLeft(lastActiveAt, now)` (Inactivity Window 90, ceil, floor 0), `shellNoticeFor({ searchParams, user, daysLeft, dismissed })` (the one precedence chain), `shellMergeSummary(events, tasks)` (pluralisation, tasks only when > 0). |
| `shell.error.rules.ts` | rules | `shellErrorView(status, message)` → `{ tone, title, body, showReport }` for 404 / other 4xx / 5xx. |
| `shell.api.ts` | api | `createShellPorts()`: the single wiring point for the four ports over alerts' count, access' verify/resend, identity's time-zone save and kernel/client's offline queue. Layouts pass `ports` in; tests pass fakes. |
| `shell.service.server.ts` | service | `loadShellRoot(ctx, actor, viewer)` (whitelist from the session row + the year from `ctx.clock.now()`; no query) and `loadCalendarGroup(ctx, actor)` (identity settings ∥ family id, then roster; `Promise.allSettled` around the family half so a broken family read is `null`/`[]`). |
| `shell.http.server.ts` | http | `pageLoad()` wrappers: root (`optional`, and the one app-chrome guard) and calendar group (`user`). No `event.url`. |
| `shell.badge.state.svelte.ts` | state | unread count: fetch once per mount, stale-gated visibility refresh (60 s), `99+` cap, optimistic decrement on mark-read, failure → 0. |
| `shell.timezone.state.svelte.ts` | state | localStorage gate per user, probe only while `timeZone === 'UTC'`, save via the port, set the flag **after** success (retry on failure), report "probed" so the frame can invalidate the scope. |
| `shell.verify.state.svelte.ts` | state | code input, busy, inline server error, resend with the 3 s "Sent again ✓" receipt. |
| `shell.offline.state.svelte.ts` | state | online/pending/synced from the offline port: visible = offline ∨ pending ∨ receipt; 4 s receipt; 2 s pending re-read after reconnect. |
| `shell.*.rules.test.ts`, `shell.*.state.test.ts` | tests | table tests and state tests with fake ports + manual scheduler; titles carried from the legacy suites where the rule is the same. |
| `shell.service.db.test.ts`, `shell.http.db.test.ts` | tests | db project: whitelisted model, degrade-to-null/[], 302 `/login` from both groups, no `pathname`, settings/family/roster from seeded rows. |
| `shell.styles.test.ts` | test | repo scans: one `app.css` importer, no `bind:` on a component in shell `ui/`, manifest `start_url`/share target, safe-area padding, service-worker cache keys unchanged. |
| `ui/ShellRoot.svelte` | ui | chrome mode + navbar + tab bar + toast host + `children`; owns the badge/timezone/offline state instances; no fetch. |
| `ui/ShellNavbar.svelte` | ui | wordmark, desktop links, bell slot, avatar button, hamburger; menus open/close on pathname change, Escape, outside click; menus `import()`ed on first open. |
| `ui/ShellProfileMenu.svelte` | ui | registered-only header, admin links, Settings/Family/Task Stats/Archive/Report a Bug, logout form; required `reportBugHref`. |
| `ui/ShellMobileMenu.svelte` | ui | bell row, destination list with active highlight, account rows + admin links, Logout or Sign In/Get Started; focus-trapped. |
| `ui/ShellTabBar.svelte` | ui | six tabs, `99+` badge, `Alerts (n unread)` accessible name, class-only keyboard hiding, safe-area padding. |
| `ui/ShellGroupFrame.svelte` | ui | banner stack + `<main>` offset + footer variant (`calendar`/`family`) + `children`. |
| `ui/ShellNotices.svelte` | ui | the four notice rows and the self-sufficient verify form, driven by `ShellNoticeModel` + dismiss/submit callbacks. |
| `ui/ShellOfflineBanner.svelte` | ui | offline paragraph / pending count / 4 s receipt from `ShellOfflinePort`. |
| `ui/ShellErrorView.svelte` | ui | renders `shellErrorView()`; "Back to calendar" always, bug CTA on 5xx only. |
| `ui/*.svelte.test.ts` | tests | one per component, props only (no `$app/*`), fake ports, fake scheduler. |

### Route files

| file | change |
|---|---|
| `src/routes/+layout.svelte` | keep the single `app.css` import; render `<ShellRoot>` with `routeId={page.route.id}` and data. |
| `src/routes/+layout.server.ts` | **new**: `export const load = shellRootLoad;` |
| `src/routes/(calendar)/calendar/+layout.svelte` | wiring: `<ShellGroupFrame variant="calendar">` with data, `url` and `ports`. |
| `src/routes/(calendar)/calendar/+layout.server.ts` | wiring: `export const load = shellCalendarGroupLoad;` (file comment dropped). |
| `src/routes/(family)/+layout.svelte` | wiring: `<ShellGroupFrame variant="family">`. |
| `src/routes/(family)/+layout.server.ts` | **deleted**: the root load's app-chrome guard covers the group, and a guard-only export would be a `pageLoad` passthrough (`pageLoad` requires a `handle`, which R8 forbids as an inline arrow), so there is nothing legitimate to wire. |
| `src/routes/+error.svelte` | wiring: `<ShellErrorView status={page.status} message={page.error?.message} url={page.url} />`. |

No S2: shell owns no `/api/**` route, so there is no `shell.http.db.test.ts` golden file and no S2
sha. Its db tests in S5/S6 pin the layout loads, not a wire.

### Where each legacy export goes

| legacy | new home |
|---|---|
| `NavItem`, `loggedInNavItems`, `bottomNavItems`, `resolveActiveHref` (`src/lib/utils/navItems.ts`) | `shell.nav.rules.ts`: `ShellNavItem`, `shellNavItems`, `shellActiveHref` (the two derived lists are `filter`/all inside the components — pinned by the shared-list test). |
| `marketingNavItems` (`navItems.ts:29-34`) | marketing: its ported public header owns the four public links. Not shell. |
| `Navbar.svelte` | `ui/ShellRoot.svelte` + `ui/ShellNavbar.svelte`; its `NotificationBell` import dies (alerts owns the bell, shell owns the slot); `Mark` → kernel/ui `BrandMark` (K-08); `reportBugHref` → feedback. |
| `NavbarProfileMenu.svelte` | `ui/ShellProfileMenu.svelte`; the `reportBugHref = '/report-bug'` default dies (prop required); `trapFocusAction` → kernel/ui `trapFocus`. |
| `NavbarMobileMenu.svelte` | `ui/ShellMobileMenu.svelte`, now focus-trapped. |
| `BottomNav.svelte` | `ui/ShellTabBar.svelte` + `shell.badge.state.svelte.ts`; the `currentPath` test seam dies (pathname is a prop everywhere). |
| `OfflineBanner.svelte` | `ui/ShellOfflineBanner.svelte` + `shell.offline.state.svelte.ts` over kernel/client `offlineQueue` (K-07). |
| `Breadcrumbs.svelte` | kernel/ui `Breadcrumbs` (K-08 scope addition, see Notes); **kept** until account (#18) and familyHub (#20) migrate (7 route pages import it). |
| `(calendar)/calendar/+layout.svelte` | `ui/ShellGroupFrame.svelte` + `ui/ShellNotices.svelte` + `shell.notices.rules.ts` + `shell.timezone/verify/offline.state.svelte.ts`. |
| `(calendar)/calendar/+layout.server.ts` | `shell.service.server.ts` (`loadCalendarGroup`) + `shell.http.server.ts`; `loadUserScope`'s three reads become the shell composition (settings ∥ family id → roster). |
| `(family)/+layout.svelte` | `ShellGroupFrame variant="family"`; the duplicate `initOfflineSync` mount dies. `(family)/+layout.server.ts` is deleted: its 302 guard moves to the root load (same behaviour, no passthrough export). |
| `+error.svelte` | `ui/ShellErrorView.svelte` + `shell.error.rules.ts`. |
| `src/lib/utils/reportBug.ts` | feedback (their sheet already lists it). |
| `src/lib/utils/anonymous.ts` | identity's rules (`isAnonymousAccount`/`isRegisteredAccount`); shell imports them. |
| `src/lib/utils/offline.ts`, `src/lib/client/toasts.ts`, `brand/Mark.svelte`, `focusTrap.ts` | kernel/client (K-07), kernel/ui (K-08). |
| `NotificationBell.svelte`, `pushClient.ts`, `notificationTypes.ts` | alerts. |

## Notes

### Decisions

- **The chrome lives in the root layout, not in each group layout.** `account`, `familyHub` and
  `calendarPage` are screens and screens may not import each other (R1), so a chrome component owned
  by shell could never be reused by them; the root layout is the only host every screen already has.
  `shellChromeForRoute` keeps it app-only for now (calendar + family groups). This also stops the
  navbar/tab bar remounting on a calendar ↔ family jump.
- **Marketing keeps its own header.** Marketing is a domain (rank 16), so it may not import shell.
  Its ported public header owns the four public links and the Sign In/Get Started CTAs; `shellNavItems`
  is the signed-in app's list only.
- **The bell is alerts'.** Shell renders a slot and consumes a `ShellBadgePort`; the panel, push
  permission and the feed stay in alerts. That keeps the 310-line bell and the push client out of the
  chrome chunk until the panel opens.
- **The count is fetched once per chrome mount, not per navigation.** With the root chrome remaining
  mounted across app routes, a per-navigation fetch has nothing to update; a stale-gated
  `visibilitychange` refresh plus optimistic mark-read covers the live cases.
- **Ports, not mocks.** The four ports come in as constructor/prop arguments (R9). Layout files wire
  `createShellPorts()`; tests pass fakes.
- **One auth guard, in the root load.** `shellRootLoad` redirects 302 `/login` when
  `shellChromeForRoute(event.route.id)` is `'app'` and there is no actor, so the calendar group's load
  only reads scope and `(family)` needs no load at all. A `shellFamilyGroupLoad` would have been a
  one-line `pageLoad({ auth: 'user' })` passthrough — and `pageLoad` requires a `handle`, which R8
  forbids as an inline arrow in a route file — so it fails the deletion test; the guard moved up
  instead. The calendar group keeps `auth: 'user'` for its actor type and scope read.
- **The shared scope is composed here for now.** `loadCalendarGroup` calls identity's settings read
  and family's id/roster reads itself (a screen may compose domains). If `family` later exports a
  viewer-scope reader, shell calls it instead: same data, one call site fewer, and no rule changes.

### Bugs found while verifying (fixed in this port, none is a fixed external contract)

- **The whole `users` row reaches the browser.** The calendar and family group layouts return
  `event.locals.user` (`(calendar)/calendar/+layout.server.ts:17`, `(family)/+layout.server.ts:12`),
  and three more legacy loads do the same (`(marketing)/+layout.server.ts:18`,
  `(calendar)/account/+layout.server.ts:8`, `(family)/family/create/+page.server.ts:20`). The row
  includes `passwordHash`, `receiptIngestToken` and `phonenumber` (`schema.ts:26,38,44`). Shell's
  models are whitelists with a `.strict()` test; marketing, account and familyHub do the same for
  their loads at their ports, and the backport question is in the owner list.
- **The group scope reloads on every navigation.** `pathname: event.url.pathname` in a server load
  registers a `url` dependency, so the "once per group entry" comment (`+layout.server.ts:9-12`) is
  false: settings + family + roster are re-read on every in-group navigation. The v2 load reads no
  `url` and returns no `pathname`.
- **The footer builds the year from `new Date()`** in the component (`+layout.svelte:280`) — a
  hydration hazard around midnight, and the pattern v2 forbids (R5 governs v2 code, not this legacy
  line). The year now comes from `ctx.clock.now()` in the root load.
- **The once-per-user probe never retries.** The flag is written before the POST
  (`+layout.svelte:28-46`); v2 writes it only after a successful save, and the refresh is a targeted
  `invalidate('shell:scope')` instead of `invalidateAll()`.
- **The `(family)` banner can cover content**: it is fixed at `top: calc(4rem + safe-area)` while
  `<main>` only gets static padding (`(family)/+layout.svelte:20-21`). Both groups now use the one
  measured stack.
- **The tab bar fetches while hidden** on desktop (`md:hidden`, `BottomNav.svelte:122`) and the bell
  fetches the 50-row feed every 60 s to read one number (`NotificationBell.svelte:31-45,151-158`).
  Both are gone with the single badge source.
- **Push setup runs on every page load** (`GET /api/push/public-key`, `NotificationBell.svelte:161-168`);
  it moves behind opening the bell panel.

### Probably accidental — dispositions

| item | disposition |
|---|---|
| `NavbarMobileMenu` imports `trapFocusAction` but never applies it | internal (not on the wire): **fix** — both menus trap focus. |
| layouts mix `runes`/`children` with `export let`/`<slot />` | internal: gone; all three frames are components. |
| `(family)` banner overlaps page content | internal, user-visible: **fix** with the measured stack. |
| probe flag written before the request | internal: **fix** (flag after success) + test. |
| menus default `reportBugHref` to `/report-bug` | internal: **drop the default**, make the prop required. |
| stale `// +page.server.ts` comment | dies with the file. |
| `marketingNavItems` in the shared nav module | moved to marketing (their pages render it). |

Nothing in the "probably accidental" list is visible on the `/api` wire, so no owner question is
needed to change it: no `/api` behaviour changes in this port.

### Files kept for unported importers

- `src/lib/components/{Navbar,NavbarMobileMenu,NavbarProfileMenu,BottomNav,OfflineBanner}.svelte` and
  the legacy `Toaster`/`Mark`: `(calendar)/account/+layout.svelte` (account, #18),
  `(admin)/+layout.svelte` (#19) and `(family)/family/**` (familyHub, #20) still import them when
  shell lands. `/account` therefore keeps its own chrome (and does not get the root chrome, whose rule
  is app-only) until account widens the rule at #18 — no double navbar in the meantime. Delete the
  files as those ports land, or immediately if shell's S8 finds no importers.
- `src/lib/components/Breadcrumbs.svelte`: 7 route pages in account and familyHub use it. It moves to
  kernel/ui (K-08) and is deleted after those ports, not before.
- `src/lib/utils/reportBug.ts` and `src/lib/utils/offline.ts`: owned by feedback and K-07; shell does
  not delete them.

### Questions for the owner

1. **Unread-count source (`/api` adjacent).** Today the bell re-fetches the 50-row feed just to poll a
   number (alerts' sheet lists this as a known gap). Options: (a) keep the existing `GET
   /api/notifications` but call it once per chrome mount (no wire change; recommended), (b) add
   `GET /api/notifications/count` (new path; a contract addition, needs alerts + approval and an
   Android check), (c) return the count from the layout load (one server query per page load).
   Recommendation: (a) now; revisit (b) if `perf:check` shows the 50-row payload.
2. **Chrome in the root layout + app-only mode.** Confirm the direction: root renders chrome for
   `/(calendar)/calendar/**` and `/(family)/**`; account and admin widen the rule at their ports; each
   screen never renders a second navbar. Recommendation: yes (R1 leaves no alternative that avoids
   duplication).
3. **Marketing's public header.** Confirm the marketing port owns the guest header (four links +
   Sign In/Get Started) and `marketingNavItems` moves there, so shell's root chrome never renders on
   marketing pages. Recommendation: yes — R1 forbids the alternative (a domain importing a screen),
   and the marketing page's own `mp-canvas`/skip-link wrapper already lives there.
4. **Breadcrumbs to kernel/ui.** This is a small K-08 scope addition (a 30-line, `$app`-free
   component): account and familyHub render it on 7 pages and screens cannot share. Recommendation:
   add it to K-08; otherwise the alternative is one copy per screen (account, familyHub).
5. **Security backport.** The password hash / receipt token / phone number are serialised to the
   browser on every legacy app page today. Shell's port fixes it in v2. Does the owner want a separate
   ticket (and a backport to the legacy branch still serving production) before the rewrite merges?
   Recommendation: file the ticket now, fix in v2 as planned.
6. **Fixes and load-plan changes inside the port.** Confirm the seven internal fixes above and the
   load-plan changes may land in shell's commits (none touches the schema, the `/api` wire, or a
   Must-keep rule). Recommendation: yes; they are listed here so the visual check at S7 expects them.

### Verification needed at S6/S7

- `page.route.id` must be populated during SSR so the first paint already has the chrome (SvelteKit
  does; if not, `shellRootLoad` returns `event.route.id` as the initial value).
- The new root `+layout.server.ts` must not break the marketing static-adapter path: the root load
  reads only `locals`, and marketing's `prerender` is already `false` under adapter-vercel
  (`(marketing)/+layout.server.ts:5-6`). Confirm with `build:safe`.

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
