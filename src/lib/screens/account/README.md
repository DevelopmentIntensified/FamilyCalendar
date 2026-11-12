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
  redirect.
- Does not own: every rule it renders. Profile, email change, sessions, API tokens and user settings
  are identity's; notification preferences are alerts'; subscription, limits and AI usage are
  billing's; the dashboard hide list is dashboardModules'; calendars and the default-calendar rule
  are calendar's; the ad-consent trail is sponsored's; the verse catalogue is verse's; family
  memberships are family's; every exported row is selected by the domain that owns its table.

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: the section list, its hash rule and the contract types. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: page load, form actions, the lazy-section endpoint and the three `/api` handlers. | — |
| [ui/index.ts](ui/index.ts) | entry | Public components: `AccountScreen` only. | — |
| [account.http.db.test.ts](account.http.db.test.ts) | test | Golden contract for `GET /api/me`, `DELETE /api/me` and `GET /api/account/export`: full bodies, every refusal, side effects, and the requester-only export scope. Runs committed because the legacy handlers use the `db` singleton. | — |

## Public interface

Designed at S1; implemented in the named files (see the sheet's Plan).

- `index.ts`:
  - `ACCOUNT_SECTIONS` — the ten sections in their fixed order (`id`, `label`). The rail, the page
    dispatch and the section endpoint all read this one list, so a section cannot exist in the nav
    without a body (the 105 bug).
  - `resolveAccountSection(hash)` — the section a hash names, or the first one when it is empty or
    unknown. One home for "which section is showing".
  - `AccountSectionId` — the union of the ten ids.
  - `AccountSectionModel` — the discriminated union one section's endpoint returns: only that
    section's data, typed from the owning domain's model (never hand-mirrored).
  - `AccountMe` / `AccountExportDocument` — the two `/api` response shapes.
- `index.server.ts`:
  - `accountPageLoad` — the `/account` load: auth guard, the signed-in-as identity and the default
    section's model. Nothing else is read on first paint.
  - `accountFormActions` — the nine actions (`saveCalendarSettings`, `saveDashboardModules`,
    `setNotificationPreference`, `updateProfile`, `updateEmail`, `logoutAllDevices`,
    `createApiToken`, `revokeApiToken`, `deleteAccount`; the export is a GET, not an action). Each
    delegates to the owning domain's service and returns the legacy `{success, message}` /
    `{success:false, error}` shape.
  - `accountSectionEndpoint` — `GET /account/section/[section]`: the lazy per-section model. Internal
    page data, deliberately outside `/api`.
  - `accountMeGetEndpoint`, `accountMeDeleteEndpoint` — the identity and account-deletion wire.
  - `accountExportEndpoint` — the export document as an attachment.
  - `accountCalendarSettingsRedirect` — `/calendar/settings` → `/account#calendar`.
- `ui/index.ts`:
  - `AccountScreen` — the page: chrome, rail and the mounted section, with skeleton/pending states.

## How to test

- Whole module: `npm run test:mod -- account` (add `--legacy` while legacy tests remain).
- Pure rules: `account.sections.rules.test.ts` and `account.export.rules.test.ts`, plain tables of
  input → expected output, no setup.
- Database + services: `account.service.db.test.ts` using `rollbackTest` and `testCtx({ db })`
  (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: `account.http.db.test.ts` pins status + body of every endpoint the sheet lists
  (golden tests; committed mode, because the legacy handlers write through the `db` singleton).
- UI: `ui/*.svelte.test.ts` render with props; `account.state.test.ts` drives the state class with a
  fake api and no DOM.
- Fixtures: none in this folder — a screen owns no tables, so row builders live in the owning
  domains.

## Invariants

Behaviour that must not change, each with the test that pins it (`file › test title`). Golden tests
exist now; `planned:` tests are written in S3–S7 against the new files in the sheet's Plan.

- Ten sections in one fixed order — profile, families, notifications, calendar, dashboard,
  subscription ("Plan & usage"), email, security, api, danger — and the hash selects the body from
  that same list; an empty/unknown hash falls back to the first. Evidence:
  `src/lib/components/account/accountSections.ts:15-40`,
  `src/routes/(calendar)/account/+page.svelte:30,90-125`. Pin: `planned: account.sections.rules.test.ts
  › keeps the ten approved sections in order`, `› resolves a hash to its section and falls back to
  the first`.
- `/calendar/settings` is only a 302 to `/account#calendar`. Evidence:
  `src/routes/(calendar)/calendar/settings/+page.server.ts:5-7`. Pin: `planned:
  account.http.db.test.ts › redirects /calendar/settings to /account#calendar`.
- Both the account layout and the page 302 `/login` without a user. Evidence:
  `src/routes/(calendar)/account/+layout.server.ts:4-9`,
  `src/routes/(calendar)/account/+page.server.ts:58-61`. Pin: `planned: account.service.db.test.ts
  › refuses the page load without a user`.
- An Anonymous Account gets the Claim CTA instead of the email-change form, the rail prints
  "No email yet · Save your calendar" and never the placeholder address, and the server refuses a
  change with `guestNeedsClaim` (the banner adds the `/claim` link). Evidence:
  `src/lib/components/account/AccountEmailSection.svelte:12-26`,
  `src/lib/components/account/AccountSidebar.svelte:26-27`,
  `src/lib/server/services/accountData.ts:324-335`. Pin: `planned: ui/AccountEmailSection.svelte.test.ts
  › guest: no placeholder address, no change-email form, a claim link instead`, `planned:
  account.service.db.test.ts › refuses an email change for an Anonymous Account with guestNeedsClaim`.
- The export is requester-only: `passwordHash` is destructured away, other family members appear as
  `{id, firstName, lastName}` only, auth-mechanical tables (`auth_session`, `auth_account`,
  `api_tokens`, `pushSubscriptions`, `claimTokens`, `codes`) and the consent/usage tables are
  excluded, every SELECT is filtered to the requester, and a missing user row throws instead of
  exporting emptiness. Evidence: `src/lib/server/db/actions/export.ts:27-33,66-73,162-184`. Pin:
  `account.http.db.test.ts › GET /api/account/export › downloads the requester document and no other
  member private rows`, `› includes a task assigned to the requester even when someone else owns
  it`, `› exports empty collections for a user who has stored nothing`.
- The export is one JSON document delivered as `attachment; filename="familyplanz-export-YYYY-MM-DD.json"`
  with `Content-Type: application/json; charset=utf-8`, and the route refuses an unauthenticated
  caller before reading any data. Evidence: `src/routes/api/account/export/+server.ts:10-34`. Pin:
  `account.http.db.test.ts › GET /api/account/export › answers 401 {"error":"Unauthorized"} when
  signed out`, `› downloads the requester document …`.
- API-token plaintext exists only in the create response; storage is a hash, list rows never carry
  `tokenHash`, and revocation is owner-scoped. Evidence:
  `src/lib/server/services/accountData.ts:418-451`. Pin: `planned: identity service tests` (the
  token endpoints are identity's; this screen only shows the one-time plaintext and the masked row).
- `defaultCalendarId` must be one of the calendars the user can see; otherwise the save returns
  400 "Selected default calendar is not available" and writes nothing. Evidence:
  `src/lib/server/services/accountData.ts:161-169`. Pin: `planned: account.service.db.test.ts
  › rejects a default calendar the user cannot see and writes nothing`.
- A user with no settings row reads the approved defaults (`weekStart sunday`, `timeZone UTC`,
  `color #3b82f6`, `defaultView dayView`, `defaultCalendarId null`, sync off, ads off,
  `verseTranslation esv`), and merely viewing writes nothing. Evidence:
  `src/lib/server/services/accountData.ts:52-67,86-99`. Pin: `planned: account.service.db.test.ts
  › shows the approved defaults and writes no row on a read`.
- An unknown `verseTranslation` is stored as `'esv'`, and a retired `'kjv'` row is coerced in the
  select so it never renders blank. Evidence: `src/lib/server/services/accountData.ts:159`,
  `src/lib/components/account/AccountCalendarSection.svelte:70-80`. Pin: `planned:
  account.service.db.test.ts › saves an unknown verse translation as esv`.
- Ads are opt-in (`showAdsAsEvents` default false); the consent trail is written only on a
  transition, and a consent-write failure is logged but must not fail the settings save. Evidence:
  `src/lib/server/services/accountData.ts:60-62,171-202`. Pin: `planned: account.service.db.test.ts
  › records consent only when the ad setting changes`, `› saves the setting even when the consent
  write fails`.
- Dashboard switches are show-based: the action stores the inverse, only canonical ids survive, a
  saved id the list no longer carries hides nothing, and the save is its own action. Evidence:
  `src/lib/components/account/accountDashboardModules.ts:40-54`,
  `src/lib/server/services/accountData.ts:209-240`. Pin: `planned: account.service.db.test.ts
  › hides the cards whose checkbox is absent and keeps canonical ids only`.
- Notification preferences are exactly four ids in the approved order with defaults on/on/off/on
  ("Someone joined the family" is the only opt-in); only real booleans read as set; a write
  preserves the billing `email`/`sms` halves and replaces only `preferences`. Evidence:
  `src/lib/components/account/accountNotifications.ts:37-99,120-160`. Pin: `planned:
  account.service.db.test.ts › defaults to on, on, off, on and keeps email/sms byte-identical`.
- A notification toggle flips optimistically with a receipt, and a failed save puts the switch back
  where the server still has it. Evidence:
  `src/lib/components/account/AccountNotificationsSection.svelte:51-125`,
  `src/lib/components/account/accountNotifications.ts:191-203`. Pin: `planned:
  account.state.test.ts › reverts the switch to the server value when the save fails`.
- Email change: 3 sends / 15 min keyed `email-change:<userId>`; mails the new address a code plus a
  15-minute JWT link to `/account/verify-email`; wipes the old address's codes then creates an
  `email_change` code bound to the current email with `pendingEmail`; rejects the current address.
  Evidence: `src/lib/server/services/accountData.ts:313-389`. Pin: `planned:
  account.service.db.test.ts › throttles the fourth send in 15 minutes`, `› binds the code to the
  current address with pendingEmail and wipes stale codes`, `› rejects a change to the current
  address`.
- Logging out other devices revokes every session except the caller's own (a Bearer caller has none,
  so all web sessions go); API tokens are untouched. Evidence:
  `src/lib/server/services/accountData.ts:397-415`. Pin: `planned: account.service.db.test.ts
  › a caller with no session signs out every web session and no token`.
- Deleting an account requires the typed user id, invalidates the caller's session and all user
  sessions, then deletes the user (tokens and family membership cascade; subscription rows go
  first). Evidence: `src/lib/server/services/accountData.ts:453-467`,
  `src/lib/server/db/actions/users.ts:103-115`. Pin: `account.http.db.test.ts › DELETE /api/me
  › deletes the account, its sessions, tokens and subscription after the typed id`, `› rejects a
  confirmation that is not the caller id and deletes nothing`.
- Every page action is guarded: a signed-out POST gets `fail(401, {success:false, error:'Not signed
  in'})` and writes nothing. Evidence: `src/lib/server/utils/requireUser.ts:18-33`,
  `src/routes/(calendar)/account/+page.server.ts:136-248`. Pin: `planned:
  account.service.db.test.ts › every action refuses a signed-out caller and writes nothing`.
- Profile save requires both names (`400 First name and last name are required`). Evidence:
  `src/lib/server/services/accountData.ts:260-281`. Pin: `planned: account.service.db.test.ts
  › refuses a profile save with an empty name`.
- The families section lists one row per family with its real `memberCount` and the user's role, and
  every family's calendar is named after its own family (not just the first). Evidence:
  `src/lib/components/account/AccountFamiliesSection.svelte:17-70`,
  `src/lib/components/account/accountCalendars.ts:5-16`. Pin: `planned:
  account.service.db.test.ts › lists every membership with its role and member count`.
- The calendar section re-syncs its fields from the loader only when the settings identity changes
  (post-submit reload), never on user edits; the time-zone list falls back to UTC when
  `Intl.supportedValuesOf` is missing. Evidence:
  `src/lib/components/account/AccountCalendarSection.svelte:31-80`. Pin: `planned:
  ui/AccountCalendarSection.svelte.test.ts › syncs fields when reloaded settings arrive`.
- Consent history prints `Consented — <date>` / `Consent withdrawn — <date>` (en-GB long date) or
  "No ad consent recorded yet — the trail begins when the setting is first changed." Evidence:
  `src/lib/components/account/AccountCalendarSection.svelte:31-38,283-295`. Pin: `planned:
  ui/AccountCalendarSection.svelte.test.ts › renders each consent event with its decision and date`.
- Plan & usage shows the current plan, the limits table, AI usage with its reset date when a real
  limit exists, and the upgrade block; a subscription read failure degrades to the free-plan state
  instead of a dead section. Evidence: `src/lib/server/services/accountData.ts:104-127`,
  `src/lib/components/account/AccountSubscriptionSection.svelte:62-219`. Pin: `planned:
  account.service.db.test.ts › degrades to the free plan when the subscription read fails`.
- Notification rows show skeletons before the loader answers, the switch is a native `role="switch"`
  submit with `aria-checked`, and a `role="status"` receipt names the row. Evidence:
  `src/lib/components/account/AccountNotificationsSection.svelte:77-190`. Pin: `planned:
  ui/AccountNotificationsSection.svelte.test.ts › renders skeleton rows and a status receipt`.
- The export button acknowledges immediately with "Preparing your data export…", then reports
  "Data export downloaded." or "Data export failed — please try again." Evidence:
  `src/lib/components/account/AccountDangerSection.svelte:15-55`. Pin: `planned:
  account.state.test.ts › toasts the export as it starts and after it lands`.
- Account deletion is a two-step confirm: Delete Account reveals an inline red form asking for the
  user id, with Confirm Deletion / Cancel, and success redirects home. Evidence:
  `src/lib/components/account/AccountDangerSection.svelte:57-118`,
  `src/routes/(calendar)/account/+page.server.ts:237-248`. Pin: `planned:
  ui/AccountDangerSection.svelte.test.ts › reveals the id form and returns on cancel`.
- `GET /api/me` returns only the caller's own row: `id`, `firstName`/`lastName` (nullable),
  `email` masked to `null` for an Anonymous Account, `emailVerified`, `isAnonymous`, `roles`,
  `lastActiveAt` as ISO or null, `familyId` or null — never `passwordHash` or phone fields.
  Evidence: `src/routes/api/me/+server.ts:18-35`. Pin: `account.http.db.test.ts › GET /api/me
  › answers the caller identity, roles, ISO lastActiveAt and familyId`, `› masks an Anonymous
  Account placeholder email and reports isAnonymous`, `› reports email null with isAnonymous false
  for a real account with no email`.
- `DELETE /api/me` takes `{confirmation}`; a missing, null or non-string confirmation is `''` and
  answers 400 "Confirmation does not match"; malformed or non-object JSON answers 400 "Invalid
  JSON". Evidence: `src/routes/api/me/+server.ts:42-51`,
  `src/lib/server/services/accountData.ts:453-467`. Pin: `account.http.db.test.ts › DELETE /api/me
  › rejects an absent confirmation with the same message`, `› rejects a null confirmation with the
  same message`, `› answers 400 {"error":"Invalid JSON"} for a malformed body`.

## Depends on

- May import: kernel + every domain (public entries only); never another screen (R1).
- Owns tables: none.
- Reads (join only): none. Every exported row is selected by the domain that owns its table.
- Calls: identity (identity, profile, email change, sessions, API tokens, account deletion, user
  settings, settings defaults); alerts (notification preferences and their receipt wording); billing
  (subscription summary, plan limits, AI usage, plan pricing); dashboardModules (canonical module
  ids and the hidden list); calendar (the user's calendars and the default-calendar check); verse
  (translation catalogue); sponsored (ad-consent trail and the consent write); family (memberships,
  names, roster sizes); tasks, bills and groceries (their export slices). Export-only, in legacy
  order: identity and the parallel billing/family/tasks/groceries/alerts reads, then calendar with
  the exported tasks' event ids, then bills' receipt items.
- Called by: `src/routes/(calendar)/account/+page.server.ts` and `+page.svelte`;
  `src/routes/(calendar)/account/section/[section]/+server.ts`;
  `src/routes/(calendar)/calendar/settings/+page.server.ts`; `src/routes/api/me/+server.ts`;
  `src/routes/api/account/export/+server.ts`.
