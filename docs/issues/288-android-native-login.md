# 288 — Android: real sign-in (no pasted API token)

Status: done (server + Android lanes)

> **Server deviations from the contract below (Android: build against these):**
> 1. **The code is 8 digits, not 6** — it is the web's existing `issueVerificationCode` code. Code entry must accept 8 digits.
> 2. **`/email` with `intent:"signup"` requires `firstName` + `lastName`** in the same body (`400 {"error":"First and last name are required"}` otherwise). The names are stored with the code and the account is created from them at `/verify`; `/verify` takes no names. Collect names on the Create-account screen before "Email me a code".
> 3. Extra error cases (all `{"error":…}`): `400 "intent must be \"login\" or \"signup\""`, `400 "Request body must be JSON"`, `400 "Email and password are required"` (/password), `409 "An account with this email already exists — sign in instead"` (/verify signup race), `500 "Couldn't send the email — try again"` (/email), `500 "Something went wrong — try again"` (any), `401 {"error":"Unauthorized"}` (/logout without a valid Bearer).
> 4. `/verify` with a bad email returns `400 "Enter a valid email"` (not the wrong-code message); a missing code reads as wrong code.
> 5. `/guest` is rate-limited: 10 per IP per hour → 429.
> 6. **Sign-out order:** `/logout` revokes the token immediately, so call `DELETE /api/devices` (FCM unregister) **before** `/logout`, not after.
> 7. Client must send `Content-Type: application/json`, no `Origin`, and no `Authorization` header on email/verify/password/guest (a stale Bearer is 401'd by the hook).
> Full wire spec: `docs/guides/task-api-spec.md` → "Mobile sign-in".

Source: owner 2026-11-03 — "Shouldn't need a token in the app. Should be able to login."

## Contract (server, all JSON, no cookies; rate-limited like the web flows)

- `POST /api/mobile/auth/email` `{ "email", "intent": "login" | "signup" }` → `200 {"sent":true}` always for a well-formed email (no account enumeration); sends the same 6-digit code email the web uses (`issueVerificationCode`). 400 `{"error":"Enter a valid email"}`, 429 `{"error":"Too many attempts — try again in a few minutes"}`.
- `POST /api/mobile/auth/verify` `{ "email", "code", "intent", "deviceName" }` → `200 {"token":"fp_…","user":{"id","firstName","lastName","email"}}`. Signup intent creates the account (same rules as web code signup); login intent signs into the existing account. 400 `{"error":"That code is wrong or expired"}`, 429.
- `POST /api/mobile/auth/password` `{ "email", "password", "deviceName" }` → same 200 shape; 401 `{"error":"Email or password is incorrect"}`, 429.
- `POST /api/mobile/auth/guest` `{ "deviceName" }` → creates an **Anonymous Account** (CONTEXT.md; same as the web's guest) + token; same 200 shape with the placeholder email hidden (`email: null`).
- `POST /api/mobile/auth/logout` (Bearer fp_) → revokes THAT token → `200 {"success":true}`.
- Tokens are the existing `apiTokens` (fp_ prefix), one per device, named "Android — <deviceName>", visible/revocable on /account like today.
- Documented in `docs/guides/task-api-spec.md` ("Mobile sign-in").

## Android

- First run shows a Sign-in screen: email → "Email me a code" → 6-digit code entry (paste-friendly, resend after 30 s); "Use password instead"; "Create account" (signup intent, first/last name if the server needs them); "Continue without an account" (guest; banner later suggests Claiming via the web until a native claim flow exists).
- On success store the token exactly where the pasted token lived today (DataStore) so every existing feature (tasks, calendar, push registration #273, reminders #271) just works; also store me-id.
- Sign out → `POST /api/mobile/auth/logout`, then the existing sign-out path (FCM unregister, reminders cancel).
- The paste-a-token field moves under "Advanced" on the sign-in screen (developer fallback), not the default.
- 401 anywhere → back to Sign-in with the reason (as today with the token screen).

## Done

- **Server lane (2026-11-03).** `src/routes/api/mobile/auth/{email,verify,password,guest,logout}/+server.ts` → thin wrappers over `src/lib/server/services/mobileAuth.ts` (injectable deps). Reuses `issueMagicLink`/`issueVerificationCode` (same code email + hashed, type-stamped `codes` rows as the web), the web's rate-limit buckets (`clientKey` IP + `login-code:`/`signup-code:`/`verify-<intent>-code:`/`pw-login:` + email), `createNewUser`, `createAnonymousUser`, `createApiToken` (fp_). New `revokeTokenByPlaintext(userId, token)` in `apiTokens.ts` for logout. No schema change. Hooks unchanged: verified Origin-less JSON POSTs pass `apiOriginCheck` and SvelteKit CSRF (form content types only), and no guest session is auto-created (that only happens for GET text/html on protected routes).
  - Evidence: `npx vitest run src/routes/api/mobile` — 6 files / 40 tests green (happy paths, 400 validation, wrong code 400, wrong password 401, 429 at web limits per IP+email, signup creates / login doesn't, guest `email:null`, 60-char deviceName, logout revokes only the presented token scoped to owner, no `Set-Cookie` on every 200, real hooks chain: native POSTs pass with no cookie/guest, cross-site Origin 403, guest Bearer → `GET /api/tasks` 200). `hooks.server.test.ts` + `apiTokens.test.ts` green; svelte-check no new errors; `npm run build` green; oxlint/eslint/prettier clean on touched files.
  - Docs: `docs/guides/task-api-spec.md` → "Mobile sign-in".

- **Android lane (2026-11-03).** Built against the deviations above (8-digit code, signup names on `/email`, verbatim error text, DELETE /api/devices before /logout, bearer-free auth client).
  - `data/AuthApi.kt` (Retrofit + @Serializable DTOs, `AuthIntent` login|signup) + `data/AuthSource.kt` (`NetworkAuthSource`, `AuthError` Rejected 4xx / RateLimited 429 / Server / Network — every server `error` text verbatim; a non-JSON 200 is a Server error, not a crash; `DeviceNameProvider` = `Build.MODEL`, injectable). `ApiFactory.createAuth` = separate client with no bearer interceptor; logout passes its own `Authorization`.
  - `ui/SignInViewModel.kt` (email → code → signed in; password; guest; 30 s resend countdown via injectable tick; pending per button, repeat taps ignored) + `ui/SignInScreen.kt`/`SignInSteps.kt` (email, "Email me a code", 8-digit code field that strips non-digits and auto-submits, "Resend code in N s", "Wrong email?", "Use password instead", "Create an account" with first/last name, "Continue without an account", paste-token under collapsed "Advanced"). Replaces `SettingsScreen.kt` as the `NeedToken` destination.
  - Success → `AppViewModel.signIn(SessionCredentials)`: DataStore token + me-id from the response user, then refresh + the #273 `signedIn` hook (pasted token goes through the same call). Guest → dismissible "You're using a guest account — save it with an email on the web" note on the Tasks tab (flag in DataStore, survives restart, cleared by any new sign-in).
  - Sign out (top-bar icon, now "Sign out"): token cleared → `SessionHooks.signedOut(old bearer)` (reminders replan, FCM `DELETE /api/devices` with the old bearer) → `POST /api/mobile/auth/logout` best-effort. 401 anywhere → sign-in screen with the reason (unchanged).
  - Evidence: `:app:mobileGate :app:assembleRelease` BUILD SUCCESSFUL, 224 unit tests / 0 failures. New: `AuthApiContractTest` (12, MockWebServer: request bodies incl. deviceName + signup names, no Authorization/Origin, JSON content type, 200 parse incl. guest `email:null`, 400/401/409/429/500 text, non-JSON 200, dropped connection), `SignInViewModelTest` (12), `SessionHooksTest` +3 (native sign-in stores me-id; sign-out = unregister then logout; guest note across restart), `SignInUiTest` (9 Robolectric: code flow against MockWebServer into the Tasks tab, signup names, Advanced token, wrong password, 429, pending label, guest note dismiss, sign-out revoke, wrong email).

## Needs doing

- Human: drive the flow on a real phone against test.familyplanz.com (code email arrives, token appears on /account as "Android — <model>").
- Later: native Claiming for guests (the note points to the web for now).
