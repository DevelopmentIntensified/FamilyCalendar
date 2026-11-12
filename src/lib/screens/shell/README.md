# shell

**screen** — App chrome: the root layout's navbar and tab bar, the group frames' banner stack and `<main>` offset, the error page, and the one list of app destinations.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly (Anonymous Account, Claiming, Inactivity Window, Alert). Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns:
  - the chrome every signed-in page pays for: the wordmark, desktop nav links, avatar/profile menu, the Alerts bell **slot**, the phone tab bar, the toast host, and the one `app.css` import;
  - the one destination list (`shellNavItems`, six entries) and the active-tab rule both navs read;
  - the group frame: the fixed banner stack (OfflineBanner + at most one notice), the measured `<main>` offset, the md-only app footer;
  - the app-chrome guard — an app-chrome route without a user is a 302 `/login` — applied in the root load, so the `(family)` group needs no load of its own;
  - the calendar group's shared scope (settings, family id, roster), loaded once per group entry for pages to read with `parent()`, and the anonymous countdown / unverified-email / guest-merge / claimed notices;
  - the once-per-user time-zone probe and the error page's copy (404 vs 4xx vs 5xx).
- Does not own:
  - the Alert feed, the bell panel, push subscriptions and the unread count — `alerts` (shell renders the slot and passes a `ShellBadgePort`);
  - logout, email verification, Claiming and the guest merge themselves — `access` (shell posts their endpoints and renders their copy);
  - the `?from=` bug-link rule — `feedback` (`reportBugHref`);
  - the marketing header/footer and the admin header — `marketing` and `admin` (the root chrome is app-only, see Plan);
  - breadcrumbs — they go to kernel/ui `Breadcrumbs` (K-08) because account and familyHub (7 route pages) render them and a screen may not import another screen;
  - the offline mutation queue, toasts, the brand mark and `trapFocus` — kernel/client (K-07) and kernel/ui (K-08).

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: `ShellNavItem`, `shellNavItems`, `shellActiveHref`, `shellChromeForRoute`, `shellErrorView`, and the layout model types from the contract. | through `shell.nav.rules.test.ts`, `shell.frame.rules.test.ts`, `shell.error.rules.test.ts` |
| [index.server.ts](index.server.ts) | entry | Public server interface: `shellRootLoad` and `shellCalendarGroupLoad` (the `pageLoad()` handlers the root and calendar layouts wire; the `(family)` group needs no load of its own — see the guard note below). | `shell.http.db.test.ts` |
| [ui/index.ts](ui/index.ts) | entry | Public components: `ShellRoot`, `ShellGroupFrame`, `ShellErrorView`. | `ui/ShellRoot.svelte.test.ts` |

Every file the port adds (rules, contract, api/ports, four state classes, service/http, nine components and their tests) is listed in the port sheet's Plan: [docs/rewrite/modules/shell.md](../../../../docs/rewrite/modules/shell.md).

## Public interface

Small on purpose: the root layout, the two group layouts and `+error.svelte` are the only callers, and every export below survives the deletion test (deleting it would move a rule, not a body, into its caller).

- `index.ts`:
  - `shellNavItems` — the six app destinations, once. Both navs read this array: the desktop links drop `bellInstead`, the tab bar keeps everything. Deleting it forces each nav to carry its own copy, which is exactly issue 065 (Groceries on desktop, nowhere on a phone).
  - `ShellNavItem` — `{ href, label, shortLabel?, icon?, bellInstead? }`. Deleting it means every consumer redeclares the icon/label contract.
  - `shellActiveHref(pathname)` — longest-prefix match, pathname-only, returns the full href. The rule is subtle (query-carrying hrefs, `/calendars` ≠ `/calendar`); two navs must not implement it twice.
  - `shellChromeForRoute(routeId)` — `'app' | 'none'`. One place decides which route groups get the app chrome; widening it when account/admin land is a one-line rule change with a test, not a second copy of the navbar.
  - `shellErrorView(status, message)` — the copy, tone and `showReport` flag for 404 / other 4xx / 5xx. The component types its props from `ReturnType<typeof shellErrorView>`; there is no separate model because the view has one consumer.
  - `ShellRootModel`, `ShellScopeModel`, `ShellNoticeModel` — types re-exported from `shell.contract.ts`, so components type props from the live model and never mirror it by hand.
- `index.server.ts`:
  - `shellRootLoad` — `pageLoad({ auth: 'optional' })` returning the user summary (no queries; `locals.actor` is already there) and the server year, and redirecting 302 `/login` when the route is an app-chrome route with no actor (the one guard, above).
  - `shellCalendarGroupLoad` — `pageLoad({ auth: 'user' })` returning the calendar group's shared scope (identity settings ∥ family id, then the roster; the family half is `allSettled` so a broken family read is `null`/`[]`) + the anonymous days left, and passing the root summary through with `event.parent()` (no second query) so the frame never reads `page.data`. Never returns `pathname` (see Plan: that makes the load re-run on every navigation) and never the raw `users` row.
- `ui/index.ts`:
  - `ShellRoot` — chrome + `children`: decides `shellChromeForRoute`, renders the navbar, the tab bar and the toast host; menus and the bell panel are `import()`ed on first open.
  - `ShellGroupFrame` — the frame below the chrome: one fixed banner stack (offline + at most one notice) measured with `ResizeObserver`, the `<main>` offset, and the footer variant (`calendar` has the md-only footer, `family` does not).
  - `ShellErrorView` — renders `shellErrorView()`; the only CTA that links the bug form is the 5xx one.

`shell.api.ts` is internal, not a public entry: it exists so the four ports (alerts' count, access' verify/resend, identity's time-zone save, kernel/client's offline queue) are wired to other modules' clients in exactly one place, and the layouts pass that one `ports` object in. The two server exports keep the `…Load` suffix because they are SvelteKit `load` handlers wired straight into `+layout.server.ts`, not services.

## How to test

- Whole module: `npm run test:mod -- shell` (add `--legacy` while the legacy suite remains).
- Pure rules: `shell.{nav,frame,notices,error}.rules.test.ts` — plain tables of input → expected output, no setup. The legacy test titles that encode real rules are carried over (see Invariants).
- State classes: `shell.{badge,timezone,verify,offline}.state.test.ts` in node with fake ports and a manual scheduler. No `vi.mock` (R9): ports are constructor arguments.
- Database + service/loads: `shell.service.db.test.ts` and `shell.http.db.test.ts` with `testCtx({ db })`, `seedUser` and directly inserted family rows (R3 allows tables in `*.db.test.ts`). Needs Postgres: `docker start familycalendar-db`.
- HTTP contract: none — shell owns no `/api/**` route, so there is no golden file and no S2 sha.
- UI: `ui/*.svelte.test.ts` render with props (`pathname`, `routeId`, `ports`, fake timers/scheduler). Components never read `$app/*`, so there is nothing to mock; the old `$app/navigation`, `$app/stores` and `$lib/utils/offline` mocks die with the legacy tests.
- Structure: `shell.styles.test.ts` scans the repo the way `propsDestructure.test.ts` does — one `app.css` importer (root layout), no `bind:` on a component in shell `ui/`, the manifest's `start_url`/`share_target`, safe-area padding on both navs.
- Version bumps: any change to `src/app.html`, `static/manifest*.webmanifest` or brand assets bumps `CACHE_NAME`/`DATA_CACHE_NAME` in `static/service-worker.js` in the same commit (AGENTS.md:61).

## Invariants

Behaviour that must not change, each with the legacy evidence and the v2 test that pins it:

- One destination list, six entries in this order — `/calendar?dashboardView=1`, `/calendar/dashboard`, `/calendar/tasks`, `/calendar/groceries`, `/calendar/notifications`, `/family`; the desktop links are the list minus `bellInstead` and the tab bar is the whole list — `src/lib/utils/navItems.ts:35-70,72-76` · `shell.nav.rules.test.ts › ships the six app destinations in one list`
- Alerts is the only permitted difference between the two navs (`bellInstead`): the desktop header shows the bell instead, the tab bar keeps the tab — `src/lib/utils/navItems.ts:14-19,59-64,72-76` · `shell.nav.rules.test.ts › keeps Alerts in the tab bar and off the desktop links`
- Every tab has an icon and a label of at most 9 characters (Groceries → "Shop"), and the accessible name stays the full label — `src/lib/utils/navItems.ts:4-13,53-58` · `shell.nav.rules.test.ts › gives every tab an icon and a label that fits a 320 px bar`
- Active state is longest-prefix-wins on the pathname only, so `/calendar/tasks/abc` highlights Tasks, query-carrying hrefs still highlight, and `/calendars` matches nothing — `src/lib/utils/navItems.ts:78-91` · `shell.nav.rules.test.ts › longest prefix wins and partial segments do not match`
- Chrome is app-only: `/(calendar)/calendar/**` and `/(family)/**` get the app chrome; marketing, admin, `/report-bug` and `/share-target` get none (account widens the rule at its own port) — new rule, mirrors the render sites `src/routes/(marketing)/+layout.svelte:42-50`, `src/routes/(admin)/+layout.svelte:25-60` · `shell.frame.rules.test.ts › gives the app chrome to the calendar and family groups only`
- Any completed navigation closes both menus (bell goto, tab tap, logo), not just clicks on menu links — `src/lib/components/Navbar.svelte:23-28` · `ui/ShellNavbar.svelte.test.ts › closes both menus when the pathname prop changes`
- Escape and an outside click close the profile dropdown — `src/lib/components/Navbar.svelte:44-50,69-72` · `ui/ShellNavbar.svelte.test.ts › closes the profile menu on Escape and on an outside click`
- Both menus trap focus while open (the mobile menu gains the trap it never had; see Notes) — `src/lib/components/NavbarProfileMenu.svelte:23`, `src/lib/components/NavbarMobileMenu.svelte:4` · `ui/ShellMobileMenu.svelte.test.ts › traps focus in the open menu`
- The Report-a-Bug link is `feedback`'s `reportBugHref(pathname + search)` — path only while `building`, never for `/report-bug` itself — `src/lib/components/Navbar.svelte:57-58`, `src/lib/utils/reportBug.ts:8-12,24-41` · `ui/ShellProfileMenu.svelte.test.ts › passes ?from= to the bug form and never for /report-bug`
- Logout is a plain `POST /api/logout` form whose submit fire-and-forgets `{type:'purge-data-cache'}` to the service-worker controller so cached authed data is dropped — `src/lib/components/NavbarProfileMenu.svelte:88-94`, `src/lib/components/Navbar.svelte:38-42`, `src/lib/components/NavbarMobileMenu.svelte:89-96` · `ui/ShellProfileMenu.svelte.test.ts › posts the logout form and purges the SW data cache`
- The profile menu shows the name/email header only for a registered account (never the Anonymous Account placeholder), gates Admin/Bug Reports on `isAdmin`, and orders Settings, Family Management, Task Stats, Archive, Report a Bug, red Logout — `src/lib/components/NavbarProfileMenu.svelte:27-95` · `ui/ShellProfileMenu.svelte.test.ts › never shows a guest the placeholder email and gates admin links`
- The mobile menu shows a bell row for a signed-in user, the destination list with the active highlight, the account rows and admin links, then Logout or Sign In + Get Started — `src/lib/components/NavbarMobileMenu.svelte:29-115` · `ui/ShellMobileMenu.svelte.test.ts › shows the sign-in CTAs for guests and the account rows for members`
- Desktop header: wordmark → `/`, inline links, bell + avatar when signed in, Sign In/Get Started otherwise; the mobile hamburger is a 44×44 target labelled Open/Close menu — `src/lib/components/Navbar.svelte:76-181,144-148` · `ui/ShellNavbar.svelte.test.ts › gives the mobile hamburger a 44 px square target` and `› shows the sign-in CTAs to a guest`
- The root layout is the single `app.css` import for the whole app (#062); no group imports it again (marketing's `theme.css` is marketing's own, imported by its layout) — `src/routes/+layout.svelte:1-14` · `shell.styles.test.ts › is the only app.css importer in src/routes`
- Never `bind:` a component prop (#200): the offline banner reports visibility through `onVisibleChange`, and only the banner-stack `<div>` uses `bind:clientHeight` — `src/routes/(calendar)/calendar/+layout.svelte:81-94,143-148` · `shell.styles.test.ts › never binds to a child component`
- `<main>` is offset by the measured banner-stack height, with a 40 px one-line guess before the first measurement (#259) — `src/routes/(calendar)/calendar/+layout.svelte:89-94,266-269` · `shell.frame.rules.test.ts › falls back to 40 px per banner before the first measurement` and `ui/ShellGroupFrame.svelte.test.ts › offsets main by the measured stack height`
- Every app-chrome route requires a user: a guest navigating to the calendar or family group gets 302 `/login` (one guard in the root load; the calendar group load keeps its own `pageLoad({ auth: 'user' })` for the scope, `(family)` has no load left) — `src/routes/(calendar)/calendar/+layout.server.ts:5-8`, `src/routes/(family)/+layout.server.ts:5-8` · `shell.http.db.test.ts › redirects a guest to /login from an app-chrome route`
- The calendar group's shared scope loads once per group entry (settings, family id, roster) and a failed family read degrades to `null`/`[]`, never a 500 — `src/routes/(calendar)/calendar/+layout.server.ts:9-21`, `src/lib/server/services/userScope.ts:9-22` · `shell.service.db.test.ts › reads settings, family and roster and degrades a failed family read to null/[]`
- Layout data carries a user **summary** only — id, names, email, isAdmin, emailVerified, lastActiveAt — never `passwordHash`, `receiptIngestToken` or `phonenumber` (all three are in the row the legacy layouts serialise), and never `pathname` (which would make the load re-run on every navigation) — `src/routes/(calendar)/calendar/+layout.server.ts:14-21`, `src/lib/server/db/schema.ts:18-45` · `shell.service.db.test.ts › returns a whitelisted user summary, never credentials`
- Time-zone probe: at most once per user per browser, only while settings timeZone is still `'UTC'`, gated by `localStorage['familyplanz:tzProbed:<userId>']`, then `POST` with `keepalive`, and the flag is set only after the save succeeds (the legacy code sets it first — fix, see Notes) — `src/routes/(calendar)/calendar/+layout.svelte:17-49` · `shell.timezone.state.test.ts › probes once per user, only while the zone is UTC, and retries after a failed save`
- Anonymous Account countdown is the 90-day Inactivity Window from `lastActiveAt`, rounded up and floored at 0 (no `lastActiveAt` → 90); urgent at ≤ 14 days flips the copy to red and shows the days left — `src/routes/(calendar)/calendar/+layout.svelte:51-58,247-263` · `shell.notices.rules.test.ts › counts the Inactivity Window down and turns urgent at 14 days`
- Top-notice precedence is a single chain — `?claimed=1` → unverified email → `?merged=N&tasks=M` → anonymous countdown; the first three are dismissable, the countdown is not, and a guest never sees claimed/merged — `src/routes/(calendar)/calendar/+layout.svelte:59-80,149-264` · `shell.notices.rules.test.ts › first matching notice wins and only the countdown cannot be dismissed`
- The unverified-email notice is self-sufficient: inline code input posts `/signup/password/verify`, Resend posts `/signup/password/resend`, failures render inline, "Sent again ✓" clears after 3 s — `src/routes/(calendar)/calendar/+layout.svelte:65-136,165-226` · `shell.verify.state.test.ts › shows the server error inline and clears the sent receipt after 3 s`
- Guest-merge copy pluralises the merged Event count and mentions tasks only when `tasks > 0` — `src/routes/(calendar)/calendar/+layout.svelte:227-246` · `shell.notices.rules.test.ts › pluralises the merge summary and omits tasks when zero`
- The offline banner is visible while offline, while changes are pending, or while the 4 s "Synced N changes." receipt is up; the offline paragraph renders only when actually offline; coming back online re-reads the pending count after 2 s — `src/lib/components/OfflineBanner.svelte:17-48,59-83` · `shell.offline.state.test.ts › keeps the banner up without claiming offline, then shows the 4 s receipt` and `ui/ShellOfflineBanner.svelte.test.ts › shows the offline explanation only when offline`
- The Alerts tab badge is fetched only for a signed-in user, a non-ok/throw answer is `0`, the badge caps at `99+`, and the accessible name is `Alerts (n unread)` — `src/lib/components/BottomNav.svelte:21-51,137-141,166` · `shell.badge.state.test.ts › caps the badge at 99+ and treats a failed count as 0` and `ui/ShellTabBar.svelte.test.ts › names the Alerts tab with its unread count`
- The tab bar hides with a class (never unmounts) while the on-screen keyboard is open, detected as `innerHeight - visualViewport.height > 150` — `src/lib/components/BottomNav.svelte:88-118` · `ui/ShellTabBar.svelte.test.ts › hides without unmounting while the on-screen keyboard is open`
- The error page has three branches: 404 ("We can't find that page"), other 4xx (the server's message, never claims notification), 5xx (claims automatic notification); only 5xx links the report CTA; status renders as `Error {status}` and the title is `{status} · Family Planz` — `src/routes/+error.svelte:6-23,60-73` · `shell.error.rules.test.ts › picks 404, 4xx and 5xx copy` and `ui/ShellErrorView.svelte.test.ts › keeps the notified copy and report CTA for 5xx only`
- The PWA manifest starts at `/calendar` and its share target posts to `/calendar`; `app.html` links the manifest, icons and theme colour — `static/manifest.webmanifest:5,42-50`, `src/app.html:5-12` · `shell.styles.test.ts › starts the manifest at /calendar with a /calendar share target`
- Both navs respect safe areas: navbar `env(safe-area-inset-top)`, tab bar `env(safe-area-inset-bottom)` — `src/lib/components/Navbar.svelte:76`, `src/lib/components/BottomNav.svelte:127-129` · `shell.styles.test.ts › pads both navs with env(safe-area-inset-*)`
- The calendar frame's footer (© server year, About, Privacy, Contact) is md-only; the family frame has no footer — `src/routes/(calendar)/calendar/+layout.svelte:276-286`, `src/routes/(family)/+layout.svelte:18-28` · `ui/ShellGroupFrame.svelte.test.ts › renders the footer links and the server year on calendar only`

## Depends on

- May import: kernel + every domain's public entries (`index.ts`, `index.server.ts`, `ui/index.ts`); never another screen (R1).
- Owns tables: none.
- Reads (join only): none — shell queries nothing; it composes domain services.
- Calls:
  - `identity` — the user summary's fields and the settings row the calendar group and the time-zone probe need (`timeZone`, `emailVerified`, `lastActiveAt`); identity decides what a summary is.
  - `family` — the viewer's family id and roster for the calendar group's shared scope (the module that owns the roster).
  - `alerts` — the bell component in the slot and the unread count behind `ShellBadgePort`.
  - `access` — verify-code and resend endpoints behind `ShellVerifyPort`; Claiming and the guest merge produce the `?claimed`/`?merged` URL flags the notices read.
  - `feedback` — `reportBugHref` for both menus and the error page.
  - kernel: `pageLoad`, `AppError` (read only), `testCtx` in tests; kernel/client `offlineQueue` + toasts (K-07); kernel/ui `BrandMark`, `Toaster`, `trapFocus` (K-08).
- Called by: `src/routes/+layout.svelte` + `src/routes/+layout.server.ts`, `src/routes/(calendar)/calendar/+layout.svelte` + `+layout.server.ts`, `src/routes/(family)/+layout.svelte` (no server file), `src/routes/+error.svelte`. Later, account (#18) and admin (#19) widen `shellChromeForRoute` instead of copying chrome.
