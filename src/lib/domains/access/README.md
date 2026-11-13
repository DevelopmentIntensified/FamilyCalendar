# access

**domain** — Who may get in, and how: email links and codes, passwords, Anonymous Account Claiming and Claim Conflict merge, guest merge, email change/verify, mobile (Android) token sign-in, and sign-out.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- **Owns:** every way a person starts or ends a session — a magic link, an emailed code, a password, a mobile `fp_` token, a Claim link, the guest merge that follows sign-in — plus the emails those flows send and the throttles that protect them.
- **Owns:** `claimTokens` (a Claim link: 32 random bytes, only the SHA-256 stored, 15-minute TTL, consumed by one atomic delete).
- **Does not own:** the user row, sessions and session cookies, email codes, password hashing and API tokens — those are identity's. Access decides *when* to call them; identity decides *how*.
- **Does not own:** what happens to a merged guest's Events and Tasks (calendar and tasks own those rows); access only asks for the move.

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: the auth wire types and the browser calls the auth pages make. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: the `/api` endpoint handlers and the page handlers the route files import. The services behind them stay module-internal — no other module calls one. | — |
| [access.fixtures.server.ts](access.fixtures.server.ts) | fixtures | Row builders for this module's db tests, every name carrying the `Access` noun. | used by the tests below |
| [access.http.db.test.ts](access.http.db.test.ts) | test | Golden contract for the 13 `/api` routes (status + full body + refusal + rows written), plus the two page-group code JSON endpoints (Q-064), green on the legacy route modules. | itself |
| [ui/index.ts](ui/index.ts) | entry | Public components (the shared auth card, labelled input, Password/Email-Link toggle). | — |

## Public interface

Everything other modules and routes may use, grouped by entry file. One line each: `name` — what it does.

Other modules call none of the services: every caller is one of this module's own routes (S8 rewires them) or a page this module owns. The services are still written one per use case, so S5 has one seam per rule — they are just not re-exported.

### `index.ts` — isomorphic

- `AuthIntent` — `'login' | 'signup'`; the intent every email step carries, because a signup code cannot log in.
- `AuthMethod` — `'password' | 'email-link'`; the toggle the sign-in screens render.
- `AuthApi` / `authApi` — the browser calls the auth pages make (`requestLoginLink`, `submitLoginCode`, `signInWithPassword`, `requestSignupCode`, `submitSignupCode`, `signUpWithPassword`, `resendVerification`, `requestPasswordReset`, `resetPassword`), each returning `{ ok: true }` or `{ ok: false; error }` with the server's copy. Deep on purpose: the pages stop knowing paths, bodies or status codes.
- `authRedirectTarget` — re-sanitises a post-sign-in `?redirect=` (path-only, never `//` or a backslash), the one rule both the email and the page use.

### `index.server.ts` — endpoints

- `/api/logout` → `logoutEndpoint`; `/api/me/claim` → `claimRequestBodyEndpoint`; `/api/me/email` → `changeEmailEndpoint`; `/api/me/verify-email` → `verifyEmailEndpoint`; `/api/me/verify-email/resend` → `resendVerificationEndpoint`.
- `/api/mobile/auth/email` → `mobileEmailEndpoint`; `/verify` → `mobileVerifyEndpoint`; `/password` → `mobilePasswordEndpoint`; `/guest` → `mobileGuestEndpoint`; `/logout` → `mobileLogoutEndpoint`; `/signup` → `mobileSignupEndpoint`; `/forgot` → `mobileForgotEndpoint`; `/reset` → `mobileResetEndpoint`.
- `/login/email/code` → `loginCodeEndpoint`; `/signup/email/code` → `signupCodeEndpoint` (the two page-group JSON endpoints; their legacy 500s are pinned by Q-064).
- Page handlers, one per route: `loginPage`, `loginEmailAction`, `loginCodeAction`, `loginPasswordAction`, `loginCallback`, `signupPage`, `signupEmailAction`, `signupCodeAction`, `signupCallback`, `signupPasswordAction`, `passwordResendAction`, `passwordVerifyAction`, `forgotPasswordAction`, `resetPasswordAction`, `claimPage`, `claimRequestAction`, `claimVerifyPage`, `claimVerifyAction`, `verifyEmailPage`, `mergeGuestPage`, `mergeGuestAction`. The family invite page (`/family/invite/email`) is family's, not access's.

### Services (module-internal, one per use case)

Signature is `(ctx, input)` by default; a use case whose actor is the subject of the rule takes `(ctx, actor, input)` instead — `signUpWithPassword`, `resendSignupCode`, `requestEmailChange`, `verifyEmailChange`, `requestClaim`, `confirmClaim`, `mergeGuest`, `signOut`. The rest key off the token or address they are handed and derive the person themselves.

- `startEmailLink(ctx, input)` — `{intent, email, names?, redirectTo?}` → sends a kind-tagged link + code (5 / 15 min) and answers `{sent:true}` even when it suppressed the send. Hides validation, throttling, suppression, the JWT mint and the email.
- `completeEmailLink(ctx, {kind, token})` → `{redirectTo}`: verifies the link's kind and signature, creates or finds the person, mints the session cookie, and kills the arriving guest session exactly once.
- `signInWithPassword(ctx, {email, password, deviceName?})` → `{sessionCookie}` or `{token, user}`: the one password check (dummy-compare timing defence, generic refusal), shared by the web and Android.
- `signUpWithPassword(ctx, actor, input)` → `{created, user?, verification}`: creates the unverified account + personal calendar, and answers the same pending shape for a taken address.
- `verifySignupCode(ctx, {email, code})` / `resendSignupCode(ctx, actor)` — flip `emailVerified` for the one `password-signup` row; resend is idempotent once verified.
- `requestPasswordReset(ctx, {email})` → `{sent:true}` always; `resetPassword(ctx, {token, password})` — single-use, revokes every session and every `fp_` token.
- `requestEmailChange(ctx, actor, {email})` / `verifyEmailChange(ctx, actor, {code | token})` — identity-bound code, 10 / 15 min.
- `requestClaim(ctx, actor, {email})` → `{sent:true}` for a guest, identical for a registered address; `confirmClaim(ctx, actor, {token})` → `{outcome:'claimed' | 'merged'}` with the Claim Conflict merge.
- `mergeGuest(ctx, actor, {keep})` — one transaction: personal calendar, events, tasks, sessions, guest row.
- `signOut(ctx, actor)` — ends the current session (cookie) or revokes exactly the presented `fp_` token.
- `createGuestAccount(ctx, {deviceName?})` — the Android Anonymous Account + token.

### `ui/index.ts` — components

- `AuthCard` — the `max-w-md` white card every auth page renders inside.
- `AuthInput` — a real `<label for>`, `aria-invalid`, and the inline error wired by `aria-describedby`.
- `ModeToggle` — Password / Email Link, a `role="group"` with `aria-pressed` and 44 px targets.

## How to test

- Whole module: `npm run test:mod -- access` (add `--legacy` while legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup (`access.email.rules.test.ts`, `access.redirect.rules.test.ts`, `access.password.rules.test.ts`, `access.claim.rules.test.ts`, `access.device.rules.test.ts`).
- Database + services: `*.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`) — one test per Invariant that touches rows, titled after the rule.
- HTTP contract: `access.http.db.test.ts` pins status + full body + the rows a request writes, for every `/api` route and the two page-group code JSON endpoints (Q-064). Refusals and side effects run against the legacy handlers today; the 9 `it.skip` spec-goldens at the bottom cover the seven flows whose success really sends email plus the two Claim limits (the per-address and per-IP buckets, which need sends). Unskip them in S6, when the ported handler takes its email sender from `ctx` — see the sheet's Notes.
- Rate-limit cases drive the real request N times **with one `ctx` for the whole test** (`const c = ctx()`) — every request of the burst, the refusal and every control request included. `testCtx()` builds a fresh limiter per call, so a ctx per request would never reach the limit once the port moves the limiter into `ctx.limiter`; the legacy limiter is module state, so today the shared key does the same work. Each budget test also sends a control from a new IP and one from a new address/person, so the key shape (per IP, per address, per person + IP) is pinned, not assumed.
- Case tables are typed `it.each` rows (a body plus the IP it comes from), so a failing case names itself.
- Fixtures: `access.fixtures.server.ts` (`seedAccessGuest`, `seedAccessPasswordUser`, `seedAccessApiToken`, `seedAccessEmailCode`, `seedAccessProviderAccount`, `seedAccessSession`, `seedAccessAuthAccount`), plus `ACCESS_ANON_DOMAIN` and `ACCESS_PASSWORD_HASH`.
- UI: `ui/*.svelte.test.ts` render with props; state classes are tested without a DOM.

## Invariants

Behaviour that must not change, each with the legacy evidence and the test that pins it (`file › test title`, or the golden title for wire rules). `(planned)` marks the test a later step writes.

### Magic links and emailed codes

- Magic links are HS256 JWTs signed with `EMAILSECRET`, 15-minute expiry, carrying `kind`, email, names, an 8-digit code and `redirectTo`; a signup link can never be consumed as a login link, and a token without a `kind` claim is rejected. — `src/lib/server/services/magicLink.ts:207-225,341-411` · (planned) `access.email.rules.test.ts › refuses a link minted for another kind`
- Link issuance is gated at 5 per 15 min per `signup-code:<email>` / `login-code:<email>` (folded with the IP), and the gate runs before the existence check, exactly once. — `src/lib/server/services/magicLink.ts:126-128,287-303` · `src/lib/server/utils/rateLimit.ts:28-33` · `access.http.db.test.ts › POST /api/mobile/auth/email › rate-limits one address at 5 emails per 15 minutes → 429` (same address on a new IP and a new address on the same IP both still send)
- Signup suppresses silently when the address already has an account or user row; login suppresses when nothing matches. — `src/lib/server/services/magicLink.ts:293-303` · `access.http.db.test.ts › POST /api/mobile/auth/email › answers {sent:true} and writes no code for an already-registered signup address`
- The email is sent before the code row is written, so a failed send persists nothing; the row stores the SHA-256 digest, a 15-minute expiry, the send's `emailId` and a type stamp (`kind`, or `password-signup`). — `src/lib/server/services/magicLink.ts:235-258` · (planned) `access.email.service.db.test.ts › persists nothing when the email fails`
- The emailed `?redirect=` is sanitised at issue time, signed into the token, re-sanitised at the callback; unsafe values are dropped and the fallback is `/calendar/` (path-only: no `//`, no backslash, no control chars or encoded CR/LF). — `src/lib/server/services/magicLink.ts:46-57,276-279` · `src/lib/utils/safeRedirect.ts:7-19` · (planned) `access.redirect.rules.test.ts › drops an unsafe redirectTo`
- Codes are redeemed only by `(sha256(code), email, type)`; login accepts only `login` rows, signup only `signup`, password-verify only `password-signup`; unknown, expired, wrong-email and wrong-type all read as one generic 400. — `src/lib/server/services/mobileAuth.ts:273-276` · `src/routes/(marketing)/signup/password/verify/+server.ts:60-72` · `access.http.db.test.ts › POST /api/me/verify-email › rejects a code of another type with the one generic 400`
- Redemption deletes dead codes first, then burns the exact row after use; the web verify also burns a code whose user row is gone, while mobile login leaves an orphaned row in place. — `src/lib/server/db/actions/codes.ts:80-82` · `src/lib/server/services/mobileAuth.ts:273,293-294` · `access.http.db.test.ts › POST /api/me/verify-email › refuses an expired code and deletes it first` · `… › POST /api/mobile/auth/verify › answers 400 and keeps the row when a login code has no account at all`
- A magic-link callback refuses a registered signed-in person but lets a guest session through, and kills that guest session exactly once. — `src/lib/server/auth.ts:229-240` · (planned) `access.email.service.db.test.ts › signs in from a guest session and kills it exactly once`
- Magic-link signup creates the user with `emailVerified:true` (user row + provider account + settings + personal calendar), then sets the cookie. — `src/lib/server/utils/createNewUser.ts:8-35` · (planned) `access.email.service.db.test.ts › creates the user and lands on the redirect target`
- The two page-group code endpoints each answer a 500 that names the account state — `Account with this email already Exists` on signup, `No Account found` on login — and the signup one burns the code while the login one leaves it. Owner question Q-064, answered B (both answer the generic copy); that flip lands after S6 with the golden changed first. — `src/routes/(marketing)/signup/email/code/+server.ts:87-95` · `src/routes/(marketing)/login/email/code/+server.ts:94-100` · `access.http.db.test.ts › POST /signup/email/code (page JSON, Q-064) › answers 500 {"success":false,"error":"Account with this email already Exists"} and burns the code` · `… › POST /login/email/code (page JSON, Q-064) › answers 500 {"success":false,"error":"No Account found"} and keeps the code`

### Passwords

- Password signup requires all four fields and ≥8 characters, throttles 30 / 5 min per IP and 10 / 5 min per address, creates an unverified account, and emails the code; a send failure is logged, never fatal. — `src/lib/server/services/passwordSignup.ts:68-102,108-128` · `access.http.db.test.ts › POST /api/mobile/auth/signup › rate-limits one address at 10 attempts per 5 minutes` · `… › rate-limits one IP at 30 attempts per 5 minutes across addresses`
- A taken address gets the identical status and pending shape, with no session, no email and no code row. It is not an oracle for membership — but `token:''` and `user.id:''` are exactly what an app reads to see the address is taken, so what this hides is whether the account can sign in, not that it exists. — `src/lib/server/services/passwordSignup.ts:77-90` · `src/routes/api/mobile/auth/signup/+server.ts:62-77` · `access.http.db.test.ts › POST /api/mobile/auth/signup › answers the same 200 pending shape for a taken email — empty token, nothing created`
- Password sign-in is 10 / 5 min per IP+email; an unknown email still pays for a bcrypt compare against a constant dummy hash; an account without a password and a wrong password are one generic 401; `emailVerified` is never checked, so an unverified password account signs in. — `src/lib/server/services/mobileAuth.ts:299-330` · `access.http.db.test.ts › POST /api/mobile/auth/password › answers the one generic 401 for a registered account with no password` · `… › signs in an unverified password account: the app never gates on verification`
- Password verify is 10 / 15 min per IP, flips `emailVerified` only when false, and burns the code; it reads the caller's own address and ignores an `email` in the body. The orphaned-row branch is only reachable at the service seam. — `src/routes/(marketing)/signup/password/verify/+server.ts:47-79` · `src/routes/api/me/verify-email/+server.ts:17-25` · `access.http.db.test.ts › POST /api/me/verify-email › verifies the caller’s own address and burns the code` · `… › ignores an email in the body: the caller’s own address is the only one it reads` · (planned) `access.password.service.db.test.ts › burns the code of a deleted user`
- Resend is authenticated, acts only on the caller's own registered address (Anonymous Account → 401), is 5 / 15 min per user+IP and 30 / 5 min per IP, and is a success no-op once verified. — `src/routes/(marketing)/signup/password/resend/+server.ts:53-105` · `access.http.db.test.ts › POST /api/me/verify-email/resend › answers {success:true} without emailing once verified` · `… › throttles resends at 30 per 5 minutes per IP across people`

### Password reset

- Forgot-password is 5 / 15 min per address+IP, emails a 60-minute HS256 reset JWT under `/forgot-password/reset?token=`, and answers `{success:true}` for unknown addresses and Anonymous Account placeholders (#245). Its only input check is `!email`, so a value that is not an address at all (`'nope'`) is a 200 `{sent:true}` — this route keeps exactly its legacy check, and the kernel `isEmailAddress` rule answers differently, so it is not planned onto it. — `src/routes/(marketing)/forgot-password/+server.ts:47-92` · `access.http.db.test.ts › POST /api/mobile/auth/forgot › treats an Anonymous Account placeholder as unknown` · `… › answers {sent:true} for a value that is not an address at all`
- Reset requires token+password, checks the password length (≥8) **before** the token, verifies the JWT, refuses a signed token without an `email` claim with `Invalid reset token`, enforces single use with a durable `used:<sha256(token)>` row whose expiry equals the token's own `exp`, then rehashes the password and revokes **every** session and **every** `fp_` token. — `src/routes/(marketing)/forgot-password/reset/+server.ts:68-135` · `access.http.db.test.ts › POST /api/mobile/auth/reset › resets the password, kills every session and every token, and refuses the token again` · `… › checks the password length before the token` · `… › answers Invalid reset token for a signed JWT without an email claim`
- A sign-in magic link is also a valid reset token: nothing marks a token's purpose, so anyone holding a link can replace the password. Owner question Q-102, answered B — reset tokens get a purpose claim and every other token is refused; that lands after S6 with this golden changed first. — `src/routes/(marketing)/forgot-password/reset/+server.ts:88-96` · `access.http.db.test.ts › POST /api/mobile/auth/reset › accepts a sign-in magic link as a reset token (Q-102)`
- An email-change request deletes every code row for the current address, the `reset_used` marker included, so a used reset link works again until it expires. Owner question Q-103, answered B — delete only the `email_change` codes; lands after S6 with the golden changed first. — `src/lib/server/services/accountData.ts:374` · `access.http.db.test.ts › POST /api/me/email — mails a code to the NEW address and answers the message` (skipped: sends)
- Reset writes only `users.passwordHash`, never `auth_account.password`. Owner question Q-104, answered C — the column stops being a password store and is dropped at the schema cleanup; until then nothing in access's flows writes it. — `src/routes/(marketing)/forgot-password/reset/+server.ts:121-122` · `access.http.db.test.ts › POST /api/mobile/auth/reset › resets the password, kills every session and every token, and refuses the token again`
- The mobile reset wrapper adds the IP throttle the web handler lacks: 10 / 15 min per IP, keyed on nothing else. Owner question Q-066, answered B — the cap moves into the shared service after S6; one limiter only, or the burst goldens would trip early. — `src/routes/api/mobile/auth/reset/+server.ts:11-31` · `access.http.db.test.ts › POST /api/mobile/auth/reset › throttles reset attempts at 10 per 15 minutes per IP`

### Mobile (Android) sign-in

- Every mobile endpoint is cookie-free JSON; success mints a personal `fp_` token (no session, no `Set-Cookie`) and returns `{token, user}` where an Anonymous Account's placeholder email is `null`. — `src/lib/server/services/mobileAuth.ts:108-131,189-194` · `access.http.db.test.ts › POST /api/mobile/auth/verify › answers {token,user} and sets no cookie`
- Device token names are `Android — <deviceName>`, trimmed and capped at 60 chars, defaulting to `Android`. — `src/lib/server/services/mobileAuth.ts:105-111` · `access.http.db.test.ts › POST /api/mobile/auth/guest › names the token Android — <deviceName> and caps it at 60 chars`
- Mobile auth shares the web's rate-limit buckets and IP keying: email 5 / 15 min (`login-code:`), verify 10 / 15 min (`verify-<intent>-code:`), password 10 / 5 min (`pw-login:`), guest 10 / h (`mobile-guest:`). — `src/lib/server/services/mobileAuth.ts:92-96,203-227,263-271,305-311,333-344` · `access.http.db.test.ts › POST /api/mobile/auth/guest › rate-limits guest creation at 10 per hour per IP` (and a key-shape control after every other 429)
- Mobile email answers `{sent:true}` for a well-formed address whether or not the account exists; unknown logins and registered signups send nothing; the address must match the full e-mail pattern (no dot, no `@` → 400). — `src/lib/server/services/mobileAuth.ts:203-252` · `access.http.db.test.ts › POST /api/mobile/auth/email › answers {sent:true} and sends nothing for an unknown login`
- Mobile verify redeems the same hashed, type-stamped rows; signup creates the account from the code row's names (email verified, provider account, settings, personal calendar) and a now-registered address is a 409 with the code burned; login resolves a provider `accounts` row before the `users` row, and a login code with nobody behind it is a 400 that keeps its row. — `src/lib/server/services/mobileAuth.ts:255-296` · `src/lib/server/utils/createNewUser.ts:21-32` · `access.http.db.test.ts › POST /api/mobile/auth/verify › creates the account on a signup code, from the names stored with it` · `… › resolves a provider account before the user row` · `… › answers 400 and keeps the row when a login code has no account at all`
- Mobile sign-out revokes exactly the presented token, scoped to its owner; sessions and the owner's other tokens survive. — `src/lib/server/services/mobileAuth.ts:350-363` · `src/lib/server/db/actions/apiTokens.ts:64-70` · `access.http.db.test.ts › POST /api/mobile/auth/logout › revokes exactly the presented token and leaves sessions alone`
- An unexpected throw in any mobile handler becomes JSON 500 `Something went wrong — try again`, never an HTML error page. — `src/lib/server/services/mobileAuth.ts:365-372` · (planned) `access.http.server.test.ts › answers a JSON 500 on an unexpected throw`

### Claiming and guest merge

- Claim tokens are 32 random bytes as hex, only the SHA-256 stored, 15-minute TTL; previewing never burns them; ownership is `token.userId === currentUserId`; consumption is one atomic `DELETE … RETURNING`. — `src/lib/server/services/claimService.ts:6-48,108-127` · `access.http.db.test.ts › POST /api/me/claim — answers {sent:true} for a guest at a fresh address` (skipped: sends; asserts the stored hash and the TTL) · (planned) `access.claim.service.db.test.ts › previews without burning and consumes exactly once`
- Claiming attaches the email and flips `emailVerified:true`, backfilling `timeZone:'UTC'` settings only when none exist; a Claim Conflict (the address belongs to another registered account) never merges silently — the emailed click proves ownership, then the conflict merges the guest into that account and the verify POST signs into the merged target. — `src/lib/server/services/claimService.ts:129-147` · `src/routes/(calendar)/claim/verify/[token]/+server.ts:62-69` · (planned) `access.claim.service.db.test.ts › merges into the existing account on Claim Conflict`
- A Claim request is guests-only (`Account already has an email`), trims/lowercases and format-checks the address (a dot is required), throttles 10 / 15 min per IP and 3 / 15 min per address, and answers identically whether or not the address is registered (only the email copy differs). — `src/lib/server/services/claimRequest.ts:46-85` · `access.http.db.test.ts › POST /api/me/claim › refuses a non-guest with Account already has an email` · `… › POST /api/me/claim — answers 429 on the eleventh request from one IP within 15 minutes` (skipped: sends)
- The claim link is a GET that only renders a confirm page; only POST consumes the token, so scanners and prefetchers cannot claim. — `src/routes/(calendar)/claim/verify/[token]/+server.ts:27-70` · (planned) `access.claim.service.db.test.ts › renders the confirm page without consuming the token`
- Login and password-signup stash an Anonymous Account id in the `guest_merge` cookie (path `/`, httpOnly, sameSite lax, 15 min); the cookie alone never authorises a merge — the guest row must still exist and still be anonymous. — `src/lib/server/services/guestMergeService.ts:16-38,89-92` · (planned) `access.guestMerge.service.db.test.ts › ignores a cookie for a registered or deleted person`
- Guest merge is one transaction: ensure the target's personal calendar, move every guest Event (ids preserved) and Task, delete the guest's sessions, then the guest row; same-person or non-guest is a null no-op. — `src/lib/server/services/guestMergeService.ts:55-86` · (planned) `access.guestMerge.service.db.test.ts › moves events and tasks, then deletes the guest`
- Signing in from a guest session kills the guest session exactly once. — `src/lib/server/auth.ts:224-240` · (planned) `access.email.service.db.test.ts › kills the arriving guest session once`

### Email change

- Email-change verification is 10 / 15 min per IP; both the token and the code path require a `type:'email_change'` row whose `email` equals the caller's current address (identity binding) and a pending address not already in use, then apply the change and burn the code. — `src/routes/(calendar)/account/verify-email/+page.server.ts:76-166` · (planned) `access.emailChange.service.db.test.ts › rejects a code bound to another consumer`
- A change request is 3 / 15 min per user+IP, refuses an Anonymous Account with `guestNeedsClaim:true`, requires a different address that merely contains an `@` (no dot rule, no case folding — a kernel `isEmailAddress` rule would answer differently, so it is not planned onto this route), deletes every code row for the current address, and mails a 15-minute code+link to the NEW address while binding the row to the current one. — `src/lib/server/services/accountData.ts:313-390` · `access.http.db.test.ts › POST /api/me/email › refuses a guest with guestNeedsClaim` · `… › requires an address with an @, and one that differs from the current one`
- The change row stores the code in plaintext, unlike every hashed kind. Owner question Q-065, answered B — hash it at rest, no wire change; lands after S6 with the golden changed first. — `src/lib/server/services/accountData.ts:375-383` · `access.http.db.test.ts › POST /api/me/email — mails a code to the NEW address and answers the message` (skipped: sends)

### Session end

- `POST /api/logout` answers `302 /` whether or not a session exists, deleting the current session row when there is one; `locals` is cleared and no `Set-Cookie` is sent, so the dead cookie lingers in the browser. Owner question Q-105, answered B — clear it with an expired `Set-Cookie`; lands after S6 with the golden changed first. — `src/routes/api/logout/+server.ts:5-14` · `access.http.db.test.ts › POST /api/logout › answers 302 / when signed out (Q-105: no Set-Cookie)`

## Depends on

- May import: kernel + identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse, sponsored, meals, feedback (public entries only).
- Owns tables: `claimTokens`.
- Reads (join only): none.
- Calls: identity (user rows and lookups, sessions and cookies, email codes, password hashing, `fp_` tokens); calendar (`ensurePersonalCalendar` on signup and as the merge target); tasks and calendar (moving a guest's rows during a merge); family (the invite page's membership add); alerts (nothing yet — the welcome alert stays in alerts).
- Called by: marketing (the sign-in and sign-up pages), the account screen (email change), shell (sign-out), app (hooks resolve a session or `fp_` token; cron deletes stale guests), and the Android app through `/api/mobile/auth/*` and `/api/me/*`.
