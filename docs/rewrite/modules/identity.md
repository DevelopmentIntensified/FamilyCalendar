# Port sheet: identity

**domain** · rank 1 · port #2 · home: `src/lib/domains/identity/` · README after the port: `src/lib/domains/identity/README.md` (written in S1)

Users, sessions and session cookies, personal API tokens (fp_), user settings incl. time zone, Anonymous Account detection, email codes, password hashing.

- **May import:** kernel.
- **Owns tables:** `users`, `userSettings`, `accounts`, `codes`, `authSession`, `authAccount`, `authVerification`, `apiTokens`.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
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

- `fp_` tokens: `fp_` + 43 base64url chars, SHA-256 stored, plaintext shown once, revoke scoped to (id, user). Bearer only honoured on `/api/*`; invalid → `401 JSON`, never a redirect; token callers have `session: null`.
- Session cookie `better-auth.session_token`, raw `token.signature` (never URL-encode again: #196 double-encode outage), 90-day sliding, renewed at most daily; production refuses to boot without `BETTER_AUTH_SECRET`.
- Anonymous Account: placeholder email `@anonymous.placeholder.invalid`; created only on document navigations (GET + `Accept: text/html`) to protected routes; guest emails never leave the server.
- `lastActiveAt` touched at most hourly (Inactivity Window input).
- Deleting a user deletes `activeSubscriptions` rows first (the only non-cascading user FK).
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
| `/api/me/settings` | GET | same | none | 200 `{settings,verseTranslations,consentHistory}`; no row → `ACCOUNT_SETTINGS_DEFAULTS` (`dayView`, `showAdsAsEvents:false`) | 401 Unauthorized | `src/routes/api/me/settings/+server.ts:33-38` · `src/lib/server/services/accountData.ts:52-62,88-98` |
| `/api/me/settings` | PATCH | same | any subset of `weekStart,timeZone,color,defaultView,defaultCalendarId,verseTranslation,syncEventsToFamilyCalendar,autoParseEventDetails,showDailyVerse,showAdsAsEvents`; unknown key refused; `defaultCalendarId:null` accepted | 200 same body as GET, merged over stored row (or defaults) | 401 Unauthorized; 400 `Invalid JSON`; 400 `Invalid body`; 400 `Unknown field: <key>`; 400 `Invalid weekStart` / `Invalid timeZone` / `Invalid color` / `Invalid defaultView` / `Invalid verseTranslation` / `Invalid <booleanField>`; 400 `Selected default calendar is not available` | `src/routes/api/me/settings/+server.ts:21-30,42-131` · `src/lib/server/services/accountData.ts:154-169` |
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
- Time zone resolution validates the stored IANA zone (invalid/missing → `undefined`, i.e. server-local) and `zonedNow` uses the zone when present. — `src/lib/server/utils/userTimezone.ts:5-23` · test: `src/lib/server/utils/userTimezone.test.ts` › "returns undefined for missing, empty, or invalid zones"
- Passwords are bcrypt with 10 salt rounds. — `src/lib/server/utils/password.ts:3-11`
- A password reset revokes every session and every `fp_` token for the user. — `src/routes/(marketing)/forgot-password/reset/+server.ts:124-129`
- Email change request: 3 sends / 15 min per user+IP, Anonymous Accounts refused with `guestNeedsClaim:true`, new address must differ, code+link bound to the current email (`type:'email_change'`, `pendingEmail`), 15-min TTL, previous codes for that email deleted. — `src/lib/server/services/accountData.ts:313-388` · `src/routes/api/me/email/+server.ts:24-40`
- A deleted user also loses `api_tokens` by FK cascade. — `src/lib/server/db/schema.ts:529-541`

### Page and UI behaviour worth keeping
- The `/account` calendar-settings card reads the exact GET shape (`settings`, `verseTranslations`, `consentHistory`) and shows defaults (`defaultView:dayView`, ads off) when the user has no settings row. — `src/routes/api/me/settings/+server.ts:33-38` · test: `src/routes/api/me/settings/server.test.ts` › "no settings row → the page defaults (defaultView dayView)"
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
| `identity.contract.ts` | contract | zod for the seven endpoint bodies/params and the response shapes (person, token row/mint, settings view), with the legacy messages as schema messages. |
| `identity.settings.rules.ts` | rules | `ACCOUNT_SETTINGS_DEFAULTS`, the PATCH allowlist, week-start/view/colour/verse vocabularies, merge-over-stored, canonical verse translation, the default-calendar decision. |
| `identity.person.rules.ts` | rules | `isAnonymousAccount`, `isRegisteredAccount`, `maskEmail`, `displayName`, `profilePatch` (privilege drop), `touchDue(lastActiveAt, now)`, `zoneFromStored`. |
| `identity.session.rules.ts` | rules | lifetime/update constants, cookie attribute policy, `isSessionExpired`, `sessionRenewalDue`. |
| `identity.token.rules.ts` | rules | `fp_` format guard, `apiTokenName` (trim + 60 cap); hashing stays kernel `sha256Hex`. |
| `identity.code.rules.ts` | rules | code TTL, type vocabulary and the `(hash, email, type)` lookup key. |
| `identity.repo.server.ts` | repo | person/settings/session/token/code/account queries; `db: Db` first; own tables only. |
| `identity.fixtures.server.ts` | fixtures | `seedPerson`, `seedCalendarSettings`, `seedApiToken`, `seedSession`, `seedEmailCode`. |
| `identity.person.service.server.ts` | service | `getPerson`, `updatePersonProfile`, `createAnonymousAccount`, `touchLastActive`, `resolveTimeZone`, `createPersonWithPassword`, `deletePerson`. |
| `identity.session.service.server.ts` | service | `startSession`, `validateSession`, `endSession`, `endOtherSessions` + cookie signing/verification (node:crypto; the secret comes from `ctx.config`). |
| `identity.tokens.service.server.ts` | service | `listApiTokens`, `mintApiToken`, `revokeApiToken`, `resolveApiToken`. |
| `identity.settings.service.server.ts` | service | `readCalendarSettings`, `updateCalendarSettings` with the injected `CalendarSettingsConsentPort` and the default-calendar access check. |
| `identity.credentials.service.server.ts` | service | `hashPassword`, `verifyPassword`, `issueEmailCode`, `redeemEmailCode`. |
| `identity.http.server.ts` | http | the seven `endpoint()` definitions, wire-exact. |
| `identity.http.db.test.ts` | test | S2 goldens (written). |
| `identity.{settings,person,session,token,code}.rules.test.ts` | test | input → output tables per rule topic. |
| `identity.{repo,person.service,session.service,tokens.service,settings.service,credentials.service}.db.test.ts` | test | R3/R13 coverage; `rollbackTest`. |
| `identity.api.ts`, `identity.settings.state.svelte.ts` (S7) | api / state | browser client for the settings/profile/token endpoints and the account cards' state. |
| `ui/AccountProfileCard.svelte`, `ui/AccountApiTokensCard.svelte`, `ui/AccountSessionsCard.svelte`, `ui/AccountCalendarSettingsCard.svelte` (S7) | ui | the account page's identity sections, data + callbacks in. |
| `index.ts`, `index.server.ts`, [ui/index.ts](../../../src/lib/domains/identity/ui/index.ts) | entry | the public interfaces listed in the README. |

Where the legacy exports go:

- `src/lib/server/auth.ts:27-240` → session rules (constants, attributes, renewal) + session service (HMAC, DB, cookie); the `session` facade and `invalidateStaleAnonymousSession` die (the latter is a login-flow rule → access, built on `endSession`).
- `src/lib/server/db/actions/apiTokens.ts` → token rules (`API_TOKEN_PREFIX`, format) + tokens service/repo; `hashApiToken` becomes kernel `sha256Hex` (byte-identical, pinned by `ids.test.ts`); `getUserForApiToken` → `resolveApiToken` (app hooks).
- `src/lib/server/db/actions/userSettings.ts` → settings repo + the allowlist in settings rules.
- `src/lib/server/db/actions/users.ts` → person repo/service (`createUser`, `updateUser`, `verifyUserEmail`, `setUserPasswordHash`, `claimEmailForUser`, `createAnonymousUser`, `touchLastActiveAt`, `deleteUser`, `getStaleAnonymousUsers`); `getUsers`/`getUserByEmail`/`emailExists`/`deleteUserByEmail` become named repo reads when their callers port.
- `src/lib/server/db/actions/codes.ts` → code rules + credentials service/repo; dead `getCodes`/`getCodesByEmail` die, `hashEmailCode` becomes kernel `sha256Hex`.
- `src/lib/server/db/actions/accounts.ts` → accounts repo; dead `getAccounts`/`updateAccount`/`deleteAccount` die (`getAccount` becomes `findAccountBinding` with a real `| undefined`).
- `src/lib/utils/anonymous.ts` → `identity.person.rules.ts` (one predicate for everyone).
- `src/lib/server/utils/password.ts` → credentials service (bcrypt cost 10 stays).
- `src/lib/server/utils/userTimezone.ts` → `zoneFromStored` rule + `resolveTimeZone` service.

## Notes

**S1**

- The API table has 7 rows: six `/api` route files carrying **seven methods** (`GET`/`POST` tokens, `DELETE` token, `PATCH` profile, `POST` revoke-others, `GET`/`PATCH` settings). The seventh row, `/calendar/setUserDefaultTimeZone`, is not `/api`, so it gets no golden (playbook: goldens are `/api` only). Mobile auth belongs to [access](access.md), not here.
- No spec-goldens were needed: every identity route handler runs in the `db` project. The only `$env/static/private` read in the graph is `src/lib/utils/sendEmail.ts:6` (`new Resend(RESEND_API_KEY)` at import), reached through `accountData.ts`; `RESEND_API_KEY` is present in the repository's test environment (it is in the generated `.svelte-kit/ambient.d.ts`), and none of these handlers sends email. If a runner ever lacks it, the file fails at import and the goldens must be re-labelled per the characterize playbook — noted so nobody debugs the wire tests.
- Inventory omission found while reading the handler: `PATCH /api/me/settings` also answers `400 {"error":"Invalid defaultCalendarId"}` for a non-string, non-null id (`src/routes/api/me/settings/+server.ts:99-103`). It is pinned in the goldens (`› answers 400 for {"defaultCalendarId":5}`) as today's behaviour.
- "Probably accidental", internal only → dropped: dead exports `getCodes`, `getCodesByEmail`, `getAccounts`, `updateAccount`, `deleteAccount` (accounts action), `deleteUserByEmail` (no importers); the `getAccount(): Promise<Account>` type lie (the new repo read is `Account | undefined`); `createSession`'s fabricated `createdAt`/`updatedAt`/`ipAddress`/`userAgent` (the new service returns the inserted row); the N+1 `revokeOtherSessions` loop (one owner-scoped `DELETE`; behaviour identical, pinned by the golden).
- "Probably accidental", wire-visible → `/calendar/setUserDefaultTimeZone` (no IANA validation, unguarded JSON → 500). It is not on the `/api` contract and its own comment says `PATCH /api/me/settings` replaces it; it is dropped from identity, and the web caller must move to the PATCH when the route is deleted (S8). `useCloudAI`/`useLocalAI` stay as schema columns but no write path exists; see the owner question below.
- The ad-consent trail (`adConsentRecords`) is sponsored's table (rank 12, R1 forbids importing it here). Identity takes a `CalendarSettingsConsentPort` (`listConsentHistory`, `recordConsentChange`) as a service argument; the `/api/me/settings` route file and the account page pass sponsored's implementation. The legacy rule that a consent write failure is logged and never fails the settings save is kept inside `updateCalendarSettings`. Agreed with the sponsored owner during S1.
- Account deletion crosses modules: `subscriptions.userId` is the only non-cascading user FK. Identity's `deletePerson` deletes the users row (sessions/settings/tokens cascade); the caller (account's `DELETE /api/me`) clears billing rows first inside one `withTx`, so both writes share the transaction. `tasks.assignmentStatus` is cleared through the same transaction by the tasks module (or an injected callback) — identity must not write tasks' table (R3).
- Golden coverage (S2, `identity.http.db.test.ts`): all seven methods across the six route files, each with its 401; success with the full body; every 400 the handlers can produce (incl. the absent/blank/non-string name trio, empty-body `{}` vs malformed JSON vs JSON array, and `Invalid defaultCalendarId`); owner-scoped DELETE; `defaultCalendarId:null` vs inaccessible id; consent transition vs no-op; and side effects read back from `api_tokens`, `auth_session`, `user_settings`, `ad_consent_records` and `users`. One legacy rule cannot be reached through the handler in this harness: `invoke` always sets `locals.session = null`, so the "cookie caller keeps its own session" branch is only pinnable at the S5 service level (`endOtherSessions(ctx, actor, keepSessionId)`); the goldens pin the observable Bearer/keep-nothing result.
- Legacy files kept for unported importers: every identity legacy file still has importers outside the module (`auth.ts` 15, `users.ts` 22, `userTimezone.ts` 16, `anonymous.ts` 21, `password.ts` 7, `codes.ts` 14, `apiTokens.ts` 7, `userSettings.ts` 22, `accounts.ts` 7 — `npm run census -- identity`). They stay until access/account/calendar/etc. are ported; S8 deletes only what has zero importers. `anonymous.ts` is the interesting one: its 20 importers (components included) make it the last file to move.

**Questions for the owner**

1. **`userSettings.useCloudAI` / `useLocalAI`.** Context: the columns exist with defaults but no code path writes them (`SETTING_UPDATE_FIELDS` excludes them; the settings PATCH rejects them as unknown). Options: leave them dead until a schema ticket, expose them as writable settings (changes the wire), or drop them by migration. Recommendation: leave them (schema is fixed) and do not expose them; record in the ticket that removes them. No wire change now.
2. **Deleting `/calendar/setUserDefaultTimeZone`.** Context: it is the web-only duplicate of `PATCH /api/me/settings`, stores unvalidated zones and 500s on malformed JSON. Options: delete it and move the web caller to the PATCH (S7/S8), or keep a shim. Recommendation: delete it; the sheet's own comment says the PATCH replaces it, and no Android client calls it.
3. **Carry-overs.** #169 (token expiry + scopes, session idle timeout, PII log scrub) and #174 (email normalization) are unchanged: the goldens pin today's "tokens live until revoked" behaviour, so #169 stays a separate ticket. No action in this port.

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# identity: 0% ported

legacy source files left (9/9, 735 LOC):
  - src/lib/server/auth.ts (241 LOC, server) importers: 15
  - src/lib/server/db/actions/accounts.ts (35 LOC, server) importers: 7
  - src/lib/server/db/actions/apiTokens.ts (92 LOC, server) importers: 7
  - src/lib/server/db/actions/codes.ts (83 LOC, server) importers: 14
  - src/lib/server/db/actions/userSettings.ts (54 LOC, server) importers: 22
  - src/lib/server/db/actions/users.ts (166 LOC, server) importers: 22
  - src/lib/server/utils/password.ts (12 LOC, server) importers: 7
  - src/lib/server/utils/userTimezone.ts (24 LOC, server) importers: 16
  - src/lib/utils/anonymous.ts (28 LOC, model) importers: 21

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
