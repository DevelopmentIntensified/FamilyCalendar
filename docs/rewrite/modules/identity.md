# Port sheet: identity

**domain** · rank 1 · port #2 · home: `src/lib/domains/identity/` · README after the port: `src/lib/domains/identity/README.md` (written in S1)

Users, sessions and session cookies, personal API tokens (fp_), user settings incl. time zone, Anonymous Account detection, email codes, password hashing.

- **May import:** kernel.
- **Owns tables:** `users`, `userSettings`, `accounts`, `codes`, `authSession`, `authAccount`, `authVerification`, `apiTokens`.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `66a11131`
- [x] S3 contract + rules
- [x] S4 repo (+ fixtures)
- [x] S5 service
- [x] S6 http + route wiring (goldens unchanged since S2)
- [ ] S7 UI rebuild (rules, api, state, components, screen) + visual check
- [ ] S8 rewire importers, delete legacy code and legacy tests
- [ ] S9 README final, census --write, gate:push, ledger done

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- `fp_` tokens: `fp_` + 43 base64url chars, SHA-256 stored, plaintext shown once, revoke scoped to (id, user). Bearer only honoured on `/api/*`; invalid → `401 JSON`, never a redirect; token callers have `session: null`.
- Session cookie `better-auth.session_token`, raw `token.signature` (never URL-encode again: #196 double-encode outage), 90-day sliding, renewed at most daily; production refuses to boot without `BETTER_AUTH_SECRET`.
- Anonymous Account: placeholder email `@anonymous.placeholder.invalid`; created only on document navigations (GET + `Accept: text/html`) to protected routes; guest emails never leave the server.
- `lastActiveAt` touched at most hourly (Inactivity Window input).
- The account screen's deletion composition clears `activeSubscriptions` rows (the only non-cascading user FK), un-assigns the person's tasks, then calls identity's `deletePerson` — all in one transaction. Identity itself writes no other module's table.
- User time zone resolution feeds every cursor pin (#214).

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/me/api-tokens` | GET | `locals.user` (session cookie or `Authorization: Bearer fp_…`) | none | 200 `{tokens:[{id,name,createdAt,lastUsedAt}]}`; `tokenHash` never selected | 401: `{"error":"Unauthorized"}` | `src/routes/api/me/api-tokens/+server.ts:9-14` · `src/lib/server/db/actions/apiTokens.ts:38-48` |
| `/api/me/api-tokens` | POST | same | `{name}`; non-string/absent reads `''`; trimmed, blank refused, stored sliced to 60 chars | 201 `{token, record:{id,name,createdAt}}` — plaintext only here | 401 Unauthorized; 400 `Invalid JSON` (empty body = `{}`); 400 `Token name is required`; 500 `Failed to create token` | `src/routes/api/me/api-tokens/+server.ts:16-27` · `src/lib/server/services/accountData.ts:418-438` · `src/lib/server/utils/jsonBody.ts:9-30` |
| `/api/me/api-tokens/[id]` | DELETE | same | path `id`; no body | 200 `{success:true}` — foreign/nonexistent id deletes nothing but still 200 | 401 Unauthorized; 400 `Token id is required`; 500 `Failed to revoke token` | `src/routes/api/me/api-tokens/[id]/+server.ts:9-17` · `src/lib/server/services/accountData.ts:441-449` |
| `/api/me/profile` | PATCH | same | `{firstName,lastName}`; non-string/absent → `''`, both trimmed | 200 `{success:true,user:{id,firstName,lastName,email}}`; `email:null` for an Anonymous Account | 401 Unauthorized; 400 `Invalid JSON`; 400 `First name and last name are required`; 500 `Failed to update profile` | `src/routes/api/me/profile/+server.ts:10-28` · `src/lib/server/services/accountData.ts:260-275` |
| `/api/me/sessions/revoke-others` | POST | same | none | 200 `{success:true,revoked:n}`; keeps `locals.session.id` (cookie caller), Bearer caller keeps none so all web sessions go; `fp_` tokens untouched | 401 Unauthorized; 500 `Failed to logout from all devices` | `src/routes/api/me/sessions/revoke-others/+server.ts:12-19` · `src/lib/server/services/accountData.ts:397-415` |
| `/api/me/settings` | GET | same | none | 200 `{settings,consentHistory}`; no row → `ACCOUNT_SETTINGS_DEFAULTS` (`dayView`, `showAdsAsEvents:false`) | 401 Unauthorized | `src/routes/api/me/settings/+server.ts:33-38` · `src/lib/server/services/accountData.ts:52-62,88-98` |
| `/api/me/settings` | PATCH | same | any subset of `weekStart,timeZone,color,defaultView,defaultCalendarId,syncEventsToFamilyCalendar,autoParseEventDetails,showDailyVerse,showAdsAsEvents`; unknown key refused; `defaultCalendarId:null` accepted | 200 same body as GET, merged over stored row (or defaults) | 401 Unauthorized; 400 `Invalid JSON`; 400 `Invalid body`; 400 `Unknown field: <key>`; 400 `Invalid weekStart` / `Invalid timeZone` / `Invalid color` / `Invalid defaultView` / `Invalid <booleanField>`; 400 `Selected default calendar is not available` | `src/routes/api/me/settings/+server.ts:21-30,42-131` · `src/lib/server/services/accountData.ts:154-169` |
| `/calendar/setUserDefaultTimeZone` (not `/api`) | POST | session only (`locals.user`); no user → 302 `/login` | `{timeZone}` — any value, **not** validated | 200 empty body, settings row updated | 302 `/login` | `src/routes/(calendar)/calendar/setUserDefaultTimeZone/+server.ts:5-18` · `src/lib/server/db/actions/userSettings.ts:39-49` |

### Rules the module must keep
- Session cookie is `better-auth.session_token`, 90-day sliding, renewed at most once per 24 h; an expired row is deleted on validation and an unknown user drops the session row. — `src/lib/server/auth.ts:27-30,186-208,210-215` · test: `src/lib/server/auth.test.ts` › "builds better-auth default cookie shapes (live + blank)"
- Cookie value is raw `token.hmacSHA256(token)` (base64, 44 chars, `=`-padded), never percent-encoded by the module; verify splits at the last `.`, rejects wrong length and compares with `timingSafeEqual`. — `src/lib/server/auth.ts:60-81` · test: `src/lib/server/auth.test.ts` › "returns raw signed value — no percent encoding (kit cookies.set encodes once on the wire)"
- Cookie attributes: `path:/`, `httpOnly`, `sameSite:lax`, `secure` only in production; blank cookie is empty value + `Max-Age=0`/`Expires=1970`. — `src/lib/server/auth.ts:91-132` · test: `src/lib/server/auth.test.ts` › "builds better-auth default cookie shapes (live + blank)"
- Production refuses to boot without `BETTER_AUTH_SECRET`; non-production falls back to the placeholder secret so zero-env builds still sign/verify. — `src/lib/server/auth.ts:38-51` · test: `src/lib/server/auth.test.ts` › "falls back to the placeholder secret so zero-env builds work"
- One `setSessionCookie` seam writes every session cookie; `createSession` mints a 15-char id + 32-char token and a 90-day expiry. — `src/lib/server/auth.ts:140-165`
- Anonymous Account = user whose email ends `@anonymous.placeholder.invalid`; "registered" is a real email, never `user.email` truthiness. — `src/lib/utils/anonymous.ts:12-27` · test: `src/lib/utils/anonymous.test.ts` › "is never true for an Anonymous Account"
- Anonymous Accounts are created only on document navigations (`GET` + `Accept: text/html`) to `calendar`/`account`/`claim`/admin routes, after the admin redirect; the guest gets a session + cookie immediately and `timeZone:'UTC'` settings. — `src/hooks.server.ts:24,69-95` · `src/lib/server/db/actions/users.ts:121-140`
- `lastActiveAt` is touched on any authenticated request but at most once per hour. — `src/hooks.server.ts:26,106-114` · `src/lib/server/db/actions/users.ts:142-144`
- Deleting a user is one transaction: clear `tasks.assignmentStatus` for tasks assigned to them, delete `subscriptions`, then the `users` row (the only non-cascading user FK). — `src/lib/server/db/actions/users.ts:103-115` · test: `src/lib/server/db/actions/users.test.ts` › "resets assignment status, then deletes subscriptions before the user row, in one transaction"
- Creating a user with a password writes both `users.passwordHash` and the `auth_account` credential row (`id: pw-<userId>`, `providerId:'credential'`, `accountId:<userId>`) in one transaction; without a password only the user row. — `src/lib/server/db/actions/users.ts:52-73` · test: `src/lib/server/db/actions/users.test.ts` › "with a passwordHash, writes the user row AND its credential account row in one transaction"
- The generic `updateUser` writes only `firstName`/`lastName`; privilege fields (`email`, `emailVerified`, `passwordHash`, `roles`) are dropped at runtime and each has its own action (`verifyUserEmail`, `setUserPasswordHash`, `claimEmailForUser`). — `src/lib/server/db/actions/users.ts:11,76-101,146-153` · test: `src/lib/server/db/actions/users.test.ts` › "writes safe profile fields and silently drops privilege fields even if handed them"
- `updateUserSettings` writes only its explicit allowlist, including explicit `null`s, and silently drops row/system fields (`id`, `userId`, `updatedAt`). — `src/lib/server/db/actions/userSettings.ts:8-21,39-49` · test: `src/lib/server/db/actions/userSettings.test.ts` › "silently drops row-key and system fields even if handed them"
- Email codes are stored as `sha256` hex, never plaintext; lookup/delete always bind `(hash, email, type)` so a digest match alone is not enough. — `src/lib/server/db/actions/codes.ts:12-56` · test: `src/routes/(marketing)/signup/password/verify/server.test.ts` › "rejects with a generic 400 when the filtered lookup misses (unknown code, wrong email, or mismatched type)"
- API tokens are `fp_` + 32 random bytes base64url (43 chars, no padding); only the SHA-256 hex is stored and the plaintext is returned once. — `src/lib/server/db/actions/apiTokens.ts:12-35` · test: `src/lib/server/db/actions/apiTokens.test.ts` › "is fp_-prefixed base64url of 32 bytes, unique per mint"
- Token revocation is scoped to `(id, userId)` (or hash + owner for logout); `revokeAllTokensForUser` deletes every token (caller's included). — `src/lib/server/db/actions/apiTokens.ts:51-70` · test: `src/lib/server/db/actions/apiTokens.test.ts` › "revoke resolves (delete is scoped to id+userId in the query)"
- Bearer tokens are honoured only under `/api/*`; invalid token → `401 {"error":"Unauthorized"}` JSON (never a redirect); a token caller gets `locals.session = null`; a valid token touches `lastUsedAt`, unknown owner does not. — `src/hooks.server.ts:42-61` · `src/lib/server/db/actions/apiTokens.ts:76-91` · test: `src/lib/server/db/actions/apiTokens.test.ts` › "returns null when the token owner is gone (no touch)"
- Time zone resolution resolves the stored zone with Luxon (`setZone(...).isValid`), not IANA membership: invalid/missing → `undefined`, i.e. server-local, and a stored `local`/`UTC+5` resolves against the server's zone; `zonedNow` uses the zone when present. — `src/lib/server/utils/userTimezone.ts:5-23` · test: `src/lib/server/utils/userTimezone.test.ts` › "returns undefined for missing, empty, or invalid zones"
- Passwords are bcrypt with 10 salt rounds. — `src/lib/server/utils/password.ts:3-11`
- A password reset revokes every session and every `fp_` token for the user. — `src/routes/(marketing)/forgot-password/reset/+server.ts:124-129`
- Email change request: 3 sends / 15 min per user+IP, Anonymous Accounts refused with `guestNeedsClaim:true`, new address must differ, code+link bound to the current email (`type:'email_change'`, `pendingEmail`), 15-min TTL, previous codes for that email deleted. — `src/lib/server/services/accountData.ts:313-388` · `src/routes/api/me/email/+server.ts:24-40`
- A deleted user also loses `api_tokens` by FK cascade. — `src/lib/server/db/schema.ts:529-541`

### Page and UI behaviour worth keeping
- The `/account` calendar-settings card reads the exact GET shape (`settings`, `consentHistory`) and shows defaults (`defaultView:dayView`, ads off) when the user has no settings row. — `src/routes/api/me/settings/+server.ts:33-38` · test: `src/routes/api/me/settings/server.test.ts` › "no settings row → the page defaults (defaultView dayView)"
- The settings card patches one field at a time; changing only `timeZone` keeps every other stored value and skips re-validating a now-inaccessible stored default calendar. — `src/routes/api/me/settings/+server.ts:91-131` · test: `src/routes/api/me/settings/server.test.ts` › "timeZone alone keeps every other stored field (and skips the stale default-calendar check)"
- A newly minted API token is shown once with the copy "Token '<name>' created — copy it now, it won't be shown again." — `src/lib/server/services/accountData.ts:430`
- The guest placeholder email is masked to `null` in the profile response, so no UI ever shows an `@anonymous.placeholder.invalid` address. — `src/routes/api/me/profile/+server.ts:30-40`

### Probably accidental (candidates to drop, owner to confirm)
- `/calendar/setUserDefaultTimeZone` persists any string as `timeZone` with no IANA validation, while `PATCH /api/me/settings` rejects the same value — an invalid zone can be stored through this legacy route. — `src/routes/(calendar)/calendar/setUserDefaultTimeZone/+server.ts:9-14` — duplicate path, comment says PATCH replaces it.
- The same route calls `await event.request.json()` unguarded: a malformed body becomes a 500 rather than the house `400 {"error":"Invalid JSON"}`. — `src/routes/(calendar)/calendar/setUserDefaultTimeZone/+server.ts:8-9` — inconsistent with every `/api` handler.
- Dead exports with no importers: `getCodes`, `getCodesByEmail`, `getAccounts`, `updateAccount`, `deleteAccount` (the `accounts` action), `deleteUserByEmail`. — `src/lib/server/db/actions/codes.ts:19-31`, `src/lib/server/db/actions/accounts.ts:5-34`, `src/lib/server/db/actions/users.ts:117-119` — nothing references them.
- `getAccount` is typed `Promise<Account>` but returns `undefined` when no row matches; callers do `if (!account)` so the type is a lie. — `src/lib/server/db/actions/accounts.ts:9-12` — should be `Account | undefined`.
- `createSession` returns fabricated `createdAt`/`updatedAt`/`ipAddress:null`/`userAgent:null` instead of the inserted row, and the IP/UA columns are never written for any session. — `src/lib/server/auth.ts:156-165`, `src/lib/server/db/schema.ts:237-248` — session forensics data is always absent.
- `revokeOtherSessions` selects all sessions then deletes them one by one in a loop (no transaction, N+1); a mid-loop failure leaves a partial revocation. — `src/lib/server/services/accountData.ts:397-415` — could be one `DELETE … WHERE userId AND id <> keep`.
- `userSettings.useCloudAI` / `useLocalAI` exist in the schema with defaults but are absent from `SETTING_UPDATE_FIELDS`, so no code path can ever change them. — `src/lib/server/db/schema.ts:60-61`, `src/lib/server/db/actions/userSettings.ts:8-20` — either dead columns or a missing writable field.
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#169](../../archive/issues/169-token-session-hygiene.md) API token expiry + scopes, session idle timeout, PII log scrub. | SECURITY | keep behaviour; separate ticket (changes the Android contract) |
| [#174](../../archive/issues/174-email-normalization-duplicates.md) Email normalization (case/+alias) at write and lookup; dedupe backfill. | SECURITY+SCHEMA | keep behaviour; separate ticket (data backfill needs owner) |

## Plan

New files, all under `src/lib/domains/identity/` (S3–S6 unless marked S7). Roles follow
[conventions.md](../../architecture/conventions.md#file-roles).

| file | role | contents |
|---|---|---|
| `identity.contract.ts` | contract | zod for the seven endpoint bodies/params and the response shapes (token row/mint, profile echo, revoke count, settings view + consent trail), with the legacy messages as schema messages. **S3:** no person response schema — no identity `/api` route answers a person (the `/api/me` shell is account's); `PersonView` arrives with `getPerson` at S5. The PATCH body is `z.unknown()` lifted through `calendarSettingsPatch`, so precedence stays legacy's. |
| `identity.settings.rules.ts` | rules | `ACCOUNT_SETTINGS_DEFAULTS`, the PATCH allowlist, week-start/view/colour vocabularies, merge-over-stored, the default-calendar decision. **S3:** plus `isLuxonTimeZone` (kernel `isValidZone` is IANA-only, so it cannot carry today's pseudo-zones until Q-107), `calendarSettingsView` (strips `verseTranslation`) and `writableSettings` (the #168 write allowlist, legacy's eleven fields). |
| `identity.person.rules.ts` | rules | `isAnonymousAccount`, `isRegisteredAccount`, `guestSafeEmail`, `displayName`, `profilePatch` (privilege drop), `touchDue(lastActiveAt, now)`, `zoneFromStored`. **S3:** `maskEmail` renamed `guestSafeEmail` (family's search rules export a different `maskEmail(email)`; R11 needs unique names); plus `anonymousPersonValues(id)` + `SIGN_UP_TIME_ZONE`, the guest row `createAnonymousAccount` writes. |
| `identity.session.rules.ts` | rules | lifetime/update constants, cookie attribute policy, `isSessionExpired`, `sessionRenewalDue`. **S3:** plus `sessionExpiresAt`, the raw signed value and its shape split (`signedSessionCookieValue`, `splitSignedSessionCookie`), `sessionSetCookieHeader` (the `serialize()` the JSON sign-ins use) and `resolveSessionSecret` (production fails closed). HMAC + `timingSafeEqual` stay in the S5 service (node:crypto). |
| `identity.token.rules.ts` | rules | `fp_` format guard, `apiTokenName` (trim + 60 cap); hashing stays kernel `sha256Hex`. **S3:** plus `apiTokenPlaintext(randomBytes)` (`fp_` + unpadded base64url); the service draws the 32 bytes. |
| `identity.code.rules.ts` | rules | code TTL, type vocabulary and the `(hash, email, type)` lookup key. |
| `identity.repo.server.ts` | repo | person/settings/session/token/code/account queries; `db: Db` first; own tables only. **S4:** every write takes `now` and sets `updatedAt` itself (no `$onUpdate` decides a stamp); `insertSession` returns the stored row; "log out other devices" is one owner-scoped DELETE; the token list and mint never select `token_hash`; the Bearer lookup is one `api_tokens ⋈ users` join (`findApiTokenHolder`). |
| `identity.fixtures.server.ts` | fixtures | created in S2, every exported name carrying the module noun: `seedIdentitySettings`, `seedIdentitySparseSettings`, `seedIdentityApiToken`, `seedIdentitySession`, `seedIdentityCalendar`, `seedIdentityFamily`, `seedIdentityConsent` + `IDENTITY_SEEDED_AT` (written by the settings, token and consent builders). **S4:** every builder takes an optional trailing `db` (default the committed test db, so the golden's calls are unchanged; the family precedent); `seedIdentitySession` takes optional overrides; added `seedIdentityEmailCode` and `seedIdentityAccountBinding`. `seedIdentityPerson` is not needed: people come from kernel `seedUser`. |
| `identity.person.service.server.ts` | service | `getPerson`, `getPersonByEmail` + `isEmailTaken` (the sign-up/invite/child-door reads family needs), `createPersonWithPassword` (users + the `auth_account` credential row in one transaction; no password = only the user row, the child door), `updatePersonProfile`, `createAnonymousAccount`, `touchLastActive`, `getTimeZone`, `deletePerson`. |
| `identity.session.service.server.ts` | service | `startSession`, `validateSession`, `endSession`, `endAllSessions`, `endOtherSessions` + cookie signing/verification (node:crypto; the secret comes from `ctx.config`). |
| `identity.token.service.server.ts` | service | `listApiTokens`, `mintApiToken`, `revokeApiToken`, `revokeAllApiTokens`, `revokeApiTokenByPlaintext`, `authenticateApiToken`. |
| `identity.settings.service.server.ts` | service | `getCalendarSettings`, `updateCalendarSettings`, `setHiddenDashboardModules` (the Dashboard Module switches' own save); reads `ctx.calendarAccess` (default-calendar check) and `ctx.adConsent` (history + transition), never a port argument. |
| `identity.credentials.service.server.ts` | service | `hashPassword`, `verifyPassword`, `issueEmailCode`, `redeemEmailCode`. |
| `identity.http.server.ts` | http | the seven `endpoint()` definitions, wire-exact; `PATCH /api/me/settings` is the one `bodyMode: 'strict'` endpoint (legacy's empty body was `Invalid JSON`). |
| `identity.http.db.test.ts` | test | S2 goldens (written). |
| `identity.{settings,person,session,token,code}.rules.test.ts` | test | input → output tables per rule topic. |
| `identity.{repo,person.service,session.service,token.service,settings.service,credentials.service}.db.test.ts` | test | R3/R13 coverage; `rollbackTest`. |
| `identity.api.ts`, `identity.settings.state.svelte.ts` (S7) | api / state | browser client for the settings/profile/token endpoints and the account cards' state. |
| `ui/AccountProfileCard.svelte`, `ui/AccountApiTokensCard.svelte`, `ui/AccountSessionsCard.svelte`, `ui/AccountCalendarSettingsCard.svelte` (S7) | ui | the account page's identity sections, data + callbacks in. |
| `index.ts`, `index.server.ts`, [ui/index.ts](../../../src/lib/domains/identity/ui/index.ts) | entry | the public interfaces listed in the README. |

No page or form-action file: identity owns no page; the /account screen (account's S7) composes these services and the four `ui/Account*Card.svelte` components. The non-`/api` `/calendar/setUserDefaultTimeZone` route is deleted at S7/S8 (Q-015), so it is not wired here.

Where the legacy exports go:

- `src/lib/server/auth.ts:27-240` → session rules (constants, attributes, renewal) + session service (HMAC, DB, cookie); the `session` facade and `invalidateStaleAnonymousSession` die (the latter is a login-flow rule → access, built on `endSession`).
- `src/lib/server/db/actions/apiTokens.ts` → token rules (`API_TOKEN_PREFIX`, format) + tokens service/repo; `hashApiToken` becomes kernel `sha256Hex` (byte-identical, pinned by `ids.test.ts`); `getUserForApiToken` → `authenticateApiToken` (app hooks).
- `src/lib/server/db/actions/userSettings.ts` → settings repo + the allowlist in settings rules.
- `src/lib/server/db/actions/users.ts` → person repo/service (`createUser`, `updateUser`, `verifyUserEmail`, `setUserPasswordHash`, `claimEmailForUser`, `createAnonymousUser`, `touchLastActiveAt`, `deleteUser`, `getStaleAnonymousUsers`); `getUsers`/`getUserByEmail`/`emailExists`/`deleteUserByEmail` become named repo reads when their callers port.
- `src/lib/server/db/actions/codes.ts` → code rules + credentials service/repo; dead `getCodes`/`getCodesByEmail` die, `hashEmailCode` becomes kernel `sha256Hex`.
- `src/lib/server/db/actions/accounts.ts` → accounts repo; dead `getAccounts`/`updateAccount`/`deleteAccount` die (`getAccount` becomes `findAccountBinding` with a real `| undefined`).
- `src/lib/utils/anonymous.ts` → `identity.person.rules.ts` (one predicate for everyone).
- `src/lib/server/utils/password.ts` → credentials service (bcrypt cost 10 stays).
- `src/lib/server/utils/userTimezone.ts` → `zoneFromStored` rule + `getTimeZone` service.

Cross-module ports (the R8-legal seam): identity declares `CalendarAccessPort` and `AdConsentPort` — with `IdentityPorts` and `IdentityCtx = Ctx & IdentityPorts` — in `index.server.ts` (declared at S3; the family precedent); `calendar` and `sponsored` implement them; a small kernel/app change (not this module's files) adds `ctx.calendarAccess` / `ctx.adConsent` to `Ctx`, `testCtx` fakes and the `appCtx.server.ts` wiring per [add-a-port.md](../../rewrite/playbooks/add-a-port.md). Routes stay `export const PATCH = patchSettingsEndpoint.handler`; no route or endpoint composes a port.

## Notes

**S1**

- The API table has 8 rows: five `/api/me` route files carrying **seven methods** (`GET`/`POST` tokens, `DELETE` token, `PATCH` profile, `POST` revoke-others, `GET`/`PATCH` settings), plus the non-`/api` `/calendar/setUserDefaultTimeZone` row. Mobile auth belongs to [access](access.md), not here.
- No spec-goldens were needed: every identity route handler runs in the `db` project. The only `$env/static/private` read in the graph is `src/lib/utils/sendEmail.ts:6` (`new Resend(RESEND_API_KEY)` at import), reached through `accountData.ts`; `RESEND_API_KEY` is present in the repository's test environment (it is in the generated `.svelte-kit/ambient.d.ts`), and none of these handlers sends email. If a runner ever lacks it, the file fails at import and the goldens must be re-labelled per the characterize playbook — noted so nobody debugs the wire tests.
- Inventory omission found while reading the handler: `PATCH /api/me/settings` also answers `400 {"error":"Invalid defaultCalendarId"}` for a non-string, non-null id (`src/routes/api/me/settings/+server.ts:99-103`). It is pinned in the goldens (`› answers 400 for {"defaultCalendarId":5}`) as today's behaviour.
- "Probably accidental", internal only → dropped: dead exports `getCodes`, `getCodesByEmail`, `getAccounts`, `updateAccount`, `deleteAccount` (accounts action), `deleteUserByEmail` (no importers); the `getAccount(): Promise<Account>` type lie (the new repo read is `Account | undefined`); `createSession`'s fabricated `createdAt`/`updatedAt`/`ipAddress`/`userAgent` (the new service returns the inserted row); the N+1 `revokeOtherSessions` loop (one owner-scoped `DELETE`; behaviour identical, pinned by the golden).
- "Probably accidental", wire-visible → `/calendar/setUserDefaultTimeZone` (no zone validation at all, unguarded JSON → 500). It is not on the `/api` contract and its own comment says `PATCH /api/me/settings` replaces it; Q-015 is decided B, so the route dies at S7/S8 and the web caller moves to the PATCH. `useCloudAI`/`useLocalAI` stay as schema columns, read-only on the wire (Q-014 decided: keep).
- The ad-consent trail (`adConsentRecords`) is sponsored's table and calendar visibility is calendar's (`calendars`/`familyMembers`); rank 1 cannot import either (R1/R3). Identity declares two ports in `index.ts` — `CalendarAccessPort` (`listAccessibleCalendarIds`) and `AdConsentPort` (`listConsentHistory`, `recordConsentChange`) — and reaches them through `ctx.calendarAccess` / `ctx.adConsent`. The ports follow [add-a-port.md](../playbooks/add-a-port.md): the kernel/app wiring is `appCtx.server.ts` (the only place allowed to import every module) plus `testCtx` fakes, so neither the endpoint nor the route file composes a port and `/api/me/settings` stays `export const PATCH = patchSettingsEndpoint.handler`. The legacy rule that a consent write failure is logged and never fails the settings save is kept inside `updateCalendarSettings`. Agreed with the sponsored owner during S1, extended with the calendar-access port in review.
- Account deletion crosses modules. Today `deleteUser` does it in ONE transaction, in this order: `tasks.assignmentStatus` cleared for the person's tasks (the `tasks.assignedTo` FK set-nulls during the users delete), then the billing rows (`subscriptions.userId` is the only non-cascading user FK), then the `users` row (sessions/settings/tokens cascade) — `src/lib/server/db/actions/users.ts:103-115`. The port keeps that one-transaction shape, but it becomes the account screen's deletion composition (billing + tasks + `deletePerson`); identity's `deletePerson` only deletes the users row and writes no other module's table (R3). Recorded in [account.md](account.md).
- Golden coverage (S2, `identity.http.db.test.ts`): all seven methods across the five `/api/me` route files, each with its 401; success with the full body (`toEqual`, including every settings response); every 400 the handlers can produce (the absent/blank/non-string name trio, empty-body `{}` vs malformed JSON vs JSON array, every PATCH field refusal incl. `Invalid autoParseEventDetails`/`Invalid showDailyVerse` and `Invalid defaultCalendarId`, plus `Invalid body`/`Unknown field:`); owner-scoped DELETE; `defaultCalendarId:null` vs an inaccessible real calendar; consent transition vs no-op; and side effects read back from `api_tokens`, `auth_session`, `user_settings`, `ad_consent_records` and `users`. The non-`/api` `/calendar/setUserDefaultTimeZone` row gets no golden (playbook: `/api` only). One legacy rule cannot be reached through the handler in this harness: `invoke` always sets `locals.session = null`, so the "cookie caller keeps its own session" branch is only pinnable at the S5 service level (`endOtherSessions(ctx, actor, keepSessionId)`); the goldens pin the observable Bearer/keep-nothing result.
- S2 fixtures moved to `identity.fixtures.server.ts`, every exported name carrying the module noun (`seedIdentitySettings`, `seedIdentitySparseSettings`, `seedIdentityApiToken`, `seedIdentitySession`, `seedIdentityCalendar`, `seedIdentityFamily`, `seedIdentityConsent` + `IDENTITY_SEEDED_AT`) while the goldens are still inside the S2 window. `seedIdentityCalendar` exists because `defaultCalendarId` has an FK, so a dangling id is not a legal row (the round-1 failure); `seedIdentityFamily` because the access check reads family membership; `seedIdentitySparseSettings` because a sign-up row is written as `{userId, timeZone:'UTC'}` only. Every settings, token and consent builder writes `IDENTITY_SEEDED_AT`, so the goldens pin exact timestamp strings (`updatedAt`/`createdAt`/`lastUsedAt`/`recordedAt`) instead of shapes; the session, calendar and family builders leave their timestamps to the column defaults and no golden renders those. A PATCH answer's `updatedAt` stays shape-matched because `userSettings.updatedAt` carries `$onUpdate`. Fixture names are unique across `src/lib` (`grep -rn "export .*function seed" src/lib`), so R11's one-scope rule cannot collide.
- Golden coverage after the S1+S2 fix-forward (S2-sha line above is frozen; this list is the current state): all seven methods across the five `/api/me` route files, each 401 compared with `toEqual`; success with the full body (`toEqual`, including every settings response); every 400 the handlers can produce (absent/blank/non-string/emoji-cut names, empty-body `{}` vs malformed JSON vs JSON array vs JSON `null` vs JSON string, every PATCH field refusal incl. `useCloudAI`/`useLocalAI` as unknown fields, `""` and `Mars/Base` zones, unknown-key precedence and code-order validation, plus `Invalid body`/`Invalid JSON`); owner-scoped DELETE; token lists with an explicit `createdAt`/`lastUsedAt` rendering and an order-insensitive two-token list; `defaultCalendarId` `null` / `''` / own / FAMILY / inaccessible; sparse-row GET-then-PATCH; one PATCH writing `showDailyVerse` and four other fields; consent granted/withdrawn/no-op and newest-first history; and side effects read back from `api_tokens`, `auth_session`, `user_settings`, `ad_consent_records` and `users`.
- The hooks-level rules (invalid cookie overwritten with a blank cookie, renewal re-issues the cookie, an invalid Bearer gets `401` even with a valid cookie) are NOT identity's goldens: they belong to APP-03's request-pipeline test (`src/lib/app`).
- Legacy files kept for unported importers: every identity legacy file still has importers outside the module (`auth.ts` 15, `users.ts` 22, `userTimezone.ts` 16, `anonymous.ts` 21, `password.ts` 7, `codes.ts` 14, `apiTokens.ts` 7, `userSettings.ts` 22, `accounts.ts` 7 — `npm run census -- identity`). They stay until access/account/calendar/etc. are ported; S8 deletes only what has zero importers. `anonymous.ts` is the interesting one: its 20 importers (components included) make it the last file to move.
- Verse deleted 2026-11-12 (Q-031/Q-032): `/api/me/settings` no longer answers `verseTranslations` nor a `verseTranslation` inside `settings` (a stored row's column is stripped by `accountSettingsView`), and a PATCH naming `verseTranslation` now gets the unknown-key 400 — `Unknown field: verseTranslation`. The `user_settings.verse_translation` column stays (no DDL) and `showDailyVerse` stays on the wire and PATCH-writable, because the Android app toggles it and the `verse` Dashboard Module id still gates `modules.verse` on `/api/dashboard`; the /account form no longer posts it, so `CalendarSettingsInput.showDailyVerse` is optional and a form save leaves the stored value alone.

**S3+S4**

- Port types live in `index.server.ts` (they mention `Ctx`, which is server-only), not `index.ts` as S1 sketched: `CalendarAccessPort.listAccessibleCalendarIds(userId): Promise<readonly string[]>`, `AdConsentPort.listConsentHistory(userId): Promise<readonly ConsentRecordView[]>` and `recordConsentChange(userId, previous, next): Promise<void>` (`previous` is the stored value before the save, `undefined` with no row). No ctx argument: the adapters are bound to the ctx at wiring time, and the consent write is outside any transaction today.
- `maskEmail` → `guestSafeEmail`: `rewrite/family-port` exports `maskEmail(email)` (partial masking for member search) from `family.search.rules.ts`; two exports with one name fail R11 once both merge.
- S6 handled one PATCH case the contract could not: legacy `PATCH /api/me/settings` answers an EMPTY body with `400 {"error":"Invalid JSON"}` (`request.json()` throws; golden `› answers 400 {"error":"Invalid JSON"} for a malformed or an empty body`), while kernel `endpoint()` read an empty body as `{}`. The kernel gained `bodyMode: 'strict'` (empty/whitespace = the same `Invalid JSON` as malformed; everything else as `json`) and the settings endpoint is its only user; the token and profile routes keep `'json'`, as their goldens pin.
- Zone validation is `isLuxonTimeZone` in the settings rules: legacy's `DateTime.local().setZone(z).isValid` with a fixed base instant (R5 forbids `DateTime.local()` in rules; validity does not depend on the instant). Kernel `isValidZone` is IANA-only, which is Q-107's post-S6 behaviour, so it cannot be reused yet.
- `SETTINGS_WRITABLE_FIELDS` keeps legacy's eleven columns, `verseTranslation` included, though no caller writes it since Q-031/Q-032 — dropping it is a no-op today but a legacy-list change, so it is left for the owner.
- The repo stamps `users.updatedAt` / `userSettings.updatedAt` from the caller's `now` on every write, including `touchPersonLastActive` and an empty settings update — legacy did the same implicitly through `$onUpdate(systemClock.now())`.
- Email-change codes and the password-reset marker are stored by value in `codes.code` today (only the three sign-in kinds are hashed); the repo keeps both lookups (`findEmailCodeByKey` for the hashed triple, `findEmailCode` by value) and `HASHED_EMAIL_CODE_TYPES` names the split. Hashing the email-change code is a security change for the owner, not this port.

**S5+S6**

- **Services (5 files).** `person` (`getPerson`, `getPersonByEmail`, `isEmailTaken`, `createPersonWithPassword`, `updatePersonProfile`, `createAnonymousAccount`, `touchLastActive`, `getTimeZone`, `deletePerson`), `session` (`startSession`, `validateSession`, `endSession`, `endAllSessions`, `endOtherSessions`, `sessionCookie`, `blankSessionCookie`), `token` (list/mint/revoke-one/revoke-all/revoke-by-plaintext/authenticate), `settings` (`getCalendarSettings`, `updateCalendarSettings`, `setHiddenDashboardModules`) and `credentials` (`hashPassword`, `verifyPassword`, `issueEmailCode`, `redeemEmailCode`). Authorization is in the service (the actor's own id only, or the `userId` the caller has already proved); time is `ctx.clock.now()`, ids are `ctx.ids.id()`; expected refusals are `AppError`s with the legacy copy. `createAnonymousAccount` and `createPersonWithPassword` use `withTx` for their two-row writes.
- **Signature decisions.** `startSession` answers `{ session, cookie }` because hooks need both; `validateSession` answers `{ session: { …, fresh }, person }`; `endOtherSessions(ctx, actor, { keepSessionId })` takes the explicit keep id (the http layer passes `event.locals.session?.id ?? null`, so a Bearer caller keeps none). `mintApiToken` writes the name `ApiTokenCreateBody` handed it — trimming again would eat the whitespace the golden pins before the 60-unit cut; a blank name is still refused for non-HTTP callers. `redeemEmailCode` consumes the row it returns; the `reset_used` marker needs a non-consuming existence read when access ports (the only primitive not exported yet).
- **Settings + ports.** The service reads `ctx.calendarAccess` / `ctx.adConsent`; the endpoint narrows the kernel `Ctx` to `IdentityCtx` in one loud helper (`settingsCtx`) that throws when the app wiring is missing. A throwing consent write is logged (`identity_consent_record_failed`) and the save still answers; a throwing trail read answers `consentHistory: []` and logs (`identity_consent_history_failed`).
- **App wiring (S6).** `src/lib/app/ports.server.ts` now attaches both ports as transition bridges over today's implementations: `getAccessibleCalendarIds` (calendar's table) and `getAdConsentRecords`/`recordAdConsentChange` (sponsored's table). The owning modules have no repository/services yet, so these ARE the real adapters today; calendar's and sponsored's S5 replace each with their public adapter. Without them the frozen goldens could not see another module's rows. `src/lib/app/appCtx.server.ts` also gained the session config: `ctx.config.sessionSecret` (from `BETTER_AUTH_SECRET` through `resolveSessionSecret`, fail-closed in production) and `ctx.config.production` (the cookie `Secure` flag). Hooks (APP-03) are untouched.
- **Kernel change.** `endpoint()` gained `bodyMode: 'strict'` (empty or whitespace-only body → `400 {"error":"Invalid JSON"}`, exactly like malformed; every other body as `'json'`), with table rows in `endpoint.test.ts` and a kernel README line. It is per-endpoint, never the default.
- **Orchestrator wave addition (un-deferred from access).** `createPersonWithPassword` lives here, not access: it writes the `users` row and, when a password is given, `users.passwordHash` plus the `auth_account` credential row (`pw-<userId>`) in one transaction. A missing password writes only the user row, which is the child door's real passwordless account (legacy `createUser`), so family can call it. `getPersonByEmail` and `isEmailTaken` are the exact-match read and the unique-email guard family's child/invite doors need. `setHiddenDashboardModules` is dashboardModules' writer (#105): create-with-defaults or update-that-column; `PATCH /api/me/settings` still refuses `hiddenDashboardModules` as an unknown field, as the contract/golden pin.
- **HTTP + routes.** `identity.http.server.ts` holds the seven handlers; the five route files are wiring only (`export const GET/POST/PATCH/DELETE = …Endpoint.handler`), so `arch` sees no logic there. No identity page file exists — the /account screen composes these services and the S7 cards; the non-`/api` `/calendar/setUserDefaultTimeZone` route stays scheduled for deletion (Q-015).
- **Tests.** `identity.{person,session,token,settings,credentials}.service.db.test.ts`, one `rollbackTest` per IO invariant; settings uses in-memory `CalendarAccessPort`/`AdConsentPort` fakes. Both API-token and session tests reproduce the "owner/person gone" branch by disabling FK triggers for one statement, because the cascade otherwise makes it unreachable.

**Decisions**

1. **`userSettings.useCloudAI` / `useLocalAI`.** (Q-014, decided: keep) The columns exist with defaults but no writer; they stay read-only on the wire — a PATCH naming either answers `Unknown field: useCloudAI|useLocalAI` — and a later schema ticket removes them. No wire change now.
2. **Deleting `/calendar/setUserDefaultTimeZone`.** (Q-015, decided B) The route goes at S7/S8 and its one web caller (`src/routes/(calendar)/calendar/+layout.svelte:36`) moves to `PATCH /api/me/settings` with `{timeZone}`. It is not on the `/api` contract, so no golden pins it.
3. **Carry-overs.** (Q-016, recorded default A) #169 (token expiry + scopes, session idle timeout, PII log scrub) and #174 (email normalization) are unchanged: the goldens pin today's "tokens live until revoked" behaviour, so #169 stays a separate ticket. No action in this port.

**Decided post-S6 fixes** (owner, 2026-11-12). Each lands as `fix(identity)` AFTER S6, with the golden changed first — the S2 goldens pin TODAY's behaviour, so the fix starts by rewriting the assertion:

- **Q-107 B** — `timeZone` accepts IANA names plus `UTC` only; the pseudo-zones (`local`, `system`, `default`, `UTC+5`, `gmt`) get `400 Invalid timeZone`. Today Luxon `setZone().isValid` passes them and they are stored verbatim (`src/routes/api/me/settings/+server.ts:53-57`; golden `› accepts the Luxon-valid zone %s and stores it as sent`).
- **Q-108 B** — `GET /api/me/settings` answers the merged defaults for null columns (one view) and PATCH writes only the fields sent. Today a sign-up row answers `color:null`/`syncEventsToFamilyCalendar:null` and the first PATCH backfills every null from `ACCOUNT_SETTINGS_DEFAULTS` (golden `› a sparse sign-up row answers nulls, then the first PATCH fills them from the defaults`).
- **Q-109 B** — the 60-cap cuts at 60 code points and trims after the cut. Today it is `name.trim().slice(0, 60)` on UTF-16 units, which can split an emoji and keeps whitespace before the cut (golden `› cuts the name at 60 UTF-16 units, splitting an emoji on the boundary`).
- **Q-110 B** — the token list is ordered newest first (`createdAt DESC, id`). Today `listTokensForUser` has no `ORDER BY` and the golden compares the list order-insensitively (`› lists every token you own; the list order is not part of the contract`).

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# identity: 0% ported

legacy source files left (9/9, 735 LOC):
  - src/lib/server/auth.ts (241 LOC, server) importers: 15
  - src/lib/server/db/actions/accounts.ts (35 LOC, server) importers: 7
  - src/lib/server/db/actions/apiTokens.ts (92 LOC, server) importers: 7
  - src/lib/server/db/actions/codes.ts (83 LOC, server) importers: 14
  - src/lib/server/db/actions/userSettings.ts (54 LOC, server) importers: 21
  - src/lib/server/db/actions/users.ts (166 LOC, server) importers: 22
  - src/lib/server/utils/password.ts (12 LOC, server) importers: 7
  - src/lib/server/utils/userTimezone.ts (24 LOC, server) importers: 16
  - src/lib/utils/anonymous.ts (28 LOC, model) importers: 23

route files not yet wiring-only (6/6):
  - src/routes/(calendar)/calendar/setUserDefaultTimeZone/+server.ts  /calendar/setUserDefaultTimeZone
  - src/routes/api/me/api-tokens/+server.ts  /api/me/api-tokens
  - src/routes/api/me/api-tokens/[id]/+server.ts  /api/me/api-tokens/[id]
  - src/routes/api/me/profile/+server.ts  /api/me/profile
  - src/routes/api/me/sessions/revoke-others/+server.ts  /api/me/sessions/revoke-others
  - src/routes/api/me/settings/+server.ts  /api/me/settings

legacy test files left (7/7) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/server/auth.test.ts [pure, 6 tests]
  - src/lib/server/db/actions/apiTokens.test.ts [stub-db, 10 tests]
  - src/lib/server/db/actions/userSettings.test.ts [stub-db, 2 tests]
  - src/lib/server/db/actions/users.test.ts [stub-db, 6 tests]
  - src/lib/server/utils/userTimezone.test.ts [pure, 2 tests]
  - src/lib/utils/anonymous.test.ts [pure, 1 tests]
  - src/routes/api/me/settings/server.test.ts [route, 9 tests]
```
<!-- census:end -->
