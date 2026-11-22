# account

**screen** — The /account page: ten hash sections (profile, families, notifications, calendar,
dashboard, plan & usage, email, security, API tokens, danger zone), one section's data loaded per
visit, plus the GDPR data export and the `/api/me` identity/delete wire.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules:
[docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns: the section list and its hash dispatch (`profile` … `danger`); the one page load and form
  action map for every account mutation; the lazy per-section data composition; the export document
  composed from each domain's slice; the `GET`/`DELETE /api/me` wire; the `/calendar/settings`
  redirect; the banner rule and the Dashboard section's mounted fact.
- Does not own: every rule it renders. Profile, email change, sessions, API tokens and user settings
  are identity's; notification preferences are alerts'; subscription, limits and AI usage are
  billing's; the dashboard hide list is dashboardModules'; calendars and the default-calendar rule
  are calendar's; the ad-consent trail is sponsored's; family memberships are family's.

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: the section list + hash rule, the wire types, the banner rule. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: page load, form actions, the lazy-section endpoint, the three `/api` handlers, the redirect, and the services. | — |
| [ui/index.ts](ui/index.ts) | entry | Public components: `AccountScreen` only. | — |
| [account.contract.ts](account.contract.ts) | contract | The wire: strict `GET /api/me` (`AccountMeResponse`), `DELETE /api/me` (`AccountDeleteBody` — every non-string confirmation is `''`, and a non-object body is the legacy `Invalid JSON`), the export document (hash refusal, names-only families), the section parameter built from `ACCOUNT_SECTIONS`, the seven page action forms (`Account*Form`: first-value text, a checkbox only on the literal `on`, a switch only on `true`, and one `module_<id>` key per registry module), the ten section models, and `AccountPagePaint` (the first paint's user + default section + load instant). | [account.contract.test.ts](account.contract.test.ts) |
| [account.sections.rules.ts](account.sections.rules.ts) | rules | `ACCOUNT_SECTIONS`, `AccountSectionId`, `resolveAccountSection`, `accountSectionHref`. The one list the rail, the page and the endpoint read. | [account.sections.rules.test.ts](account.sections.rules.test.ts) |
| [account.form.rules.ts](account.form.rules.ts) | rules | `accountBanner` (success needs a message; failures read `message` then `error`, then the approved fallback; `guestNeedsClaim`). Dependency-free on purpose: the shell renders it on every visit. | [account.form.rules.test.ts](account.form.rules.test.ts) |
| [account.dashboard.rules.ts](account.dashboard.rules.ts) | rules | The registry split into "Above your cards"/"Cards", the separate mounted fact (`meals` is parked, declared here until dashboardModules exports it), and the show-based form map (`accountHiddenModulesFromForm`, `accountModuleVisibility`). Loads with the Dashboard section. | [account.dashboard.rules.test.ts](account.dashboard.rules.test.ts) |
| [account.calendar.rules.ts](account.calendar.rules.ts) | rules | The five views, the IANA zone list (labels de-underscored, sorted, UTC fallback), and the consent-trail copy. | [account.calendar.rules.test.ts](account.calendar.rules.test.ts) |
| [account.subscription.rules.ts](account.subscription.rules.ts) | rules | The plan card's strings: period, renewal, usage, retention/archive cells, AI bar percent and reset line, and the token row's relative "last used". | [account.subscription.rules.test.ts](account.subscription.rules.test.ts) |
| [account.export.rules.ts](account.export.rules.ts) | rules | `EXPORT_VERSION`, the key order, `exportFileName`, `exportedAccountRow` (hash stripped), `exportedPersonNames`, `exportedFamilies`, `exportedEventIds`, `composeAccountExport`. | [account.export.rules.test.ts](account.export.rules.test.ts) |
| [account.export.repo.server.ts](account.export.repo.server.ts) | repo | The export's legacy selects (requester-scoped, hash never selected, names-only members), kept in one file until each owning domain exports its slice (Q-078 A; report ASK). | [account.export.repo.db.test.ts](account.export.repo.db.test.ts) |
| [account.export.service.server.ts](account.export.service.server.ts) | service | `getAccountExport`: identity first (a missing person row is a fault, never an empty document), then the slices in legacy order, then calendar by the exported tasks' event ids, then bills. | [account.export.service.db.test.ts](account.export.service.db.test.ts) |
| [account.service.server.ts](account.service.server.ts) | service | `getAccountIdentity`, `getAccountSection` (the ten-branch lazy composition), `getAccountPaint`, and the nine mutations — settings/dashboard/notifications/profile/sessions/tokens/deletion — each delegating to the owning domain. | [account.service.db.test.ts](account.service.db.test.ts) |
| [account.api.ts](account.api.ts) | api | `fetchSection` (typed against the section model) and `downloadExport(now)` (dated attachment). | — |
| [account.state.svelte.ts](account.state.svelte.ts) | state | `AccountScreenState` (active section, per-section cache, pending/error, export toasts) and `AccountFormEnhancer`. No domain import, so nothing heavy rides the first paint. | [account.state.test.ts](account.state.test.ts) |
| [account.notifications.state.svelte.ts](account.notifications.state.svelte.ts) | state | `AccountNotificationsState`: optimistic flip, receipt, and the revert through alerts' `saveOutcome`. Loads with the Notifications section. | [account.state.test.ts](account.state.test.ts) |
| [account.http.server.ts](account.http.server.ts) | http | `accountPageLoad`, the nine action handlers (`accountSaveCalendarSettingsAction` … `accountDeleteAccountAction`; `updateEmail` is access's `changeEmailAction` wired in the route), `accountSectionEndpoint`, `accountMeGetEndpoint`, `accountMeDeleteEndpoint`, `accountExportEndpoint`, `accountCalendarSettingsRedirect`. Legacy wording kept verbatim. | [account.http.db.test.ts](account.http.db.test.ts) (goldens) |
| [account.contract.test.ts](account.contract.test.ts) | test | The three `/api` bodies the golden pins and the ten section models. | — |
| [account.sections.rules.test.ts](account.sections.rules.test.ts) | test | The ten sections in order, every hash resolution, the fallback, the hrefs. | — |
| [account.form.rules.test.ts](account.form.rules.test.ts) | test | The banner's branches and the show-based module form. | — |
| [account.dashboard.rules.test.ts](account.dashboard.rules.test.ts) | test | Registry order, both bands, the one parked module. | — |
| [account.calendar.rules.test.ts](account.calendar.rules.test.ts) | test | Views, zone fallback/sort, consent sentences, empty-trail copy. | — |
| [account.subscription.rules.test.ts](account.subscription.rules.test.ts) | test | Every display cell, the relative "last used", the AI bar, the reset line. | — |
| [account.export.rules.test.ts](account.export.rules.test.ts) | test | Filename/day, key order, hash strip, names-only families, event-id union, composed document. | — |
| [account.export.repo.db.test.ts](account.export.repo.db.test.ts) | test | Every slice filtered to the requester; receipts only for own bills. | — |
| [account.export.service.db.test.ts](account.export.service.db.test.ts) | test | Envelope + key order, names-only members, missing-row fault. | — |
| [account.service.db.test.ts](account.service.db.test.ts) | test | Every IO Invariant in this README (see pin list). | — |
| [account.state.test.ts](account.state.test.ts) | test | One fetch per section, retry, export toasts, optimistic flip + revert. | — |
| [account.http.db.test.ts](account.http.db.test.ts) | test | Frozen golden for `GET`/`DELETE /api/me` and `GET /api/account/export` (unchanged since the S2 sha). | — |
| [ui/AccountScreen.svelte](ui/AccountScreen.svelte) | ui | Chrome (breadcrumbs, header, back link), rail, banner, the hash-selected section, skeletons and retry, the one Toaster. The section body is imported with `await import()`, and the rail's click hands it its section directly. | [ui/AccountScreen.svelte.test.ts](ui/AccountScreen.svelte.test.ts) |
| [ui/AccountSectionBody.svelte](ui/AccountSectionBody.svelte) | ui | The ten-section switch, kept in its own lazily imported chunk so the first paint does not ship every section. | — |
| [ui/AccountSidebar.svelte](ui/AccountSidebar.svelte) | ui | Section links from `ACCOUNT_SECTIONS` (each click hands its id to `onSelect`, so a hydrated hash click still switches), Report-a-Bug with `?from=/account#<section>` (Q-080 B), the signed-in-as card (never a guest placeholder). Colour/type come from the marketing tokens (`#129`). | [ui/AccountSidebar.svelte.test.ts](ui/AccountSidebar.svelte.test.ts) |
| [ui/AccountProfileSection.svelte](ui/AccountProfileSection.svelte) | ui | The name form, `update({reset:false})`, "Saving..." → "Update Profile". | — |
| [ui/AccountFamiliesSection.svelte](ui/AccountFamiliesSection.svelte) | ui | One row per family (initial, name, `N members · role`, "Manage →"), empty state, "+ Create a family". | — |
| [ui/AccountNotificationsSection.svelte](ui/AccountNotificationsSection.svelte) | ui | Skeleton rows, one native `role="switch"` submit per row, `aria-describedby` hints, `role="status"` receipt, JSON-column note, "See the alerts". | [ui/AccountNotificationsSection.svelte.test.ts](ui/AccountNotificationsSection.svelte.test.ts) |
| [ui/AccountCalendarSection.svelte](ui/AccountCalendarSection.svelte) | ui | Week start, IANA zone list, view, default calendar, colour, family sync, auto-parse, sponsorship + consent trail, save, ICS import. | [ui/AccountCalendarSection.svelte.test.ts](ui/AccountCalendarSection.svelte.test.ts) |
| [ui/AccountDashboardSection.svelte](ui/AccountDashboardSection.svelte) | ui | The two groups, scope + meaning, the parked badge, `module_<id>` checkboxes, the footer. | — |
| [ui/AccountSubscriptionSection.svelte](ui/AccountSubscriptionSection.svelte) | ui | Plan card (a paid plan's "Change plan"), limits table, AI bar + reset date, the Free plan's Family Master upgrade block. One `/pricing` link per reader. | [ui/AccountSubscriptionSection.svelte.test.ts](ui/AccountSubscriptionSection.svelte.test.ts) |
| [ui/AccountEmailSection.svelte](ui/AccountEmailSection.svelte) | ui | Guest Claim CTA vs the address, status and change form. The input keeps the legacy `id="email"` hook. | [ui/AccountEmailSection.svelte.test.ts](ui/AccountEmailSection.svelte.test.ts) |
| [ui/AccountSecuritySection.svelte](ui/AccountSecuritySection.svelte) | ui | One "Logout from All Other Devices" action. | — |
| [ui/AccountApiTokensSection.svelte](ui/AccountApiTokensSection.svelte) | ui | Create form, plaintext-once box with Copy, token rows with relative last-used and Revoke, empty state. | — |
| [ui/AccountDangerSection.svelte](ui/AccountDangerSection.svelte) | ui | The export card (state toasts) and the two-step typed-id delete. | [ui/AccountDangerSection.svelte.test.ts](ui/AccountDangerSection.svelte.test.ts) |
| [ui/AccountScreen.svelte.test.ts](ui/AccountScreen.svelte.test.ts) | test | Chrome, section rendering, banner fallback, guest claim link. | — |
| [ui/AccountSidebar.svelte.test.ts](ui/AccountSidebar.svelte.test.ts) | test | Links, the click's `onSelect`, report link location, guest card. | — |
| [ui/AccountSubscriptionSection.svelte.test.ts](ui/AccountSubscriptionSection.svelte.test.ts) | test | One `/pricing` link on a free plan and on a paid one. | — |
| [ui/AccountNotificationsSection.svelte.test.ts](ui/AccountNotificationsSection.svelte.test.ts) | test | Skeletons, switches, optimistic flip, receipt, note. | — |
| [ui/AccountCalendarSection.svelte.test.ts](ui/AccountCalendarSection.svelte.test.ts) | test | Consent labels, options, reload sync. | — |
| [ui/AccountEmailSection.svelte.test.ts](ui/AccountEmailSection.svelte.test.ts) | test | Guest CTA vs real form. | — |
| [ui/AccountDangerSection.svelte.test.ts](ui/AccountDangerSection.svelte.test.ts) | test | Reveal/cancel, export press. | — |

## Public interface

- `index.ts`:
  - `ACCOUNT_SECTIONS` — the ten sections in their fixed order (`id`, `label`).
  - `resolveAccountSection(hash)` / `accountSectionHref(id)` — the one home for "which section is
    showing" and the in-page link.
  - `AccountSectionId`, `AccountSectionParam` (the `z.enum` built from the same list).
  - `accountBanner(form)` — the green/red banner rule.
  - `AccountMe`, `AccountExportDocument`, `AccountSectionModel`, `AccountPersonModel`,
    `AccountPagePaint` — the wire and the first paint.
- `index.server.ts`:
  - `accountPageLoad` — the `/account` load: auth guard, the rail's identity, the default (profile)
    section and the load instant. No section-specific query beyond the profile row.
  - the nine action handlers — `saveCalendarSettings`, `saveDashboardModules`,
    `setNotificationPreference`, `updateProfile`, `logoutAllDevices`, `createApiToken`,
    `revokeApiToken`, `deleteAccount` (the export is a GET); `updateEmail` is access's
    `changeEmailAction`, wired by the route as legacy did.
  - `accountSectionEndpoint` — `GET /account/section/[section]`: the lazy per-section model, page
    data outside `/api` (Q-077); a signed-out caller gets the house JSON 401.
  - `accountMeGetEndpoint`, `accountMeDeleteEndpoint` — the identity and deletion wire.
  - `accountExportEndpoint` — the export as a dated JSON attachment.
  - `accountCalendarSettingsRedirect` — `/calendar/settings` → `/account#calendar`.
  - `getAccountSection`, `getAccountIdentity`, `getAccountPaint`, `getAccountExport`, and the
    mutation services (each delegates to the owning domain).
- `ui/index.ts`: `AccountScreen` — the page body.

## How to test

- Whole module: `npm run test:mod -- account`.
- Pure rules: the five `*.rules.test.ts` tables run in node with no setup.
- Database + services: `account.service.db.test.ts`, `account.export.repo.db.test.ts`,
  `account.export.service.db.test.ts` use `rollbackTest` and `testCtx({ db })` with the REAL identity
  ports (`createCalendarAccessPort`, `sponsoredAdConsentPort`) — needs Postgres.
- HTTP contract: [account.http.db.test.ts](account.http.db.test.ts) pins `GET /api/me`,
  `DELETE /api/me` and `GET /api/account/export` only (committed mode: the goldens run legacy
  semantics through the `db` singleton). The page actions and the section endpoint get no goldens;
  the service tests cover them.
- UI: `ui/*.svelte.test.ts` render with props; `account.state.test.ts` drives both state classes
  with a fake api and no DOM.

## Invariants

Each line names the test that pins it.

- The ten sections keep their fixed order and the hash selects the body from the same list; an
  empty/unknown hash falls back to the first — `account.sections.rules.test.ts › keeps the ten
  approved sections in order`, `› resolves a hash to its section and falls back to the first`.
- `/calendar/settings` is only a 302 to `/account#calendar` — `account.http.db.test.ts` (golden
  runs the route module; the redirect is the handler).
- Both the page load and the section endpoint refuse a signed-out caller: the load 302s `/login`
  (kernel `pageLoad` auth `user`), the section endpoint answers `401 {"error":"Unauthorized"}` —
  `account.service.db.test.ts` (no actor reaches no service) and the kernel's
  `endpoint.test.ts › answers 401` for the mapping.
- An Anonymous Account gets the Claim CTA instead of the email form, the rail never prints its
  placeholder address, and the email section shows no change form —
  `ui/AccountEmailSection.svelte.test.ts › a guest gets no placeholder address, no change-email
  form, a claim link instead`, `ui/AccountSidebar.svelte.test.ts › a guest gets the claim line
  instead of a placeholder address`.
- The export is requester-only: `passwordHash` is stripped, other family members cross as names
  only, every SELECT is filtered to the requester, and a missing user row throws —
  `account.export.service.db.test.ts › carries other family members as names only`, `› throws when
  the user row is missing rather than exporting emptiness`, `account.export.repo.db.test.ts`
  (every slice), `account.http.db.test.ts › downloads the requester document and no other member
  private rows`.
- The export is one JSON document as
  `attachment; filename="familyplanz-export-YYYY-MM-DD.json"` with
  `Content-Type: application/json; charset=utf-8` — `account.http.db.test.ts › downloads the
  requester document …`, `› answers 401 … when signed out` (no attachment header on a refusal).
- API-token plaintext exists only in the create answer; storage is a hash; revocation is
  owner-scoped — `account.service.db.test.ts › shows the plaintext once and stores only a hash`.
- `defaultCalendarId` must be a calendar the user can see; otherwise the save is a 400 and writes
  nothing — `account.service.db.test.ts › rejects a default calendar the caller cannot see and
  writes nothing`, `› accepts a family-shared calendar and saves the card values`.
- A user with no settings row reads the approved defaults (`sunday`, `UTC`, `#3b82f6`, `dayView`,
  no default calendar, sync off, ads off) and merely viewing writes nothing —
  `account.service.db.test.ts › calendar shows the approved defaults and writes no settings row`.
- Ads are opt-in; the consent trail is written only on a transition —
  `account.service.db.test.ts › records consent only when the ad setting changes`; a throwing
  consent write cannot fail the save (identity's settings service, pinned by
  `identity.settings.service.db.test.ts › saves and logs when the consent write throws`).
- Dashboard switches are show-based: absent checkbox = hidden, only canonical ids survive, a stale
  saved id hides nothing — `account.service.db.test.ts › stores the posted hidden list and answers
  the legacy receipt`, `account.form.rules.test.ts › hides every module whose checkbox is absent,
  in registry order`, `› ignores a stale saved id rather than hiding everything`.
- Notification preferences are four ids with defaults on/on/off/on; a write preserves the billing
  `email`/`sms` halves — `account.service.db.test.ts › keeps the billing email and sms halves and
  replaces only preferences`, `account.service.db.test.ts › notifications default to on, on, off,
  on for an account with no row`.
- A notification toggle flips optimistically with a receipt, and a failed save puts the switch back
  — `account.state.test.ts › puts the switch back where the server still has it when the save
  fails`, `ui/AccountNotificationsSection.svelte.test.ts › flips aria-checked the moment it is
  pressed, before the save answers`.
- Email change is access's flow (3/15 min, guest refusal with `guestNeedsClaim`), wired unchanged —
  access's `changeEmailAction` awaits its own tests (`access.http.db.test.ts`).
- Logging out other devices keeps the caller's own session and every API token —
  `account.service.db.test.ts › a cookie caller keeps its own session and every token`.
- Deleting an account requires the typed id, invalidates the sessions, then clears task
  assignments, the billing rows and the person row in one transaction, in that order —
  `account.service.db.test.ts › clears task assignments, billing rows and sessions before the
  person row`, `› rejects a confirmation that is not the caller id and deletes nothing`,
  `account.http.db.test.ts › deletes the account, its sessions, tokens and subscription after the
  typed id`.
- Every page action is guarded: a signed-out POST gets `{success:false, error:'Not signed in'}` and
  writes nothing — kernel `formAction` auth `user` (see `pageHandlers.test.ts`).
- Profile save requires both names — `account.service.db.test.ts › refuses a profile save with an
  empty name`.
- The families section lists one row per family with the real roster count and the user's role —
  `account.service.db.test.ts › families lists every membership with its role and member count`.
- The calendar card re-syncs its fields only when a reloaded model arrives, and the zone list falls
  back to UTC — `ui/AccountCalendarSection.svelte.test.ts › syncs fields when reloaded settings
  arrive, and not on a user edit`, `account.calendar.rules.test.ts › falls back to UTC alone when
  the browser lacks supportedValuesOf`.
- Consent history prints `Consented — <date>` / `Consent withdrawn — <date>`, or the approved
  empty-trail sentence — `ui/AccountCalendarSection.svelte.test.ts › renders each consent event
  with its decision labelled and dated`, `› says the trail has not started when it is empty`.
- Plan & usage shows the plan, the limits table, the AI bar with its reset date when a real limit
  exists, and degrades to the free plan instead of a dead section —
  `account.service.db.test.ts › subscription degrades to the free plan with no rows`,
  `account.subscription.rules.test.ts`.
- Notification rows show skeletons before the loader answers, the switch is a native `role="switch"`
  submit with `aria-checked`, and the receipt is a `role="status"` region —
  `ui/AccountNotificationsSection.svelte.test.ts › renders skeleton rows and no switch before the
  loader answers`, `› renders the four switches in order with their checked state`.
- The export button acknowledges immediately, then reports success or failure —
  `account.state.test.ts › toasts the export as it starts and after it lands`, `› explains a failed
  export instead of claiming success`.
- Account deletion is a two-step confirm and success redirects home —
  `ui/AccountDangerSection.svelte.test.ts › reveals the typed-id form on Delete Account and
  returns on Cancel`, `account.http.db.test.ts › deletes the account …`.
- `GET /api/me` returns only the caller's own row, masks an Anonymous Account's email and never
  leaks the hash — `account.http.db.test.ts › answers the caller identity, roles, ISO lastActiveAt
  and familyId`, `› masks an Anonymous Account placeholder email and reports isAnonymous`, `›
  reports email null with isAnonymous false for a real account with no email`.
- `DELETE /api/me` has one refusal for every non-string confirmation and `Invalid JSON` for a
  malformed or non-object body — `account.http.db.test.ts` (five refusals).

## Depends on

- May import: kernel + every domain (public entries only); never another screen (R1).
- Owns tables: none.
- Calls: identity (person, profile, email-safe view, settings read/save, sessions, API tokens,
  deletion); alerts (notification preferences and receipt wording); billing (subscription summary,
  limits, AI usage, plan pricing, subscription deletion); dashboardModules (canonical ids and the
  hide save); calendar (the calendars the card lists, the default-calendar access port); sponsored
  (the consent trail, through identity's settings service); family (memberships, roster sizes);
  tasks (the assignment clear inside the deletion transaction); access (the email-change action).
- Called by: `src/routes/(calendar)/account/+page.server.ts` and `+page.svelte`;
  `src/routes/(calendar)/account/section/[section]/+server.ts`;
  `src/routes/(calendar)/calendar/settings/+page.server.ts`; `src/routes/api/me/+server.ts`;
  `src/routes/api/account/export/+server.ts`.

**Notes**

- e2e hooks (2026-11-21, `e2e/account/*` + `e2e/calendar/SettingsPage.test.ts`): the rail's link
  hands its section to `onSelect` as well as carrying the `href` — once hydrated, SvelteKit moves a
  same-page hash click without a `hashchange` event, so the fragment alone did not switch the body
  (`AccountSettings.test.ts:62` clicked Security and stayed on Profile). The dashboard module
  switches stay in their own `#dashboard` section: legacy's split (#105) pinned that the calendar
  form renders none of them, because a save would derive the hidden list from a form that has no
  module checkboxes. The plan card links `/pricing` only for a paid plan and the Family Master block
  only for a free one: two links at once made the leaf `a[href="/pricing"]` ambiguous
  (`SettingsPage.test.ts:77`); legacy printed both. `input#email` is the legacy hook (`EmailChange`,
  `ProfileEditing`), so the Email section's wrapper carries no id of its own — legacy had both, a
  duplicate id that left the label pointing at the wrapper.
- `#129` design conformance (`e2e/conformance/account-known-bad.test.ts`): the rail title is a 12px
  marketing size tracked to the prototype's 0.88px, the identity badge background is the warm-100
  token (`#fdede0`) instead of the bespoke blush, and the screen's skeleton bars take the canvas
  token (`#f8f6f3`) — the kernel skeleton's slate-200 is not in the marketing colour set.
- Verse deleted 2026-11-12 (Q-031/Q-032): `verseTranslation` left the settings wire and save;
  `showDailyVerse` stays on the `/api/me/settings` wire but the account form never posts it.
- Q-083: the app shell layout will own Navbar/Toaster/BottomNav and the `/login` guard; until the
  shell screen lands, the account route keeps its legacy `+layout.server.ts` / `+layout.svelte`
  (removing them today would drop the page's chrome), and the page load keeps its own auth guard.
- Q-077: the lazy `GET /account/section/[section]` route is page data outside `/api`.
- Bundle split (ADR 0010 / perf:check): the ten sections live behind
  `ui/AccountSectionBody.svelte` and load with `await import()`; the notification state moved to
  `account.notifications.state.svelte.ts` (alerts + zod) and the dashboard form map to
  `account.dashboard.rules.ts` (dashboardModules + zod), so neither rides the first paint. The rail
  computes its label from the wire's already-masked fields instead of importing identity's entry
  (luxon), and `account.form.rules.ts` is dependency-free.
- Q-080 B: the rail's Report-a-Bug link carries `?from=/account#<section>`.
- Section models carry ISO strings (the service maps the domains' `Date`s), so the page load and the
  section endpoint serve one shape; relative labels use the page load's `now`.
- The families model's `memberType` is `null`: family's list payload does not carry it and the page
  shows only the role (report ASK).
- The export's selects live in this screen's repo until each owning domain exports its slice
  (Q-078 A; report ASK). The repo imports the per-owner table modules rather than the barrel,
  because a screen must not declare foreign table ownership.
- The deletion composition clears task assignments per family the person belongs to (tasks' one
  family-scoped use-case); a lingering assignment in a family the person had already left keeps its
  status on the set-null FK. A tasks-level "clear a person's assignments" use-case is the fix
  (report ASK).
- `accountNotifications.ts` (legacy rules) is gone with alerts' S8 (2026-11-21), together with the
  legacy `src/lib/server/db/actions/notificationMethods.ts`: the four-switch rules and the stored-bag
  read live in the alerts domain, which the notifications section consumes through its public entry.
