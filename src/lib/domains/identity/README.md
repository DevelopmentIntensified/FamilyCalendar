# identity

**domain** — Users, sessions and session cookies, personal API tokens (fp_), user settings incl. time zone, Anonymous Account detection, email codes, password hashing.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns: the person row (`users`), the session row and the signed session cookie, personal `fp_` API tokens, calendar settings (incl. the user's IANA time zone), Anonymous Account detection, hashed email codes and password hashing.
- Owns the `/api/me/api-tokens`, `/api/me/profile`, `/api/me/settings` and `/api/me/sessions/revoke-others` endpoints — the person's own data, never another person's.
- Does not own: sign-in, sign-up, Magic Link, Claiming, Claim Conflict and email-change flows ([access sheet](../../../../docs/rewrite/modules/access.md)); subscription data and plan limits ([billing sheet](../../../../docs/rewrite/modules/billing.md)); notification preferences ([alerts sheet](../../../../docs/rewrite/modules/alerts.md)); the `/api/me` shell (`familyId`, roles for the app chrome) — that composition belongs to the account screen.

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: contract types (settings wire, profile patch), pure rules (`isAnonymousAccount`, `isRegisteredAccount`, `displayName`, session-cookie math, settings merge) and the consent port type. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: the person, session, token, settings and credential use-cases plus the seven endpoint handlers. | — |
| [ui/index.ts](ui/index.ts) | entry | Public components: the account page's profile, tokens, sessions and calendar-settings cards. | — |
| [identity.http.db.test.ts](identity.http.db.test.ts) | test | Golden contract tests for the six `/api/me/*` route files, written against today's legacy handlers; they must stay green, unchanged, after the port. | — |

## Public interface

Designed now (S1); each entry hides a whole use-case, so callers never re-implement a rule. The deletion test keeps it small: merging a settings patch, signing/verifying a cookie, deciding a renewal, hashing and scoping a token, binding an email code and clearing a default calendar are all behaviour that would otherwise be copied into `app`, `access` and `account`.

- `index.ts`:
  - `isAnonymousAccount(user)` / `isRegisteredAccount(user)` — the ONE Anonymous Account predicate (placeholder `@anonymous.placeholder.invalid`); "registered" is a real email, never `user.email` truthiness.
  - `displayName(person)` — `firstName lastName` trimmed, the single person-label rule.
  - `maskEmail(user)` — the placeholder email leaves the server as `null`; every wire that carries a person uses this.
  - `ACCOUNT_SETTINGS_DEFAULTS`, `calendarSettingsPatch(body)` / `mergeCalendarSettings(stored, patch)` — the settings wire vocabulary, allowlist and defaults, pure.
  - `SESSION_LIFETIME_SECONDS`, `SESSION_UPDATE_AGE_SECONDS`, `sessionCookieAttributes(production)`, `sessionRenewalDue(updatedAt, now)` / `isSessionExpired(expiresAt, now)` — the cookie policy and 90-day sliding-renewal math, pure (the HMAC itself is server code).
  - `apiTokenName(raw)` — trimmed and capped at 60 (`fp_` minting is server code).
  - `CalendarSettingsConsentPort` — the type identity uses to read/write the ad-consent trail; sponsored implements it (R1 forbids identity importing ranks 2+).
- `index.server.ts`:
  - `getPerson(ctx, actor)` — the caller's own person (no other id is accepted): names, email masked, `emailVerified`, `isAnonymous`, `roles`, `lastActiveAt`.
  - `updatePersonProfile(ctx, actor, input)` — trims and writes `firstName`/`lastName` only; privilege fields cannot pass through.
  - `createAnonymousAccount(ctx)` — one row with a placeholder email plus `timeZone:'UTC'` settings; the "document navigation only" gate stays in `app` hooks.
  - `touchLastActive(ctx, actor)` — the Inactivity Window input, at most once per hour.
  - `resolveTimeZone(ctx, userId)` — validated IANA zone, `undefined` = server-local.
  - `startSession(ctx, userId)` / `validateSession(ctx, cookieValue)` / `endSession(ctx, sessionId)` / `endOtherSessions(ctx, actor, keepSessionId)` — session CRUD, cookie signing/verification (`token.hmacSHA256(token)`, raw, never re-encoded), sliding renewal, the "keep mine" logout.
  - `listApiTokens(ctx, actor)` / `mintApiToken(ctx, actor, {name})` / `revokeApiToken(ctx, actor, id)` / `resolveApiToken(ctx, token)` — personal tokens (`fp_` + 32 random bytes base64url); plaintext only from mint, hash never leaves, revoke owner-scoped, resolve touches `lastUsedAt`.
  - `readCalendarSettings(ctx, actor, consent)` / `updateCalendarSettings(ctx, actor, patch, consent)` — the merged settings view, default-calendar access check, consent transition; validates the same values the legacy route validates.
  - `hashPassword(password)` / `verifyPassword(password, hash)` — bcrypt cost 10.
  - `issueEmailCode(ctx, input)` / `redeemEmailCode(ctx, input)` — hashed, type-stamped, `(hash, email, type)`-bound codes.
  - `deletePerson(ctx, actor)` — deletes the users row; sessions, settings and tokens cascade. The caller clears plan-billing rows first (see Invariants).
  - Endpoint handlers: `listApiTokensEndpoint`, `createApiTokenEndpoint`, `revokeApiTokenEndpoint`, `updateProfileEndpoint`, `revokeOtherSessionsEndpoint`, `getAccountSettingsEndpoint`, `patchAccountSettingsEndpoint`.
- `ui/index.ts`: `AccountProfileCard`, `AccountApiTokensCard`, `AccountSessionsCard`, `AccountCalendarSettingsCard` — data and callbacks in, events out.
- Deleted legacy exports (deletion test): `getCodes`, `getCodesByEmail`, `getAccounts`, `updateAccount`, `deleteAccount` (the `accounts` action), `deleteUserByEmail` — no importers, and the new repos name the queries they need.

## How to test

- Whole module: `npm run test:mod -- identity` (add `--legacy` while legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup.
- Database + services: `*.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: `identity.http.db.test.ts` pins status + body of every endpoint (golden tests). Committed mode (`beforeEach(truncateAll)`) because legacy handlers write through the `db` singleton.
- UI: `ui/*.svelte.test.ts` render with props; state classes are tested without a DOM.
- Fixtures: `identity.fixtures.server.ts` (`seedPerson`, `seedCalendarSettings`, `seedApiToken`, `seedSession`, `seedEmailCode`).

## Invariants

Behaviour that must not change, each with the evidence it was read from and the test that pins it.

**Wire — pinned by [identity.http.db.test.ts](identity.http.db.test.ts)**

- Every endpoint answers `401 {"error":"Unauthorized"}` when signed out — golden `› answers 401 {"error":"Unauthorized"} when signed out` on each describe. Evidence: `src/lib/server/utils/requireUser.ts:47-53`, each route's first line.
- `GET /api/me/api-tokens` → `200 {tokens:[{id,name,createdAt,lastUsedAt}]}`; `tokenHash` is never selected, and another person's tokens never appear — golden `› lists your tokens with id, name, createdAt and lastUsedAt — never the hash` and `› never returns another person’s tokens`. Evidence: `src/lib/server/db/actions/apiTokens.ts:38-48`.
- `POST /api/me/api-tokens` mints `fp_` + 43 base64url chars, stores only the SHA-256 hex, answers `201 {token, record:{id,name,createdAt}}` with the plaintext once; the name is trimmed and capped at 60 — golden `› mints an fp_ token, answers 201 with the plaintext once and stores only its SHA-256`, `› keeps at most 60 characters of the name`. Evidence: `src/lib/server/db/actions/apiTokens.ts:12-35`, `src/lib/server/services/accountData.ts:418-438`.
- Absent/non-string/blank token names → `400 {"error":"Token name is required"}`; an empty body reads as `{}`; malformed JSON or a JSON array → `400 {"error":"Invalid JSON"}` — golden `› refuses an absent name … (an empty body reads as {})`, `› refuses a whitespace-only name …`, `› refuses a non-string name …`, `› answers 400 {"error":"Invalid JSON"} for a malformed body`, `› … for a JSON array (not an object)`. Evidence: `src/lib/server/utils/jsonBody.ts:8-28`, `src/lib/server/services/accountData.ts:421-423`.
- `DELETE /api/me/api-tokens/:id` → `200 {success:true}`; scoped to `(id, userId)`, so a foreign or unknown id deletes nothing and answers the same; empty id → `400 {"error":"Token id is required"}` — golden `› revokes your own token and answers {success:true}`, `› is owner-scoped …`, `› an unknown id is the same 200 …`, `› answers 400 {"error":"Token id is required"} for an empty id`. Evidence: `src/lib/server/db/actions/apiTokens.ts:51-53`, `src/lib/server/services/accountData.ts:441-449`.
- `PATCH /api/me/profile` trims both names, writes them, echoes `{success:true,user:{id,firstName,lastName,email}}`; the Anonymous Account placeholder email is `null` — golden `› trims both names, writes them and echoes them with the email`, `› masks an Anonymous Account’s placeholder email to null`. Evidence: `src/routes/api/me/profile/+server.ts:10-40`, `src/lib/utils/anonymous.ts:14-27`.
- A missing or non-string profile name → `400 {"error":"First name and last name are required"}` and writes nothing — golden `› refuses an absent last name …`, `› refuses a non-string name and writes nothing`. Evidence: `src/lib/server/services/accountData.ts:260-266`.
- `POST /api/me/sessions/revoke-others` revokes every web session of the caller and leaves other people's sessions and every `fp_` API token alone; `revoked` is the count — golden `› revokes every web session of the caller, leaves other people and API tokens alone`, `› a Bearer caller (no cookie session) signs out every web session too`. Evidence: `src/lib/server/services/accountData.ts:397-415`, `src/routes/api/me/sessions/revoke-others/+server.ts:12-19`.
- `GET /api/me/settings` with no row answers `ACCOUNT_SETTINGS_DEFAULTS` (`defaultView:'dayView'`, ads off) plus `verseTranslations` and `consentHistory` — golden `› answers the page defaults when the person has no settings row`. With a row it answers the stored row (every column, timestamps as ISO) and the consent trail — golden `› answers the stored row, the translation options and the consent trail`. Evidence: `src/routes/api/me/settings/+server.ts:33-38`, `src/lib/server/services/accountData.ts:52-98`.
- `PATCH /api/me/settings` merges the sent subset over the stored row (or the defaults when none exists); `{timeZone}` alone keeps every other value and does NOT re-check a stale `defaultCalendarId` — golden `› timeZone alone keeps every other stored field (and skips the stale default-calendar check)`, `› creates the row from the page defaults plus the patch when none exists`, `› an empty object changes nothing and answers the stored row`. Evidence: `src/routes/api/me/settings/+server.ts:91-131`.
- `defaultCalendarId:null` is accepted and stored; a newly sent inaccessible calendar id → `400 {"error":"Selected default calendar is not available"}` and the stored row is untouched — golden `› accepts defaultCalendarId:null and stores null`, `› keeps the stored row when a newly set default calendar is not accessible`. Evidence: `src/routes/api/me/settings/+server.ts:99-103`, `src/lib/server/services/accountData.ts:154-169`.
- Turning `showAdsAsEvents` on records one `granted` consent row and answers it in `consentHistory`; an unchanged value records nothing — golden `› records the ad-consent transition when showAdsAsEvents turns on`, `› writes no consent record when the ad setting does not change`. Evidence: `src/lib/server/services/accountData.ts:184-206`, `src/lib/server/services/adConsentService.ts:29-55`.
- Every PATCH validation refusal keeps the legacy wording: `Invalid weekStart|timeZone|color|defaultView|verseTranslation|<booleanField>`, `Invalid defaultCalendarId`, `Unknown field: <key>`, `Invalid body`, `Invalid JSON` — golden `› answers 400 for %j` and `› answers 400 {"error":"Invalid body"} when the body is not an object`, `› answers 400 {"error":"Invalid JSON"} for a malformed or an empty body`. Evidence: `src/routes/api/me/settings/+server.ts:42-88`.

**Domain rules — pinned by the S3–S5 tests**

- `fp_` tokens are `fp_` + 32 random bytes base64url (43 chars, no padding); only the SHA-256 hex is stored; plaintext is returned once. `identity.token.rules.test.ts › mints fp_ followed by 43 base64url characters` and `identity.tokens.service.db.test.ts › stores only the SHA-256 of the plaintext`. Evidence: `src/lib/server/db/actions/apiTokens.ts:12-35`.
- Revoking is scoped to `(id, userId)`; `revokeAllTokensForUser` deletes every token (the caller's included). `identity.tokens.service.db.test.ts › revokes another person’s token as a no-op` / `› revokes every token for a password reset`. Evidence: `src/lib/server/db/actions/apiTokens.ts:51-62`.
- A Bearer token is honoured only under `/api/*`; an invalid token is a `401 {"error":"Unauthorized"}` JSON (never a redirect); a token caller has `session: null`; a valid token touches `lastUsedAt`, an unknown owner does not. `identity.tokens.service.db.test.ts › resolves a token to its owner and touches lastUsedAt` / `› answers null for a token whose owner is gone, without touching it`. Evidence: `src/hooks.server.ts:42-61`, `src/lib/server/db/actions/apiTokens.ts:80-91`.
- The session cookie is `better-auth.session_token`, value raw `token.hmacSHA256(token)` (base64, 44 chars, `=`-padded), never percent-encoded by the module; verification splits at the last `.`, rejects a wrong-length signature and compares with `timingSafeEqual`. `identity.session.rules.test.ts › signs token.signature without URL encoding (kit encodes once)` / `› rejects a malformed, short or tampered signature`. Evidence: `src/lib/server/auth.ts:60-81`.
- Cookie attributes are `path:/`, `httpOnly`, `sameSite:lax`, `secure` only in production; a blank cookie is an empty value with `Max-Age=0`/`Expires=1970`. `identity.session.rules.test.ts › builds the better-auth cookie attributes and the blank cookie`. Evidence: `src/lib/server/auth.ts:91-132`.
- Sessions live 90 days and slide: an expired row is deleted on validation, a row older than 24 h rolls its expiry forward, an unknown user drops the session row. `identity.session.service.db.test.ts › deletes an expired session` / `› renews at most once per 24 hours` / `› drops the session when the user is gone`. Evidence: `src/lib/server/auth.ts:27-28,186-214`.
- Production refuses to boot without `BETTER_AUTH_SECRET`; elsewhere the placeholder secret keeps zero-env builds signing. `identity.session.rules.test.ts › the placeholder secret only in non-production`. Evidence: `src/lib/server/auth.ts:38-51`.
- One seam writes every session cookie; `startSession` inserts a 15-char id, a 32-char token and the 90-day expiry, and returns the inserted row. `identity.session.service.db.test.ts › inserts the session row and mints the cookie through one seam`. Evidence: `src/lib/server/auth.ts:120-165`.
- An Anonymous Account is a user row whose email ends `@anonymous.placeholder.invalid`; creation writes the placeholder email, `emailVerified:false`, `roles:[]` and `timeZone:'UTC'` settings, and is triggered ONLY by a document navigation (`GET` + `Accept: text/html`) to a protected route after the admin redirect — the gate stays in `app` hooks and is pinned there, not by this module's tests. Evidence: `src/lib/utils/anonymous.ts:12-27`, `src/lib/server/db/actions/users.ts:121-140`, `src/hooks.server.ts:69-95`. `identity.person.rules.test.ts › isAnonymousAccount is true only for the placeholder domain`, `identity.person.service.db.test.ts › creates an Anonymous Account with UTC settings`.
- `lastActiveAt` is touched on an authenticated request at most once per hour. `identity.person.rules.test.ts › touch is due only after an hour`. Evidence: `src/hooks.server.ts:26,106-114`, `src/lib/server/db/actions/users.ts:142-144`.
- Writing a person with a password writes both `users.passwordHash` and the `auth_account` credential row (`id: pw-<userId>`, `providerId:'credential'`, `accountId:<userId>`) in one transaction; without a password only the user row. `identity.person.service.db.test.ts › writes the credential row with the user in one transaction`. Evidence: `src/lib/server/db/actions/users.ts:52-73`.
- The profile write accepts only `firstName`/`lastName`; `email`, `emailVerified`, `passwordHash` and `roles` are dropped at runtime and each has its own use-case. `identity.person.rules.test.ts › profilePatch keeps only the safe fields`. Evidence: `src/lib/server/db/actions/users.ts:9-13,76-83`.
- Settings writes accept only the explicit allowlist (including explicit `null`s) and drop row/system fields; `useCloudAI`/`useLocalAI` are not writable (see Notes). `identity.settings.rules.test.ts › keeps only writable settings keys`. Evidence: `src/lib/server/db/actions/userSettings.ts:6-20,39-49`.
- Email codes are stored as `sha256` hex, never plaintext, and every lookup/delete binds `(hash, email, type)`. `identity.code.rules.test.ts › hashes the code and stamps its type`, `identity.credentials.service.db.test.ts › a digest match with the wrong email or type does not redeem`. Evidence: `src/lib/server/db/actions/codes.ts:12-56`.
- Time-zone resolution validates the stored IANA zone; invalid or missing is `undefined` (server-local), and every Recurring Task cursor pin reads it (#214). `identity.person.rules.test.ts › rejects missing, empty and invalid zones`. Evidence: `src/lib/server/utils/userTimezone.ts:5-23`, `src/lib/server/db/actions/tasks/cursor.ts` (consumer).
- Passwords are bcrypt with 10 salt rounds. `identity.credentials.service.db.test.ts › stores a bcrypt cost-10 hash and verifies it`. Evidence: `src/lib/server/utils/password.ts:3-11`.
- A password reset revokes every session and every `fp_` token for the user. `identity.session.service.db.test.ts › ends every session and token for the user` (the reset route itself is access's). Evidence: `src/routes/(marketing)/forgot-password/reset/+server.ts:124-129`.
- Deleting a person removes the users row after the caller clears plan-billing rows first (`subscriptions.userId` is the only non-cascading user FK); sessions, settings and `api_tokens` cascade with the row. `identity.person.service.db.test.ts › deletes the person and cascades sessions, settings and tokens`; the subscription-first ordering is pinned in the account module's deletion test. Evidence: `src/lib/server/db/actions/users.ts:103-115`, `src/lib/server/db/schema.ts:529-541`.
- Deleting a person clears `tasks.assignmentStatus` for tasks assigned to them in the same transaction — pinned with the assigning module's help (tasks is higher-ranked, so the tasks service or an injected callback performs it). Evidence: `src/lib/server/db/actions/users.ts:107-113`.

## Depends on

- May import: kernel (public entries only).
- Owns tables: `users`, `userSettings`, `accounts`, `codes`, `authSession`, `authAccount`, `authVerification`, `apiTokens`.
- Reads (join only): none.
- Calls: no domain modules (rank 1).
- Called by: `app` hooks (session cookie, Bearer auth, Anonymous Account creation on document navigations, `lastActiveAt`); `access` (session CRUD, password hashing, email codes, Claiming/email-change primitives); `account` (the `/api/me` shell and deletion); every module that needs the caller's time zone or calendar settings; `sponsored` implements the consent port identity consumes.
