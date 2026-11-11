# Port sheet: account

**screen** · port #18 · home: `src/lib/screens/account/` · README after the port: `src/lib/screens/account/README.md` (written in S1)

The /account page: one section per domain (profile, calendar settings, notifications, plan, tokens, danger zone) + data export.

- **May import:** kernel + any domain (public entries); never another screen.
- **Owns tables:** none.
- **Must be ported first:** identity, billing, alerts, dashboardModules, calendar, verse, sponsored (from the legacy import graph; see the ledger).
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

- Ten hash sections; anonymous accounts see the Claim CTA and cannot edit email (#242).
- Export is requester-only JSON with `passwordHash` stripped (#189).
- API tokens are shown once.
- `defaultCalendarId` must be one of the user's calendars (#167).
- Android uses `/api/me`, `/api/me/settings|profile|email|sessions/revoke-others|api-tokens|dashboard-modules|notification-preferences|subscription|verify-email|claim`, `/api/account/export`.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/me` | GET | required (cookie session or Bearer API token) | none | 200 `{id, firstName|null, lastName|null, email|null (anonymous placeholder masked to null), emailVerified, isAnonymous, roles[], lastActiveAt: ISO|null, familyId|null}` | 401 `{ "error": "Unauthorized" }` | `src/routes/api/me/+server.ts:18-35` |
| `/api/me` | DELETE | required | JSON `{ confirmation: <caller's user id> }`; non-string → `''` | 200 `{ "success": true }` | 401 `{ "error": "Unauthorized" }`; 400 `{ "error": "Confirmation does not match" }`; malformed JSON → `readJsonObject` response | `src/routes/api/me/+server.ts:42-51`, `src/lib/server/services/accountData.ts:453-467` |
| `/api/account/export` | GET | required | none | 200 JSON document as attachment, `Content-Disposition: attachment; filename="familyplanz-export-YYYY-MM-DD.json"`, `Content-Type: application/json; charset=utf-8` | 401 `{ "error": "Unauthorized" }` | `src/routes/api/account/export/+server.ts:10-34` |
| `/account` | POST `?/saveCalendarSettings` | required | `weekStart`, `timeZone`, `color`, `defaultView`, `defaultCalendarId` (`''` → null), `syncEventsToFamilyCalendar`=`on`, `autoParseEventDetails`=`true`, `showDailyVerse`=`true`, `showAdsAsEvents`=`true`, `verseTranslation` | `{ success: true, message: 'Calendar settings saved successfully' }` | 401 `Not signed in` (as `{success:false,error}`); 400 `Selected default calendar is not available`; 500 `Failed to save calendar settings` | `src/routes/(calendar)/account/+page.server.ts:137-154`, `src/lib/server/services/accountData.ts:154-206` |
| `/account` | POST `?/saveDashboardModules` | required | checkboxes named `module_<id>`; an absent checkbox means hidden | `{ success: true, message: '<n> of <total> cards on.' / 'all <total> cards on.' }` | 401 `Not signed in`; 500 `Failed to save dashboard modules` | `src/routes/(calendar)/account/+page.server.ts:157-162`, `src/lib/server/services/accountData.ts:209-240` |
| `/account` | POST `?/setNotificationPreference` | required | `preference` (one of the four ids), `value`=`true`/`false` | `{ success: true, message: '<label> alerts are on/off. Saved.' }` | 401 `Not signed in`; 400 `Unknown notification preference`; 400 `Notification preference value is required`; 500 `<label> alerts are on/off. This did not save.` | `src/routes/(calendar)/account/+page.server.ts:165-183`, `src/lib/server/services/accountData.ts:246-262` |
| `/account` | POST `?/updateProfile` | required | `firstName`, `lastName` | `{ success: true, message: 'Profile updated successfully' }` | 401 `Not signed in`; 400 `First name and last name are required`; 500 `Failed to update profile` | `src/routes/(calendar)/account/+page.server.ts:185-196`, `src/lib/server/services/accountData.ts:264-281` |
| `/account` | POST `?/updateEmail` | required | `email` (read only after throttle + guest check) | `{ success: true, message: 'Verification email sent. Please check your inbox.' }` | 401 `Not signed in`; 429 `Too many attempts. Try again shortly.`; 400 `You're using a guest calendar — add your first email from the Save-your-calendar banner instead.` + `guestNeedsClaim: true`; 400 `Valid email is required`; 400 `New email must be different from current email`; 500 `Failed to send verification email` | `src/routes/(calendar)/account/+page.server.ts:198-208`, `src/lib/server/services/accountData.ts:313-389` |
| `/account` | POST `?/logoutAllDevices` | required | none | `{ success: true, message: 'Logged out from all other devices' }` (with `revoked` count in the service result) | 401 `Not signed in`; 500 `Failed to logout from all devices` | `src/routes/(calendar)/account/+page.server.ts:210-214`, `src/lib/server/services/accountData.ts:397-415` |
| `/account` | POST `?/createApiToken` | required | `name` (trimmed, stored sliced to 60 chars) | `{ success: true, message, apiToken, apiTokenName }` — plaintext only once | 401 `Not signed in`; 400 `Token name is required`; 500 `Failed to create token` | `src/routes/(calendar)/account/+page.server.ts:216-228`, `src/lib/server/services/accountData.ts:418-440` |
| `/account` | POST `?/revokeApiToken` | required | `tokenId` | `{ success: true, message: 'Token revoked' }` | 401 `Not signed in`; 400 `Token id is required`; 500 `Failed to revoke token` | `src/routes/(calendar)/account/+page.server.ts:230-235`, `src/lib/server/services/accountData.ts:442-451` |
| `/account` | POST `?/deleteAccount` | required | `confirmation` (must equal the caller's user id) | `redirect(302, '/')` | 401 `Not signed in`; 400 `Confirmation does not match` | `src/routes/(calendar)/account/+page.server.ts:237-248`, `src/lib/server/services/accountData.ts:453-467` |

The `/api/me/settings|profile|email|sessions/revoke-others|api-tokens|dashboard-modules|notification-preferences|subscription|verify-email|claim` routes are owned by identity/billing/sponsored, but their mutation bodies call this module's `accountData` service (one implementation for page and JSON) — `src/lib/server/services/accountData.ts:1-13`, `src/routes/api/me/account.server.test.ts:1-242`.

### Rules the module must keep
- Ten sections in one fixed order — profile, families, notifications, calendar, dashboard, subscription ("Plan & usage"), email, security, api, danger — and the page's hash selects the body from that same list; an unknown/empty hash falls back to the first — `src/lib/components/account/accountSections.ts:15-40`, `src/routes/(calendar)/account/+page.svelte:30,90-125` · test: `src/lib/components/account/AccountSidebar.svelte.test.ts` › "renders the section a hash names", "falls back to the first section rather than rendering nothing"
- `/calendar/settings` is only a redirect to `/account#calendar` — `src/routes/(calendar)/calendar/settings/+page.server.ts:1-7`
- The group layout and the page loader both 302 `/login` without a user — `src/routes/(calendar)/account/+layout.server.ts:4-9`, `src/routes/(calendar)/account/+page.server.ts:58-61`
- An Anonymous Account gets the Claim CTA instead of the email-change form, the sidebar prints "No email yet · Save your calendar", and the server refuses email change with `guestNeedsClaim` (banner adds the `/claim` link) — `src/lib/components/account/AccountEmailSection.svelte:12-26`, `src/lib/components/account/AccountSidebar.svelte:26-27,128-135`, `src/lib/server/services/accountData.ts:324-335` · test: `src/lib/components/account/AccountEmailSection.svelte.test.ts` › "guest: no placeholder address, no change-email form, a claim link instead", `src/routes/(calendar)/account/page.server.test.ts` › "guests with the #196 placeholder email are told to claim, never mailed (#242)"
- The export is requester-only: `passwordHash` is destructured away, other family members appear as `{id, firstName, lastName}` only, auth-mechanical tables (`auth_session`, `auth_account`, `apiTokens`, `pushSubscriptions`, `claimTokens`, `codes`, `adConsentRecords`, `aiUsageTracking`) are excluded, every SELECT is filtered to the requester, and a missing user row throws instead of exporting emptiness — `src/lib/server/db/actions/export.ts:11-73,76-214` · test: `src/lib/server/db/actions/export.test.ts` › "exports per-user rows from every covered table, stripping passwordHash", "carries other family members as names only, even if richer rows exist", "issues every SELECT filtered to the requester", "throws when the user row is missing rather than exporting emptiness"
- The export is streamed as one chunk with the date in the filename; the route refuses anonymous callers before reading any data — `src/routes/api/account/export/+server.ts:10-34` · test: `src/routes/api/account/export/server.test.ts` › "refuses anonymous requests and never reads data", "returns the requester's document as a JSON attachment"
- API-token plaintext exists only in the create response; storage is a hash, list rows never carry `tokenHash`, revocation is owner-scoped (`revokeToken(userId, tokenId)`) — `src/lib/server/services/accountData.ts:418-451`, `src/lib/components/account/AccountApiTokensSection.svelte:23-27,56-74` · test: `src/routes/api/me/account.server.test.ts` › "lists without hashes", "201 with the plaintext once + a hash-free record", "DELETE is owner-scoped"
- `defaultCalendarId` must be one of the calendars the user can see; otherwise the save returns 400 and writes nothing (the create-event POST re-validates the same way) — `src/lib/server/services/accountData.ts:161-169` · test: `src/routes/(calendar)/account/page.server.test.ts` › "rejects a foreign calendar id with a form error and writes nothing", "accepts a family-shared calendar id and saves it"
- A user with no settings row reads the approved defaults (`weekStart sunday`, `timeZone UTC`, `color #3b82f6`, `defaultView dayView`, `defaultCalendarId null`, sync off, ads off, `verseTranslation esv`) and merely viewing writes nothing — `src/lib/server/services/accountData.ts:52-67,86-99` · test: `src/lib/components/account/AccountNotificationsSection.svelte.test.ts` › "shows the approved defaults to an account that has never opened this card"
- An unknown `verseTranslation` is stored as `'esv'`; a legacy `'kjv'` row is coerced in the select so it never renders blank — `src/lib/server/services/accountData.ts:156`, `src/lib/components/account/AccountCalendarSection.svelte:57-80`
- Ads are opt-in (`showAdsAsEvents` default false); the consent trail is written only on a transition and a consent write failure is logged but must not fail the settings save — `src/lib/server/services/accountData.ts:60-62,171-198`
- Dashboard switches are show-based: the action stores the inverse, only canonical ids survive, and a saved id the list no longer carries hides nothing; it has its own action/submit separate from calendar settings — `src/lib/server/services/accountData.ts:209-240`, `src/lib/components/account/accountDashboardModules.ts:1-55` · test: `src/lib/components/account/accountDashboardModules.test.ts` › "drops ids the module list no longer carries", "ignores a stale saved id rather than hiding everything"
- Notification preferences are exactly four ids in the approved order with defaults on/on/off/on ("Someone joined the family" is the only opt-in); only real booleans read as set; a write preserves the billing `email`/`sms` halves and only replaces `preferences` — `src/lib/components/account/accountNotifications.ts:21-95,144-181` · test: `src/lib/components/account/accountNotifications.test.ts` › "defaults to on, on, off, on — \"Someone joined the family\" is the only opt-in", "keeps email and sms byte-identical and adds only the preferences bag"
- A notification toggle flips optimistically with a receipt, and a failed save puts the switch back where the server still has it — `src/lib/components/account/AccountNotificationsSection.svelte:51-78,100-125`, `src/lib/components/account/accountNotifications.ts:191-203` · test: `src/lib/components/account/AccountNotificationsSection.svelte.test.ts` › "flip aria-checked the moment they are pressed, before the save answers", `accountNotifications.test.ts` › "puts the switch back where the server still has it when the save fails"
- Email change: 3 sends / 15 min keyed `email-change:<userId>`; mails the new address a code + 15-minute JWT link to `/account/verify-email`; wipes the old address's codes then creates an `email_change` code bound to the current email with `pendingEmail`; rejects the current address — `src/lib/server/services/accountData.ts:313-389` · test: `src/routes/(calendar)/account/page.server.test.ts` › "throttles the fourth send per user within 15 minutes (3/15m, user-bound key)", "binds the code to the current address and the new one (email_change + pendingEmail), wiping stale codes first", "rejects a change to the currently-used address (no self-loop codes)"
- Logging out other devices revokes every session except the caller's own (a Bearer caller has none, so all web sessions go); API tokens are untouched — `src/lib/server/services/accountData.ts:397-415` · test: `src/routes/api/me/account.server.test.ts` › "a Bearer caller (no session) signs out every web session", "a cookie caller keeps its own session"
- Deleting an account requires the typed user id, invalidates the current session and all user sessions, then deletes the user (tokens cascade) — `src/lib/server/services/accountData.ts:453-467`, `src/routes/api/me/+server.ts:42-51` · test: `src/routes/api/me/account.server.test.ts` › "400 when the confirmation is not your id; nothing deleted", "deletes after the typed confirmation"
- Every page action is guarded by `requireUserAction`: unauthenticated POSTs get `fail(401, { success:false, error:'Not signed in' })` and write nothing — `src/routes/(calendar)/account/+page.server.ts:136-248`, `src/lib/server/utils/requireUser.ts:18-33` · test: `src/routes/(calendar)/account/page.server.test.ts` › "unauthenticated POSTs write nothing (no settings mutation)"
- `GET /api/me` masks an Anonymous Account's placeholder email to `null`, reports `isAnonymous`, and never leaks `passwordHash`; `lastActiveAt` is ISO or null — `src/routes/api/me/+server.ts:9-35` · test: `src/routes/api/me/server.test.ts` › "returns the bearer user identity + shell flags (G1, #292)", "anonymous guests get email null + isAnonymous true, no family"
- Profile save requires both names; the list shows `memberCount` and the user's role per family, and family calendars are named after their own family (all families, not just the first) — `src/lib/server/services/accountData.ts:264-281`, `src/lib/components/account/accountCalendars.ts:1-16` · test: `src/lib/components/account/accountCalendars.test.ts` › "lists the calendar of EVERY family, named after its own family"

### Page and UI behaviour worth keeping
- Page chrome: breadcrumbs Calendar / Account, "Account Settings" header with a "Back to Calendar" link, a sticky left rail (section links + signed-in-as card) and the mounted section in a white card; toast for the export and the bottom tab bar come from the account layout — `src/routes/(calendar)/account/+page.svelte:44-127`, `src/routes/(calendar)/account/+layout.svelte:10-18` · test: `src/routes/(calendar)/account/layout.svelte.test.ts` › "renders toasts pushed by account sections", "renders the bottom tab bar"
- One green success banner or one red failure banner above the section; a failure reads `message` or `error` (401 body) and falls back to "Something went wrong. Please try again." — `src/routes/(calendar)/account/+page.svelte:24-32,74-88` · test: `src/routes/(calendar)/account/page.svelte.test.ts` › "signed-out post ({ error }) shows the error text, not an empty red banner"
- Profile: first/last name inputs with `update({reset:false})`, button label "Saving..." → "Update Profile" — `src/lib/components/account/AccountProfileSection.svelte:13-60`
- Email section shows `Status: Verified` / `Not Verified` and an "Updating..." button — `src/lib/components/account/AccountEmailSection.svelte:51-72`
- Your families: one row per family linking `/family/<id>` with initial, name, `N members · role`, "Manage →", empty-state copy, and a "+ Create a family" → `/family/create` (leaving is done on the family page) — `src/lib/components/account/AccountFamiliesSection.svelte:17-70`
- Calendar section: week start, full IANA time-zone list (UTC fallback when `Intl.supportedValuesOf` is missing), default view (Day/Week/Month/List/Dashboard), default calendar ("None (use first available)"), colour picker, family-sync checkbox, auto-parse switch, Daily Verse switch + translation with attribution, sponsored-items opt-in with consent history list, "Save Calendar Settings", and the ICS import link (`/calendar/import`, up to 500 events) — `src/lib/components/account/AccountCalendarSection.svelte:31-327`
- Calendar fields re-sync from the loader only when `userSettings` identity changes (post-submit reload), never on user edits — `src/lib/components/account/AccountCalendarSection.svelte:62-80` · test: `src/lib/components/account/AccountCalendarSection.svelte.test.ts` › "syncs fields when reloaded settings arrive"
- Consent history prints `Consented — <date>` / `Consent withdrawn — <date>` (en-GB long date), or "No ad consent recorded yet — the trail begins when the setting is first changed." — `src/lib/components/account/AccountCalendarSection.svelte:31-38,283-295` · test: `src/lib/components/account/AccountCalendarSection.svelte.test.ts` › "renders each consent event with its decision labelled and dated"
- Dashboard section: rows grouped "Above your cards" then "Cards", each row shows scope + meaning, the Meals row is badged "parked · not mounted anywhere", checkbox `module_<id>`, footer explains only off-switches are saved — `src/lib/components/account/AccountDashboardSection.svelte:18-93` · test: `src/lib/components/account/AccountDashboardSection.svelte.test.ts` › "puts the verse above the cards and the cards under their own heading", "ignores a retired module id in a saved list (103)"
- Notifications: one form per row, the switch is a native submit `role="switch"` with `aria-checked`, hint via `aria-describedby`, skeleton rows before the loader answers, a `role="status"` receipt naming the row, the JSON-column note, and "See the alerts" → `/calendar/notifications` — `src/lib/components/account/AccountNotificationsSection.svelte:77-190`
- Plan & usage: current plan card (Free or paid displayName + "Active · <period>" or "Started … · renews …" / lifetime), "Change plan" → `/pricing`, limits table (members per family, families, event history, archive, attachment size, AI creations, export/import), AI usage bar with "Resets <date>" when a real limit exists, and the upgrade block with `${monthly}/mo · ${annual}/yr · ${lifetime} lifetime` and a "Join Waitlist" → `/checkout?plan=monthly` — `src/lib/components/account/AccountSubscriptionSection.svelte:62-219`, `src/lib/components/account/accountSubscription.ts:1-95`
- Token rows show relative `last used …` (never used / today / yesterday / days / weeks / months); a masked token is deliberately not shown because no last-four column exists; "No API tokens yet." empty state — `src/lib/components/account/AccountApiTokensSection.svelte:32-137`, `src/lib/components/account/accountSubscription.ts:73-95`
- Export: button toasts "Preparing your data export…" immediately, downloads the JSON blob, then toasts "Data export downloaded." or "Data export failed — please try again." — `src/lib/components/account/AccountDangerSection.svelte:15-55`
- Delete: two-step (Delete Account → inline red form asking for the user id), Confirm Deletion / Cancel, then the action redirects home — `src/lib/components/account/AccountDangerSection.svelte:57-118`

### Probably accidental (candidates to drop, owner to confirm)
- Every personal calendar is named "Personal Calendar" and painted with the user's single settings colour, ignoring the calendar row's own `name`/`color` — `src/routes/(calendar)/account/+page.server.ts:66-71` — the select cannot distinguish two personal calendars
- The export card promises "everything your account stores", but the export deliberately omits `adConsentRecords` and `aiUsageTracking` — `src/lib/components/account/AccountDangerSection.svelte:42-46`, `src/lib/server/db/actions/export.ts:21-28` — copy overstates the download
- The rail's "Report a Bug" link drops the `?from=` page context that the navbar link carries — `src/lib/components/account/AccountSidebar.svelte:93-108` vs `src/lib/utils/reportBug.ts:1-10`
- The section is labelled "Plan & usage" in the rail but its heading is "Subscription" — `src/lib/components/account/accountSections.ts:21`, `src/lib/components/account/AccountSubscriptionSection.svelte:63`
- The account layout uses the Svelte 4 `export let data` + `<slot />` style while the sections use runes — `src/routes/(calendar)/account/+layout.svelte:7-15`
- `showAdsAsEvents` is read from a checkbox whose absence means `false`, but the page sends `'false'` strings in tests and `'true'` in markup — the parser only checks `=== 'true'`, so any other value silently means off — `src/routes/(calendar)/account/+page.server.ts:146-151`
- The export route builds the whole JSON string in memory and then enqueues it as one chunk despite being described as streamed — `src/routes/api/account/export/+server.ts:18-27`
- The account loader uses non-null assertions on `getUser()` and `locals.session!` in `deleteAccount` — `src/routes/(calendar)/account/+page.server.ts:97-104,244`
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#129](../../archive/issues/129-settings-page-missing-the-prototypes-look.md) Settings page measurements + four owner calls. | DESIGN | keep markup |
| [#140](../../archive/issues/140-parity-account-folder.md) Account folder parity. | DESIGN | keep markup |

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# account: 0% ported

legacy source files left (17/17, 2368 LOC):
  - src/lib/components/account/AccountApiTokensSection.svelte (139 LOC, ui) importers: 1
  - src/lib/components/account/AccountCalendarSection.svelte (329 LOC, ui) importers: 1
  - src/lib/components/account/AccountDangerSection.svelte (120 LOC, ui) importers: 1
  - src/lib/components/account/AccountDashboardSection.svelte (95 LOC, ui) importers: 1
  - src/lib/components/account/AccountEmailSection.svelte (76 LOC, ui) importers: 1
  - src/lib/components/account/AccountFamiliesSection.svelte (72 LOC, ui) importers: 1
  - src/lib/components/account/AccountNotificationsSection.svelte (191 LOC, ui) importers: 1
  - src/lib/components/account/AccountProfileSection.svelte (62 LOC, ui) importers: 1
  - src/lib/components/account/AccountSecuritySection.svelte (33 LOC, ui) importers: 1
  - src/lib/components/account/AccountSidebar.svelte (140 LOC, ui) importers: 1
  - src/lib/components/account/AccountSubscriptionSection.svelte (219 LOC, ui) importers: 1
  - src/lib/components/account/accountCalendars.ts (17 LOC, model) importers: 1
  - src/lib/components/account/accountDashboardModules.ts (56 LOC, model) importers: 2
  - src/lib/components/account/accountSections.ts (41 LOC, model) importers: 2
  - src/lib/components/account/accountSubscription.ts (96 LOC, model) importers: 2
  - src/lib/server/db/actions/export.ts (215 LOC, server) importers: 1
  - src/lib/server/services/accountData.ts (467 LOC, server) importers: 12
      NOTE: SPLIT per section: settings/profile/sessions/api tokens -> identity; notification prefs -> alerts; subscription summary -> billing; dashboard module hides -> dashboardModules; consent history -> sponsored; account screen composes.

route files not yet wiring-only (7/7):
  - src/routes/(calendar)/account/+layout.server.ts  /account
  - src/routes/(calendar)/account/+layout.svelte  /account
  - src/routes/(calendar)/account/+page.server.ts  /account
  - src/routes/(calendar)/account/+page.svelte  /account
  - src/routes/(calendar)/calendar/settings/+page.server.ts  /calendar/settings
  - src/routes/api/account/export/+server.ts  /api/account/export
  - src/routes/api/me/+server.ts  /api/me

legacy test files left (16/16) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/components/account/AccountCalendarSection.svelte.test.ts [component, 6 tests]
  - src/lib/components/account/AccountDashboardSection.svelte.test.ts [component, 7 tests]
  - src/lib/components/account/AccountEmailSection.svelte.test.ts [component, 2 tests]
  - src/lib/components/account/AccountFamiliesSection.svelte.test.ts [component, 5 tests]
  - src/lib/components/account/AccountNotificationsSection.svelte.test.ts [component, 13 tests]
  - src/lib/components/account/AccountSidebar.svelte.test.ts [component, 16 tests]
  - src/lib/components/account/accountCalendars.test.ts [pure, 4 tests]
  - src/lib/components/account/accountDashboardModules.test.ts [pure, 6 tests]
  - src/lib/components/account/accountSubscription.test.ts [pure, 14 tests]
  - src/lib/server/db/actions/export.test.ts [stub-db, 4 tests]
  - src/routes/(calendar)/account/layout.svelte.test.ts [component, 2 tests]
  - src/routes/(calendar)/account/page.server.test.ts [route, 11 tests]
  - src/routes/(calendar)/account/page.svelte.test.ts [component, 2 tests]
  - src/routes/api/account/export/server.test.ts [route, 2 tests]
  - src/routes/api/me/account.server.test.ts [route, 19 tests]
  - src/routes/api/me/server.test.ts [route, 3 tests]
```
<!-- census:end -->
