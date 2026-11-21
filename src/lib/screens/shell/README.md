# shell

**screen** — App chrome: the root layout's navbar and tab bar, the group frames' banner stack and `<main>` offset, the error page, and the one list of app destinations.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly (Anonymous Account, Claiming, Inactivity Window, Alert). Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns:
  - the chrome every signed-in page pays for: the wordmark, desktop nav links, avatar/profile menu, the Alerts bell **slot**, the phone tab bar, the toast host, and the one `app.css` import;
  - the one destination list (`shellNavItems`, six entries) and the active-tab rule both navs read;
  - the group frame: the fixed banner stack (the offline banner + at most one notice), the measured `<main>` offset, the md-only app footer;
  - the app-chrome guard — an app-chrome route without a user is a 302 `/login` — applied in the root load, so the `(family)` group needs no load of its own;
  - the calendar group's shared scope (settings, family id, roster), loaded once per group entry for pages to read with `parent()`, and the anonymous countdown / unverified-email / guest-merge / claimed notices;
  - the once-per-user time-zone probe and the error page's copy (404 vs 4xx vs 5xx).
- Does not own:
  - the Alert feed, the bell panel, push subscriptions and the unread count — `alerts` (shell renders the slot and passes a `ShellBadgePort`; the bell component is alerts' `AlertsBell`);
  - logout, email verification, Claiming and the guest merge themselves — `access` (shell posts their endpoints and renders their copy);
  - the `?from=` bug-link rule — `feedback` (`reportBugHref`);
  - the marketing header/footer and the admin header — `marketing` and `admin` (the root chrome is app-only, see the port sheet's Plan);
  - breadcrumbs — they go to kernel/ui `Breadcrumbs` (K-08) because account and familyHub (7 route pages) render them and a screen may not import another screen;
  - the offline mutation queue, toasts, the brand mark and `trapFocus` — kernel/client (K-07) and kernel/ui (K-08).

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: `ShellNavItem`, `shellNavItems`, `shellActiveHref`, `shellChromeForRoute`, `shellErrorView`, `createShellPorts`, and the layout models. | through `shell.nav.rules.test.ts`, `shell.frame.rules.test.ts`, `shell.error.rules.test.ts` |
| [index.server.ts](index.server.ts) | entry | Public server interface: `loadShellRoot` / `loadCalendarGroup` and the two `pageLoad()` handlers the root and calendar layouts wire. | `shell.http.db.test.ts` |
| [ui/index.ts](ui/index.ts) | entry | Public components: `ShellRoot`, `ShellGroupFrame`, `ShellErrorView`. | `ui/ShellRoot.svelte.test.ts` |
| [shell.contract.ts](shell.contract.ts) | contract | The strict layout models — `ShellUserSummary` (#324 whitelist), `ShellSettingsModel`, `ShellRosterMember`, `ShellRootModel`, `ShellFrameScope`, `ShellScopeModel` and the `ShellNoticeModel` union — plus the four narrow ports. `z.strictObject` is the #324 fix: only the listed user fields can reach the browser, so `passwordHash`, `receiptIngestToken` and `phonenumber` fail a parse instead of shipping. | through `shell.service.db.test.ts` |
| [shell.nav.rules.ts](shell.nav.rules.ts) | rules | `shellNavItems` (the six destinations, their inline icons and the Alerts `bellInstead` flag) and `shellActiveHref` (longest pathname-prefix wins, `/calendars` ≠ `/calendar`). One list and one active rule for both navs — the issue-065 fix. | [shell.nav.rules.test.ts](shell.nav.rules.test.ts) |
| [shell.frame.rules.ts](shell.frame.rules.ts) | rules | `shellChromeForRoute` (app chrome only for `/(calendar)/calendar/**` and `/(family)/**`), `shellBannerOffset` (measured stack or the legacy 40 px guess) and `shellIsKeyboardOpen` (the 150 px inset). | [shell.frame.rules.test.ts](shell.frame.rules.test.ts) |
| [shell.notices.rules.ts](shell.notices.rules.ts) | rules | `shellDaysLeft` (the 90-day Inactivity Window, ceil, floored at 0), `shellNoticeFor` (one precedence chain over search params, viewer, days left and dismissals) and `shellMergeSummary` (the pluralised merge sentence). | [shell.notices.rules.test.ts](shell.notices.rules.test.ts) |
| [shell.error.rules.ts](shell.error.rules.ts) | rules | `shellErrorView`: tone, title, body and `showReport` for 404 / other 4xx / 5xx (issue 261 — a 4xx never claims a notification, only a 5xx offers the bug CTA). | [shell.error.rules.test.ts](shell.error.rules.test.ts) |
| [shell.api.ts](shell.api.ts) | api | `createShellPorts()` — the ONE wiring point for the four ports (alerts' feed count, access' verify/resend doors, identity's keepalive settings save, kernel/client's offline queue) — and `purgeShellDataCache()` for logout (#029 M2). A network failure rejects so the state classes own their legacy copy. | through the state tests and `ui/ShellRoot.svelte.test.ts` |
| [shell.service.server.ts](shell.service.server.ts) | service | `loadShellRoot` (the whitelisted summary + the server year, **no query**) and `loadCalendarGroup` (identity's `getStoredCalendarSettings` ∥ family's id, then the roster — the legacy three reads, no consent trail; the family half degrades to `null`/`[]` exactly as the legacy `loadUserScope` `try/catch` did). | [shell.service.db.test.ts](shell.service.db.test.ts) |
| [shell.http.server.ts](shell.http.server.ts) | http | The two layout loads: the one app-chrome guard (`auth: 'optional'`, 302 `/login`) and the calendar scope (`auth: 'user'`, `depends('shell:scope')`, no `url` read, no `pathname`). Also carries the two LEGACY names the unported calendar pages read — `userSettings`/`familyMembers`, same values as `settings`/`roster`, removed in the S8 sweep. No `/api` twin — shell owns no `/api` route. | [shell.http.db.test.ts](shell.http.db.test.ts) |
| [shell.badge.state.svelte.ts](shell.badge.state.svelte.ts) | state | The Alerts count: one read per chrome mount, stale-gated `visibilitychange` refresh (60 s), `99+` cap, optimistic `markRead`, failure → 0. | [shell.badge.state.test.ts](shell.badge.state.test.ts) |
| [shell.timezone.state.svelte.ts](shell.timezone.state.svelte.ts) | state | The once-per-user zone probe: localStorage gate per user, only while the stored zone is still `'UTC'`, flag written **after** the save succeeds (the legacy code wrote it first, so a failure was never retried). | [shell.timezone.state.test.ts](shell.timezone.state.test.ts) |
| [shell.verify.state.svelte.ts](shell.verify.state.svelte.ts) | state | The unverified-email notice's form: trimmed code, inline server error, the three legacy failure sentences, and the 3 s "Sent again ✓" receipt. | [shell.verify.state.test.ts](shell.verify.state.test.ts) |
| [shell.offline.state.svelte.ts](shell.offline.state.svelte.ts) | state | Offline / pending / "Synced N changes." from the offline port: visible = offline ∨ pending ∨ receipt, 4 s receipt, 2 s reconnect read, offline paragraph only while actually offline. | [shell.offline.state.test.ts](shell.offline.state.test.ts) |
| [shell.nav.rules.test.ts](shell.nav.rules.test.ts) | test | The six destinations and their order, the Alerts-only difference, the icon/9-character tab rule, and the active-href table (query-carrying hrefs, partial segments, subroutes). | — |
| [shell.frame.rules.test.ts](shell.frame.rules.test.ts) | test | The chrome-mode route table, the banner-offset fallback/measurement table and the keyboard-inset table. | — |
| [shell.notices.rules.test.ts](shell.notices.rules.test.ts) | test | The countdown/urgency table, the full precedence table (guests, dismissals, junk counts) and the merge-sentence pluralisation table. | — |
| [shell.error.rules.test.ts](shell.error.rules.test.ts) | test | The 404/4xx/5xx copy table, including the 4xx server-message fallback and the 5xx-only report flag. | — |
| [shell.badge.state.test.ts](shell.badge.state.test.ts) | test | The 99+ cap, failure-is-zero, the optimistic decrement and the stale gate, with a fake port and a pinned clock. | — |
| [shell.timezone.state.test.ts](shell.timezone.state.test.ts) | test | The gate table (wrong zone, wrong user, no browser zone, throwing storage) and the retry-after-failure path. | — |
| [shell.verify.state.test.ts](shell.verify.state.test.ts) | test | The trimmed submit, the server sentence inline, the fallbacks, the busy guard and the 3 s receipt (manual scheduler). | — |
| [shell.offline.state.test.ts](shell.offline.state.test.ts) | test | The three visibility reasons, the reconnect read and the 4 s receipt, with a manual scheduler. | — |
| [shell.service.db.test.ts](shell.service.db.test.ts) | test | The #324 whitelist over a row that really carries credentials, and the scope's degrade-to-`null`/`[]` with its log line. | — |
| [shell.http.db.test.ts](shell.http.db.test.ts) | test | Both loads at the HTTP boundary: the guest redirect, the public route's `null` user, the parent passthrough, the countdown, and no `pathname`/credentials in the data. | — |
| [shell.wiring.http.test.ts](shell.wiring.http.test.ts) | test | Repo scans: one `app.css` importer, no `bind:` on a component, safe-area padding on both navs, and the manifest/`app.html` wiring. | — |
| [ui/ShellRoot.svelte](ui/ShellRoot.svelte) | ui | Chrome mode + navbar + tab bar + toast host + `children`; owns the badge state and the one `initOfflineSync`. No fetch on a non-app route. | [ui/ShellRoot.svelte.test.ts](ui/ShellRoot.svelte.test.ts) |
| [ui/ShellNavbar.svelte](ui/ShellNavbar.svelte) | ui | Wordmark, desktop links, bell slot (a snippet), avatar button and hamburger; both menus close on a pathname change, Escape and an outside click. | [ui/ShellNavbar.svelte.test.ts](ui/ShellNavbar.svelte.test.ts) |
| [ui/ShellProfileMenu.svelte](ui/ShellProfileMenu.svelte) | ui | Registered-only header (#242), admin links, Settings/Family/Task Stats/Archive/Report a Bug, the logout form; `reportBugHref` is required. | [ui/ShellProfileMenu.svelte.test.ts](ui/ShellProfileMenu.svelte.test.ts) |
| [ui/ShellMobileMenu.svelte](ui/ShellMobileMenu.svelte) | ui | Bell row, destination list without Alerts, account rows + admin links, Logout or Sign In/Get Started; focus-trapped (the legacy menu was not). | [ui/ShellMobileMenu.svelte.test.ts](ui/ShellMobileMenu.svelte.test.ts) |
| [ui/ShellTabBar.svelte](ui/ShellTabBar.svelte) | ui | Six tabs, the `99+` badge, `Alerts (n unread)`, class-only keyboard hiding, safe-area padding. | [ui/ShellTabBar.svelte.test.ts](ui/ShellTabBar.svelte.test.ts) |
| [ui/ShellGroupFrame.svelte](ui/ShellGroupFrame.svelte) | ui | The banner stack (`bind:clientHeight` on the div), the `<main>` offset, the calendar footer variant; owns the offline/verify/timezone states. | [ui/ShellGroupFrame.svelte.test.ts](ui/ShellGroupFrame.svelte.test.ts) |
| [ui/ShellNotices.svelte](ui/ShellNotices.svelte) | ui | The four notice rows and the self-sufficient verify form, driven by `ShellNoticeModel`. | [ui/ShellGroupFrame.svelte.test.ts](ui/ShellGroupFrame.svelte.test.ts) |
| [ui/ShellOfflineBanner.svelte](ui/ShellOfflineBanner.svelte) | ui | The offline paragraph / pending count / 4 s receipt from `ShellOfflineState`. | [ui/ShellOfflineBanner.svelte.test.ts](ui/ShellOfflineBanner.svelte.test.ts) |
| [ui/ShellErrorView.svelte](ui/ShellErrorView.svelte) | ui | Renders `shellErrorView()`; "Back to calendar" always, the bug CTA on 5xx only. | [ui/ShellErrorView.svelte.test.ts](ui/ShellErrorView.svelte.test.ts) |

## Public interface

Small on purpose: the root layout, the two group layouts and `+error.svelte` are the only callers, and every export below survives the deletion test (deleting it would move a rule, not a body, into its caller).

- `index.ts`:
  - `shellNavItems` — the six app destinations, once. Both navs read this array: the desktop links drop `bellInstead`, the tab bar keeps everything. Deleting it forces each nav to carry its own copy, which is exactly issue 065.
  - `ShellNavItem` — `{ href, label, shortLabel?, icon?, bellInstead? }`.
  - `shellActiveHref(pathname)` — longest-prefix match, pathname-only, returns the full href.
  - `shellChromeForRoute(routeId)` — `'app' | 'none'`. One place decides which route groups get the app chrome; widening it when account/admin land is a one-line rule change with a test.
  - `shellErrorView(status, message)` — the copy, tone and `showReport` flag; the component types its props from `ReturnType<typeof shellErrorView>`.
  - `createShellPorts()` — the four ports wired to other modules' clients in exactly one place:  `ShellBadgePort` (alerts' feed count), `ShellVerifyPort` (access' verify/resend doors), `ShellTimezonePort` (identity's keepalive settings save) and `ShellOfflinePort` (kernel/client's queue). Layouts call it once and pass the bundle down; tests pass fakes.
  - `ShellRootModel`, `ShellScopeModel`, `ShellFrameScope`, `ShellNoticeModel` — types re-exported from `shell.contract.ts`.
- `index.server.ts`:
  - `loadShellRoot(ctx, actor, viewer)` — the whitelisted summary and the server year; no query.
  - `loadCalendarGroup(ctx, actor)` — identity's stored settings view (one query, no ad-consent trail) ∥ family's id, then the roster; the family half is caught so a broken read is `null`/`[]`; a failed roster read also nulls the id, as the legacy `catch` did.
  - `shellRootLoad` — `pageLoad({ auth: 'optional' })`: the ONE app-chrome guard (302 `/login`) plus the root data.
  - `shellCalendarGroupLoad` — `pageLoad({ auth: 'user' })`: passes the root summary through `event.parent()` (no second query), adds the scope and the countdown, declares `depends('shell:scope')`, and returns no `pathname`. It takes the plain `Ctx`: the scope reads no port.
- `ui/index.ts`:
  - `ShellRoot` — props `routeId`, `pathname`, `search`, `user`, `ports`, `navigate`, `children`. Decides `shellChromeForRoute`; renders the navbar, the tab bar and the toast host; reads the badge once.
  - `ShellGroupFrame` — props `variant`, `scope` (`ShellFrameScope`: `user`, `year`, optional `daysLeft`/`settings`), `search`, `ports`, `refresh`, `children`; renders the banner stack, the `<main>` offset and the footer variant.
  - `ShellErrorView` — props `status`, `message`, `pathname`, `search`; the bug CTA links `feedback`'s `reportBugHref`.

## How to test

- Whole module: `npm run test:mod -- shell` (add `--legacy` while the legacy suite remains).
- Pure rules: `shell.{nav,frame,notices,error}.rules.test.ts` — plain tables of input → expected output, no setup.
- Wiring scans: `shell.wiring.http.test.ts` — repo-wide facts (one `app.css` importer, no `bind:` on a component, safe areas, manifest). It carries the `http` role because a rules file may not import `node:fs` (R4).
- State classes: `shell.{badge,timezone,verify,offline}.state.test.ts` in node with fake ports and a manual scheduler. No `vi.mock` (R9): ports are constructor arguments.
- Database + loads: `shell.service.db.test.ts` and `shell.http.db.test.ts` with `testCtx({ db })`, `seedUser`, identity's two ports as in-memory fakes and directly inserted family rows (R3 allows tables in `*.db.test.ts`). Needs Postgres: `docker start familycalendar-db`.
- HTTP contract: none — shell owns no `/api/**` route, so there is no golden file and no S2 sha.
- UI: `ui/*.svelte.test.ts` render with props (`pathname`, `search`, `user`, `ports`, fake states). Components never read `$app/*`, so there is nothing to mock; the old `$app/navigation`, `$app/stores` and `$lib/utils/offline` mocks die with the legacy tests.
- Version bumps: any change to `src/app.html`, `static/manifest*.webmanifest` or brand assets bumps `CACHE_NAME`/`DATA_CACHE_NAME` in `static/service-worker.js` in the same commit (AGENTS.md:61).

## Invariants

Behaviour that must not change, each with the legacy evidence and the v2 test that pins it:

- One destination list, six entries in this order — `/calendar?dashboardView=1`, `/calendar/dashboard`, `/calendar/tasks`, `/calendar/groceries`, `/calendar/notifications`, `/family`; the desktop links are the list minus `bellInstead` and the tab bar is the whole list — `src/lib/utils/navItems.ts:35-70,72-76` · `shell.nav.rules.test.ts › ships the six app destinations in one list`
- Alerts is the only permitted difference between the two navs (`bellInstead`): the desktop header shows the bell instead, the tab bar keeps the tab — `src/lib/utils/navItems.ts:14-19,59-64,72-76` · `shell.nav.rules.test.ts › keeps Alerts in the tab bar and off the desktop links`
- Every tab has an icon and a label of at most 9 characters (Groceries → "Shop"), and the accessible name stays the full label — `src/lib/utils/navItems.ts:4-13,53-58` · `shell.nav.rules.test.ts › gives every tab an icon and a label that fits a 320 px bar`
- Active state is longest-prefix-wins on the pathname only, so `/calendar/tasks/abc` highlights Tasks, query-carrying hrefs still highlight, and `/calendars` matches nothing — `src/lib/utils/navItems.ts:78-91` · `shell.nav.rules.test.ts › longest prefix wins and partial segments do not match`
- Chrome is app-only: `/(calendar)/calendar/**` and `/(family)/**` get the app chrome; marketing, admin, `/report-bug`, `/share-target`, `/claim` and `/merge-guest` get none (account widens the rule at its own port) — mirrors the render sites `src/routes/(marketing)/+layout.svelte:42-50`, `src/routes/(admin)/+layout.svelte:25-60` · `shell.frame.rules.test.ts › gives the app chrome to the calendar and family groups only`
- Any completed navigation closes both menus (bell goto, tab tap, logo), not just clicks on menu links — `src/lib/components/Navbar.svelte:23-28` · `ui/ShellNavbar.svelte.test.ts › closes both menus when the pathname prop changes`
- Escape and an outside click close the profile dropdown — `src/lib/components/Navbar.svelte:44-50,69-72` · `ui/ShellNavbar.svelte.test.ts › closes the profile menu on Escape and on an outside click`
- Both menus trap focus while open (the mobile menu gains the trap it never had; see the port sheet's Notes) — `src/lib/components/NavbarProfileMenu.svelte:23`, `src/lib/components/NavbarMobileMenu.svelte:4` · `ui/ShellMobileMenu.svelte.test.ts › traps focus in the open menu`
- The Report-a-Bug link is `feedback`'s `reportBugHref(pathname + search)` — never for `/report-bug` itself, and never for a foreign origin. The layouts pass `building ? '' : page.url.search`, because a prerendered page may not read `url.search` (the legacy guard, `Navbar.svelte:57-58`) — `src/lib/components/Navbar.svelte:57-58`, `src/lib/utils/reportBug.ts:8-12,24-41` · `ui/ShellProfileMenu.svelte.test.ts › passes ?from= to the bug form and never for /report-bug` and `ui/ShellNavbar.svelte.test.ts › passes the current path and search to the bug form`
- Logout is a plain `POST /api/logout` form whose submit fire-and-forgets `{type:'purge-data-cache'}` to the service-worker controller so cached authed data is dropped — `src/lib/components/NavbarProfileMenu.svelte:88-94`, `src/lib/components/Navbar.svelte:38-42` · `ui/ShellProfileMenu.svelte.test.ts › posts the logout form and purges the data cache`
- The profile menu shows the name/email header only for a registered account (never the Anonymous Account placeholder), gates Admin/Bug Reports on `isAdmin`, and orders Settings, Family Management, Task Stats, Archive, Report a Bug, red Logout — `src/lib/components/NavbarProfileMenu.svelte:27-95` · `ui/ShellProfileMenu.svelte.test.ts › never shows a guest the placeholder email and gates admin links` and `› lays the account rows out in the legacy order`
- The mobile menu shows a bell row for a signed-in user, the destination list with the active highlight, the account rows and admin links, then Logout or Sign In + Get Started — `src/lib/components/NavbarMobileMenu.svelte:29-115` · `ui/ShellMobileMenu.svelte.test.ts › shows the sign-in CTAs for guests and the account rows for members` and `› lists the destinations without Alerts and highlights the active one`
- Desktop header: wordmark → `/`, inline links, bell + avatar when signed in, Sign In/Get Started otherwise; the mobile hamburger is a 44×44 target labelled Open/Close menu — `src/lib/components/Navbar.svelte:76-181,144-148` · `ui/ShellNavbar.svelte.test.ts › gives the mobile hamburger a 44 px square target` and `› shows the sign-in CTAs to a guest`
- The root layout is the single `app.css` import for the whole app (#062); no group imports it again — `src/routes/+layout.svelte:1-14` · `shell.wiring.http.test.ts › is the only app.css importer in src/routes`
- Never `bind:` a component prop (#200): visibility comes from the state class, and only the banner-stack `<div>` binds `clientHeight` — `src/routes/(calendar)/calendar/+layout.svelte:143-148` · `shell.wiring.http.test.ts › never binds to a child component`
- `<main>` is offset by the measured banner-stack height, with a 40 px one-line guess before the first measurement (#259) — `src/routes/(calendar)/calendar/+layout.svelte:89-94,266-269` · `shell.frame.rules.test.ts › falls back to a 40 px line before the first measurement` and `ui/ShellGroupFrame.svelte.test.ts › offsets main by the measured stack height`
- Every app-chrome route requires a user: a guest navigating to the calendar or family group gets 302 `/login` (one guard in the root load; the calendar group load keeps its own `pageLoad({ auth: 'user' })` for the scope, `(family)` has no load left) — `src/routes/(calendar)/calendar/+layout.server.ts:5-8`, `src/routes/(family)/+layout.server.ts:5-8` · `shell.http.db.test.ts › redirects a guest to /login from an app-chrome route`
- The calendar group's shared scope loads once per group entry (settings, family id, roster) and a failed family read degrades to `null`/`[]`, never a 500 — `src/routes/(calendar)/calendar/+layout.server.ts:9-21`, `src/lib/server/services/userScope.ts:9-22` · `shell.service.db.test.ts › reads settings, family and roster and degrades a failed family read to null/[]`
- Layout data carries a user **summary** only — id, names, email, isAdmin, emailVerified, lastActiveAt — never `passwordHash`, `receiptIngestToken` or `phonenumber`, and never `pathname` (which would make the load re-run on every navigation) — `src/routes/(calendar)/calendar/+layout.server.ts:14-21`, `src/lib/server/db/schema.ts:18-45` · `shell.service.db.test.ts › returns a whitelisted user summary, never credentials` and `shell.http.db.test.ts › passes the root summary through and adds settings, family, roster and countdown`
- The calendar group also answers the two LEGACY names the unported pages still read through `parent()`/page data — `userSettings` (the settings view) and `familyMembers` (the roster), identical values to `settings`/`roster` and carrying no credential field. They exist only until #21/#22 read the new names, and go in the S8 sweep — `src/routes/(calendar)/calendar/+page.server.ts:65-66,71`, `dashboard/+page.server.ts:20-22` · `shell.http.db.test.ts › passes the root summary through and adds settings, family, roster and countdown`
- Time-zone probe: at most once per user per browser, only while settings timeZone is still `'UTC'`, gated by `localStorage['familyplanz:tzProbed:<userId>']`, saved with `keepalive`, and the flag is set only after the save succeeds (the legacy code sets it first — fix, see the sheet) — `src/routes/(calendar)/calendar/+layout.svelte:17-49` · `shell.timezone.state.test.ts › probes once per user, only while the zone is UTC, and retries after a failed save`
- Anonymous Account countdown is the 90-day Inactivity Window from `lastActiveAt`, rounded up and floored at 0 (no `lastActiveAt` → 90); urgent at ≤ 14 days flips the copy to red and shows the days left — `src/routes/(calendar)/calendar/+layout.svelte:51-58,247-263` · `shell.notices.rules.test.ts › counts the Inactivity Window down and turns urgent at 14 days` and `ui/ShellGroupFrame.svelte.test.ts › falls back to the 40 px one-line guess and shows the guest countdown`
- Top-notice precedence is a single chain — `?claimed=1` → unverified email → `?merged=N&tasks=M` → anonymous countdown; the first three are dismissable, the countdown is not, and a guest never sees claimed/merged — `src/routes/(calendar)/calendar/+layout.svelte:59-80,149-264` · `shell.notices.rules.test.ts › first matching notice wins and only the countdown cannot be dismissed` and `ui/ShellGroupFrame.svelte.test.ts › dismisses the merge notice, which a guest never sees`
- The unverified-email notice is self-sufficient: inline code input posts `/signup/password/verify`, Resend posts `/signup/password/resend`, failures render inline, "Sent again ✓" clears after 3 s — `src/routes/(calendar)/calendar/+layout.svelte:65-136,165-226` · `shell.verify.state.test.ts › shows the server error inline and clears the sent receipt after 3 s` and `ui/ShellGroupFrame.svelte.test.ts › shows the unverified-email notice with its inline form`
- Guest-merge copy pluralises the merged Event count and mentions tasks only when `tasks > 0` — `src/routes/(calendar)/calendar/+layout.svelte:227-246` · `shell.notices.rules.test.ts › pluralises the merge summary and omits tasks when zero`
- The offline banner is visible while offline, while changes are pending, or while the 4 s "Synced N changes." receipt is up; the offline paragraph renders only when actually offline; coming back online re-reads the pending count after 2 s — `src/lib/components/OfflineBanner.svelte:17-48,59-83` · `shell.offline.state.test.ts › keeps the banner up without claiming offline, then shows the 4 s receipt` and `ui/ShellOfflineBanner.svelte.test.ts › shows the pending sentence without claiming offline`
- The Alerts tab badge is fetched only for a signed-in user, a non-ok/throw answer is `0`, the badge caps at `99+`, and the accessible name is `Alerts (n unread)` — `src/lib/components/BottomNav.svelte:21-51,137-141,166` · `shell.badge.state.test.ts › caps the badge at 99+ and treats a failed count as 0` and `ui/ShellTabBar.svelte.test.ts › names the Alerts tab with its unread count`
- The tab bar hides with a class (never unmounts) while the on-screen keyboard is open, detected as `innerHeight - visualViewport.height > 150` — `src/lib/components/BottomNav.svelte:88-118` · `ui/ShellTabBar.svelte.test.ts › hides without unmounting while the on-screen keyboard is open`
- The error page has three branches: 404 ("We can't find that page"), other 4xx (the server's message, never claims notification), 5xx (claims automatic notification); only 5xx links the report CTA; status renders as `Error {status}` and the title is `{status} · Family Planz` — `src/routes/+error.svelte:6-23,60-73` · `shell.error.rules.test.ts › picks 404, 4xx and 5xx copy` and `ui/ShellErrorView.svelte.test.ts › keeps the notified copy and report CTA for 5xx only`
- The PWA manifest starts at `/calendar` and its share target posts to `/calendar`; `app.html` links the manifest, icons and theme colour — `static/manifest.webmanifest:5,42-50`, `src/app.html:5-12` · `shell.wiring.http.test.ts › starts the manifest at /calendar with a /calendar share target`
- Both navs respect safe areas: navbar `env(safe-area-inset-top)`, tab bar `env(safe-area-inset-bottom)` — `src/lib/components/Navbar.svelte:76`, `src/lib/components/BottomNav.svelte:127-129` · `shell.wiring.http.test.ts › pads both navs with env(safe-area-inset-*)`
- The calendar frame's footer (© server year, About, Privacy, Contact) is md-only; the family frame has no footer — `src/routes/(calendar)/calendar/+layout.svelte:276-286`, `src/routes/(family)/+layout.svelte:18-28` · `ui/ShellGroupFrame.svelte.test.ts › renders the footer links and the server year on calendar only`

## Depends on

- May import: kernel + every domain's public entries (`index.ts`, `index.server.ts`, `ui/index.ts`); never another screen (R1).
- Owns tables: none.
- Reads (join only): none — shell queries nothing; it composes domain services.
- Calls:
  - `identity` — `getStoredCalendarSettings` for the calendar group's scope (the one-query view; the consent trail is not shell's), `isAnonymousAccount`/`isRegisteredAccount` for the viewer rules, and `PATCH /api/me/settings` behind `ShellTimezonePort`.
  - `family` — `familyIdForActor` and `listFamilyRoster` for the group's roster (the module that owns the roster).
  - `alerts` — `AlertsBell` in the slot and the unread count behind `ShellBadgePort` (its feed).
  - `access` — verify-code and resend doors behind `ShellVerifyPort`; Claiming and the guest merge produce the `?claimed`/`?merged` URL flags the notices read.
  - `feedback` — `reportBugHref` for both menus and the error page.
  - kernel: `pageLoad`, `Ctx`/`Actor`, `testCtx` in tests; kernel/client `offlineQueue` + `toasts` (K-07); kernel/ui `BrandMark`, `Toaster`, `trapFocus` (K-08).
- Called by: `src/routes/+layout.svelte` + `src/routes/+layout.server.ts`, `src/routes/(calendar)/calendar/+layout.svelte` + `+layout.server.ts`, `src/routes/(family)/+layout.svelte` (no server file), `src/routes/+error.svelte`. Later, account (#18) and admin (#19) widen `shellChromeForRoute` instead of copying chrome.
