# 288 — Android: real sign-in (no pasted API token)

Status: open

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

## Needs doing

- Server lane + Android lane (tests first; MockWebServer contract tests on Android; Robolectric UI tests for the sign-in flow).
