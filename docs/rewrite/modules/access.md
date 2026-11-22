# Port sheet: access

**domain** · rank 15 · port #15 · home: `src/lib/domains/access/` · README after the port: `src/lib/domains/access/README.md` (written in S1)

Sign-in flows: login, signup, magic links, password reset, Claiming, Claim Conflict merge, guest merge, email change/verify, mobile (Android) auth, logout.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse, sponsored, meals, feedback.
- **Owns tables:** `claimTokens`.
- **Must be ported first:** identity, calendar (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [x] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [x] S2 `/api` goldens, green on legacy — S2 commit sha: `66a11131`
- [x] S3 contract + rules
- [x] S4 repo (+ fixtures)
- [x] S5 service
- [x] S6 http + route wiring (goldens unchanged since S2 except the Q-116/Q-117 rows)
- [x] S7 UI rebuild (rules, api, state, components, screen) + visual check
- [x] S8 rewire importers, delete legacy code and legacy tests
- [x] S9 README final, census --write, gate:push, ledger done

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- Magic links: kind-tagged JWTs (a signup link cannot log in; kind-less legacy tokens rejected); 5 per 15 min; emailed links carry the sanitised `?redirect=` (#284); redirects are path-only (no `//`, no backslash).
- Email codes hashed at rest (#162), type-stamped (#154), generic 400 (no oracle).
- Claiming: GET shows a confirm page, POST burns the token (#163); atomic consume; Claim Conflict → login-then-merge, never a silent merge.
- No account enumeration: mobile signup of an existing email → `200 {token:""}`; forgot → `{sent:true}` always (#245); password reset revokes every session and token.
- Mobile auth is cookie-free JSON `{token, user}`; device tokens named `Android — <device>`; logout revokes only the presented token; dummy bcrypt timing defence; web and mobile share rate-limit buckets.
- Signing in from a guest session kills the guest session exactly once.
- Email change: identity binding + 10 per 15 min throttle.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/logout` | POST | session cookie | none | 302 `/`; current session row deleted, `locals` cleared | none (302 `/` when no session) | `src/routes/api/logout/+server.ts:5-14` |
| `/api/me/claim` | POST | `locals.user` | `{email}`; non-string reads `''`; trimmed + lowercased | 200 `{sent:true}` — identical for a taken address | 401 `{"error":"Unauthorized"}`; 400 `{"error":"Invalid JSON"}`; 400 `{"error":"Account already has an email"}`; 400 `{"error":"Please enter a valid email address"}`; 429 `{"error":"Too many attempts. Try again shortly."}`; 500 `{"error":"Failed to send email. Please try again."}` | `src/routes/api/me/claim/+server.ts:16-27` · `src/lib/server/services/claimRequest.ts:46-85` |
| `/api/me/email` | POST | `locals.user` | `{email}`; non-string → `''`, trimmed | 200 `{success:true,message:"Verification email sent. Please check your inbox."}` | 401 Unauthorized; 400 Invalid JSON; 429 `Too many attempts. Try again shortly.`; 400 guest copy + `guestNeedsClaim:true`; 400 `Valid email is required`; 400 `New email must be different from current email`; 500 `Failed to send verification email` | `src/routes/api/me/email/+server.ts:20-41` · `src/lib/server/services/accountData.ts:313-388` |
| `/api/me/verify-email` | POST | `locals.user` | `{code}` trimmed; email taken from the caller's row, never the body | 200 `{success:true}` (web verify handler) | 401 `{"error":"Unauthorized"}` (also when the user has no email); 400 Invalid JSON; 400 `{"success":false,"error":"Unexpected error, please try again"}`; 429 `Too many attempts. Try again shortly.` | `src/routes/api/me/verify-email/+server.ts:6-27` · `src/routes/(marketing)/signup/password/verify/+server.ts:41-80` |
| `/api/me/verify-email/resend` | POST | `locals.user` | none | 200 `{success:true}`; already verified is a success no-op | 401 `{"error":"Unauthorized"}`; 429 `Too many attempts. Try again shortly.`; 500 `There was an error. Please try again.` | `src/routes/api/me/verify-email/resend/+server.ts:4-11` · `src/routes/(marketing)/signup/password/resend/+server.ts:47-105` |
| `/api/mobile/auth/email` | POST | none (cookie-free) | `{email,intent:'login'\|'signup',firstName?,lastName?}`; non-string → `''`, email trimmed; signup needs both names | 200 `{sent:true}` — same body for unknown login and already-registered signup | 400 `Request body must be JSON`; 400 `Enter a valid email`; 400 `intent must be "login" or "signup"`; 400 `First and last name are required`; 429 `Too many attempts — try again in a few minutes`; 500 `Couldn't send the email — try again` | `src/lib/server/services/mobileAuth.ts:76-90,203-252` |
| `/api/mobile/auth/verify` | POST | none | `{email,code,intent,deviceName?}`; code trimmed | 200 `{token,user}`; no Set-Cookie; `user.email:null` for an Anonymous Account | 400 `Request body must be JSON` / `Enter a valid email` / `intent must be "login" or "signup"`; 400 `That code is wrong or expired`; 409 `An account with this email already exists — sign in instead`; 429 `Too many attempts — try again in a few minutes`; 500 `Something went wrong — try again` | `src/lib/server/services/mobileAuth.ts:255-297` |
| `/api/mobile/auth/password` | POST | none | `{email,password,deviceName?}`; password not trimmed | 200 `{token,user}`; creates the settings row (`timeZone:'UTC'`) on first login | 400 `Request body must be JSON`; 400 `Email and password are required`; 429 `Too many attempts — try again in a few minutes`; 401 `Email or password is incorrect`; 500 `Something went wrong — try again` | `src/lib/server/services/mobileAuth.ts:299-331` |
| `/api/mobile/auth/guest` | POST | none | optional body; `deviceName` only | 200 `{token,user}` for a fresh Anonymous Account | 400 `Request body must be JSON`; 429 `Too many attempts — try again in a few minutes` | `src/lib/server/services/mobileAuth.ts:333-348` |
| `/api/mobile/auth/logout` | POST | `Authorization: Bearer fp_…` | none | 200 `{success:true}`; revokes exactly the presented token | 401 `Unauthorized` (no bearer, non-`fp_`, or no resolved user) | `src/lib/server/services/mobileAuth.ts:350-363` |
| `/api/mobile/auth/signup` | POST | none | `{firstName,lastName,email,password,deviceName?}`; all trimmed except password | 200 `{token,user:{…,emailVerified:false},emailVerification:'pending'}`; a taken email gets the same shape with `token:""`, `user.id:""`, nothing sent | 400 `{"error":"Invalid JSON"}`; 400 `All fields are required`; 400 `Password must be at least 8 characters`; 429 `Too many attempts. Try again shortly.`; 500 `Something went wrong — try again` | `src/routes/api/mobile/auth/signup/+server.ts:47-89` · `src/lib/server/services/passwordSignup.ts:62-102` |
| `/api/mobile/auth/forgot` | POST | none | `{email}` | 200 `{sent:true}` always (reuses the web handler) | 400 `Email is required`; 400 `Invalid JSON` for a malformed/empty body (Q-062 B); 429 `Too many attempts. Try again shortly.`; 500 `Failed to send reset email` | `src/routes/api/mobile/auth/forgot/+server.ts:11-16` |
| `/api/mobile/auth/reset` | POST | none | `{token,password}` | 200 `{success:true}` (forwards the web reset) | 400 `Invalid JSON` for a malformed/empty body (Q-062 B); 429 `Too many attempts. Try again shortly.` (per IP, 10/15 min — the cap lives in `resetPassword`, Q-066 B) then the web reset 400s | `src/routes/api/mobile/auth/reset/+server.ts:11-32` |
| `/login/email` | POST | none | `{email,redirectTo?}`; unguarded `request.json()` | 200 `{success:true,message:"If that email has an account, we've sent a login link."}` for sent **and** suppressed | 400 `Invalid email`; 429 `Too many attempts. Try again shortly.`; 500 `There was an error. Please try again.` | `src/routes/(marketing)/login/email/+server.ts:13-66` |
| `/login/email/code` | POST | optional guest session | `{code,email}`; falsy either → 400 | 200 empty body + `Set-Cookie`; code row deleted | 400 `Unexpected error, please try again`; 429 `Too many attempts. Try again shortly.`; 500 generic for every refusal, the orphaned code included (Q-064 B) | `src/routes/(marketing)/login/email/code/+server.ts:41-127` |
| `/login/password` | POST | none | `{email,password}`; unguarded `request.json()` | 200 `{success:true,user:{id,email,firstName}}` + `Set-Cookie` | 400 `Email and password are required`; 429 `Too many attempts. Try again shortly.`; 401 `Invalid email or password`; 401 `Please use email login for this account`; 500 `Failed to login` | `src/routes/(marketing)/login/password/+server.ts:13-66` |
| `/signup/email` | POST | none | `{email,firstName,lastName,redirectTo?}` | 200 `{success:true}` for sent **and** suppressed (already registered) | 400 `Invalid email`; 400 `First and last name are required`; 429 `Too many attempts. Try again shortly.`; 500 `There was an error. Please try again.` | `src/routes/(marketing)/signup/email/+server.ts:13-68` |
| `/signup/email/code` | POST | none | `{code,email}` | 200 empty body + `Set-Cookie`; user created from the code row's names | 400 `Unexpected error, please try again`; 429 `Too many attempts. Try again shortly.`; 500 generic for every refusal, the taken address included (Q-064 B) | `src/routes/(marketing)/signup/email/code/+server.ts:38-116` |
| `/signup/password` | POST | none | `{email,password,firstName,lastName}` | 201 `{success:true,user:{id,email,firstName},emailVerification:'pending'}`; a taken email gets the same 201 with `user.id:''` and no session/email | 400 `All fields are required`; 400 `Password must be at least 8 characters`; 429 `Too many attempts. Try again shortly.`; 500 `Failed to create account` | `src/routes/(marketing)/signup/password/+server.ts:53-102` · `src/lib/server/services/passwordSignup.ts:62-102` |
| `/signup/password/resend` | POST | session, registered user only | none | 200 `{success:true}`; verified user → success without emailing | 401 `Unauthorized`; 429 `Too many attempts. Try again shortly.`; 500 `There was an error. Please try again.` | `src/routes/(marketing)/signup/password/resend/+server.ts:47-105` |
| `/signup/password/verify` | POST | none | `{code,email}` | 200 `{success:true}`; flips `emailVerified`; code deleted | 400 `Unexpected error, please try again`; 429 `Too many attempts. Try again shortly.` | `src/routes/(marketing)/signup/password/verify/+server.ts:41-80` |
| `/forgot-password` | POST | none | `{email}`; strict JSON body | 200 `{success:true}` for known and unknown/Anonymous Account addresses | 400 `Email is required`; 400 `Invalid JSON` for a malformed/empty body (Q-062 B); 429 `Too many attempts. Try again shortly.`; 500 `Failed to send reset email` | `src/routes/(marketing)/forgot-password/+server.ts:34-92` |
| `/forgot-password/reset` | POST | none | `{token,password}`; strict JSON body | 200 `{success:true}`; password replaced, all sessions + all `fp_` tokens revoked | 400 `Token and password are required`; 400 `Password must be at least 8 characters`; 400 `Invalid JSON` for a malformed/empty body (Q-062 B); 400 `Invalid or expired reset token. Please request a new one.`; 400 `Invalid reset token` (also a token without the `password_reset` purpose, Q-102 B); 400 `This reset link has already been used. Please request a new one.`; 400 `Account not found`; 429 `Too many attempts. Try again shortly.` (10/15 min per IP, Q-066 B); 500 `Failed to reset password` | `src/routes/(marketing)/forgot-password/reset/+server.ts:51-135` |
| `/login/email/callback` and `/signup/email/callback` | GET | none (guest session allowed) | `?token` (JWT) | 302 + `Set-Cookie` to `/calendar` or the signed `redirectTo` | 302 `/login?error=The token provided was not valid, please try again.` (signup: `/signup?error=…`) | `src/routes/(marketing)/login/email/callback/+server.ts:39-102` · `src/routes/(marketing)/signup/email/callback/+server.ts:27-79` |
| `/claim/verify/[token]` | GET | `locals.user` | path token | 200 HTML confirm page ("can be used once and expires in 15 minutes") | 302 `/login` | `src/routes/(calendar)/claim/verify/[token]/+server.ts:27-49` |
| `/claim/verify/[token]` | POST | `locals.user` | path token | 302 `/calendar?claimed=1`; on Claim Conflict also sets the target account's session cookie | 302 `/login`; 302 `/claim?error=invalid` | `src/routes/(calendar)/claim/verify/[token]/+server.ts:51-70` · `src/lib/server/services/claimService.ts:108-149` |
### Rules the module must keep
- Magic links are HS256 JWTs signed with `EMAILSECRET`, 15-minute expiry, carrying `{kind,email,firstName,lastName,code,redirectTo?}` plus an 8-digit numeric code; `kind` is `signup` or `login` and a signup link can never be consumed as a login link. — `src/lib/server/services/magicLink.ts:190-260,364-413` · test: `src/lib/server/services/magicLink.test.ts` › "returns kind-mismatch when the token was minted for another kind"
- A token without a `kind` claim (legacy) is rejected, and a `signup` payload missing non-empty names is `invalid`. — `src/lib/server/services/magicLink.ts:383-400` · test: `src/lib/server/services/magicLink.test.ts` › "returns kind-mismatch for legacy tokens without a kind tag"
- Link issuance is limited to 5 per 15 min per scope+email (`signup-code:<email>` / `login-code:<email>`), and the gate runs before the account-existence suppression, exactly once. — `src/lib/server/services/magicLink.ts:34,120-123,287-291` · test: `src/lib/server/services/magicLink.test.ts` › "keeps the 5 attempts / 15 minutes rate limit"
- Signup suppresses silently when the email already has an account row or a user row; login suppresses when no user/account matches. — `src/lib/server/services/magicLink.ts:293-303` · test: `src/lib/server/services/magicLink.test.ts` › "[signup] suppresses silently without sending when the email is already known"
- The email is sent before the code row is written, so a failed send persists nothing; the code row stores the SHA-256 digest, a 15-minute expiry, the send's `emailId`, and a type stamp (`kind`, or `password-signup` for kind-less mints). — `src/lib/server/services/magicLink.ts:235-259` · test: `src/lib/server/services/magicLink.test.ts` › "reports send-failed and persists nothing when the email fails"
- The emailed `?redirect=` is sanitised to a same-origin path at issue time, signed into the token, and re-sanitised at the callback; unsafe values are dropped and the fallback is `/calendar/` (path-only: no `//`, no backslash, no control chars or encoded CR/LF). — `src/lib/server/services/magicLink.ts:46-57,276-279` · `src/lib/utils/safeRedirect.ts:7-19` · test: `src/lib/server/services/magicLink.test.ts` › "drops an unsafe redirectTo (%s) from the token"
- Email codes are redeemed only by `(hash(code), email, type)`: login accepts only `login` rows, signup only `signup`, password-verify only `password-signup`; unknown, expired, wrong-email and wrong-type all read as one generic 400. — `src/routes/(marketing)/login/email/code/+server.ts:77-83` · `src/lib/server/db/actions/codes.ts:31-57` · test: `src/routes/(marketing)/signup/email/code/server.test.ts` › "rejects with a generic 400 when the filtered lookup misses (unknown code, wrong email, or mismatched type)"
- Code redemption deletes dead codes first and burns the exact row afterwards (`deleteHashedCode`); the login callback also deletes every code for that email on success. — `src/routes/(marketing)/login/email/code/+server.ts:73,120` · `src/routes/(marketing)/login/email/callback/+server.ts:91`
- A magic-link callback refuses a registered signed-in user (login: error redirect; signup: straight to `/calendar`), but lets a guest session through and kills that guest session exactly once via `invalidateStaleAnonymousSession`. — `src/routes/(marketing)/login/email/callback/+server.ts:67-69,83-89` · `src/lib/server/auth.ts:229-240` · test: `src/routes/(marketing)/login/email/callback/server.test.ts` › "signs in from a guest session (#196 placeholder email) instead of erroring (#241)"
- The login callback updates `users.lastLogin`, resolves the account row first, falls back to `getUserByEmail`, then creates the session + cookie. — `src/routes/(marketing)/login/email/callback/+server.ts:73-98`
- Magic-link signup creates the user with `emailVerified:true` via `createNewUser` (user row + provider `email` account + random-colour settings + personal calendar), then sets the session cookie and lands on the redirect target. — `src/routes/(marketing)/signup/email/callback/+server.ts:60-75` · `src/lib/server/utils/createNewUser.ts:8-35` · test: `src/routes/(marketing)/signup/email/callback/server.test.ts` › "creates the user, sets the session cookie and redirects to the calendar"
- Claim tokens are 32 random bytes as hex with only the SHA-256 hash stored and a 15-minute TTL; previewing never burns them (`peekClaimToken`), ownership is `token.userId === currentUserId`, and consumption is one atomic `DELETE … RETURNING`. — `src/lib/server/services/claimService.ts:6-48` · test: `src/lib/server/services/claimService.test.ts` › "returns invalid without burning the token when owned by a different user"
- Claiming attaches the email and flips `emailVerified:true`, backfilling `timeZone:'UTC'` settings only when none exist; a Claim Conflict (email already owned by another registered account) merges the guest into that account instead of staying silent, and the verify POST then signs into the merged target. — `src/lib/server/services/claimService.ts:131-148` · `src/routes/(calendar)/claim/verify/[token]/+server.ts:62-69` · test: `src/lib/server/services/claimService.test.ts` › "merges into the existing account on Claim Conflict without claiming the email"
- A Claim request is guests-only (`400 Account already has an email`), emails are trimmed/lowercased and format-checked, throttled 10/15 min per IP and 3/15 min per email, and the response is identical whether or not the address is registered (only the email copy differs). — `src/lib/server/services/claimRequest.ts:46-85` · test: `src/routes/(calendar)/claim/page.server.test.ts` › "returns the same success shape for a taken email (no oracle) but tailors the email copy"
- The claim-link GET only renders the confirm page; only POST consumes the token, so link scanners and prefetchers cannot claim. — `src/routes/(calendar)/claim/verify/[token]/+server.ts:11-13,44-56` · test: `src/routes/(calendar)/claim/verify/[token]/server.test.ts` › "renders the confirm page without consuming the token"
- Login and password-signup endpoints stash an Anonymous Account's id in the `guest_merge` cookie (path `/`, httpOnly, sameSite lax, 15 min) so the merge prompt can fire after auth; the cookie alone never authorises a merge (the guest row must still exist and still be anonymous). — `src/lib/server/services/guestMergeService.ts:9-32,89-92` · `src/routes/(marketing)/login/password/+server.ts:14-16`
- Guest merge is one transaction: ensure the target's personal calendar, move every guest event onto it (ids preserved), move every guest task, delete the guest's sessions, then delete the guest user; same-user or non-guest is a null no-op. — `src/lib/server/services/guestMergeService.ts:55-84` · `src/routes/(calendar)/merge-guest/+page.server.ts:40-56`
- Password signup requires all four fields and ≥8 characters, throttles 30/5 min per IP and 10/5 min per email, creates an unverified (`emailVerified:false`) account, sets the session cookie, and emails the code; a send failure is logged, never fatal (still 201 pending). — `src/lib/server/services/passwordSignup.ts:62-102` · `src/routes/(marketing)/signup/password/+server.ts:75-98` · test: `src/routes/(marketing)/signup/password/server.test.ts` › "still returns 201 pending when the verification email fails to send"
- A taken email gets the identical 201 pending shape with no session, no email and `user.id:''` (no account oracle), after the same validation and throttles. — `src/routes/(marketing)/signup/password/+server.ts:70-80` · test: `src/routes/(marketing)/signup/password/server.test.ts` › "answers the same 201 pending shape for a taken email — no session, no email"
- Password login is 10/5 min per IP+email; an unknown email still pays for a bcrypt compare against a constant dummy hash, an account without a password gets `Please use email login for this account`, and wrong credentials are one generic 401. — `src/routes/(marketing)/login/password/+server.ts:25-42` · `src/routes/api/mobile/auth/password/server.test.ts` › "right password → token + user (hash never leaked), no Set-Cookie, no account created"
- Password verify is 10/15 min per IP, flips `emailVerified` only when currently false, deletes the code, and deletes the orphaned code but stays generic when the user row is gone. — `src/routes/(marketing)/signup/password/verify/+server.ts:52-79` · test: `src/routes/(marketing)/signup/password/verify/server.test.ts` › "is idempotent for an already-verified user: success without flipping"
- Resend is authenticated and only for the caller's own registered address: 5/15 min per user, 30/5 min per IP, an Anonymous Account (or gone user) is 401, an already-verified user is a success no-op, and the per-email bucket is the same `pw-signup-code:<email>` used by signup. — `src/routes/(marketing)/signup/password/resend/+server.ts:53-96` · test: `src/routes/(marketing)/signup/password/resend/server.test.ts` › "returns 401 for an Anonymous Account (placeholder email) without emailing (#241)"
- Forgot-password is 5/15 min per email, emails a 60-minute HS256 reset JWT under `/forgot-password/reset?token=`, and answers `{success:true}` for unknown addresses and Anonymous Account placeholders (no enumeration). — `src/routes/(marketing)/forgot-password/+server.ts:54-88` · test: `src/routes/(marketing)/forgot-password/server.test.ts` › "treats an Anonymous Account placeholder address as unknown (#245)"
- Reset requires token+password (≥8), verifies the JWT, and enforces single use with a durable `used:<sha256(token)>` row in `codes` (`type:'reset_used'`, expiry = token expiry); then it hashes the new password and revokes every session and every `fp_` token. — `src/routes/(marketing)/forgot-password/reset/+server.ts:75-129` · test: `src/routes/(marketing)/forgot-password/reset/server.test.ts` › "resets password with valid token and password"
- Every mobile endpoint is cookie-free JSON; success mints a personal `fp_` token (no session, no `Set-Cookie`) and returns `{token,user}` where the Anonymous Account placeholder email is null. — `src/lib/server/services/mobileAuth.ts:121-131,189-194` · test: `src/routes/api/mobile/auth/email/server.test.ts` › "login: known email → sends the web code email, 200 {sent:true}, no Set-Cookie"
- Device token names are `Android — <deviceName>`, the name trimmed and capped at 60 chars, defaulting to `Android`. — `src/lib/server/services/mobileAuth.ts:105-111` · test: `src/routes/api/mobile/auth/verify/server.test.ts` › "limits deviceName to 60 chars in the token name"
- Mobile auth shares the web rate-limit buckets and IP keying: email 5/15 min (`login-code:`/`signup-code:`), verify 10/15 min (`verify-<intent>-code:`), password 10/5 min (`pw-login:`), guest 10/h (`mobile-guest:`). — `src/lib/server/services/mobileAuth.ts:92-96,222-227,262-270,306-312,335-340` · test: `src/routes/api/mobile/auth/email/server.test.ts` › "rate-limits per IP + email at the web limit (5 / 15 min) → 429"
- Mobile email request always answers `{sent:true}` for a well-formed address (unknown login / registered signup send nothing). — `src/lib/server/services/mobileAuth.ts:232-235` · test: `src/routes/api/mobile/auth/email/server.test.ts` › "login: unknown email → identical 200 {sent:true}, nothing sent (no enumeration)"
- Mobile verify redeems the same hashed, type-stamped code rows; signup creates the account from the code row's names and a now-registered email is a 409 (code burned), login falls back from `accounts` to `users`. — `src/lib/server/services/mobileAuth.ts:272-295` · test: `src/routes/api/mobile/auth/verify/server.test.ts` › "signup for an email that got registered meanwhile → 409, nothing created"
- Mobile logout revokes exactly the presented token, scoped to its owner; sessions and the user's other tokens survive. — `src/lib/server/services/mobileAuth.ts:350-363` · `src/lib/server/db/actions/apiTokens.ts:64-70` · test: `src/routes/api/mobile/auth/logout/server.test.ts` › "revokes exactly the presented token, scoped to its owner; no Set-Cookie"
- An unexpected throw in any mobile handler becomes JSON 500 `Something went wrong — try again`, never an HTML error page. — `src/lib/server/services/mobileAuth.ts:365-372`
- Email-change verification is 10/15 min per IP; both the token path and the code path require `type:'email_change'`, a code row whose `email` equals the caller's current email (identity binding) and a pending address not already in use, then apply the change and delete the code (single use). — `src/routes/(calendar)/account/verify-email/+page.server.ts:73-175` · test: `src/routes/(calendar)/account/verify-email/page.server.test.ts` › "rejects a code whose bound consumer differs from the verifying session (code-consumer binding)"
### Page and UI behaviour worth keeping
- The shared auth shell is a `max-w-md` white card; fields render a real `<label for>`, mark `aria-invalid`, and tie the inline error to `aria-describedby="<id>-error"`; the Password/Email Link switch is a `role="group"` with `aria-pressed` and 44 px minimum tap targets. — `src/lib/components/auth/AuthCard.svelte:7-9` · `src/lib/components/auth/AuthInput.svelte:36-61` · `src/lib/components/auth/ModeToggle.svelte:16-29`
- `/login` toggles Password / Email Link; after sending it shows "Check Your Email", an 8-digit code field, and a resend control that shows "Sent again ✓" for 3 s; `?error=` (mapped codes `missing_token`/`invalid_token` get human copy) renders red, `?notice=` green, both even for a signed-in user and then cleaned from the URL. — `src/routes/(marketing)/login/+page.svelte:20-60,204-330` · `src/routes/(marketing)/login/loginMessages.ts:6-12`
- `/login?merge=1` shows the merge banner and keeps the form visible even though the guest has a session; an already-registered visitor gets "You are already logged in." plus a "Go to Calendar"/"Continue" button honouring `?redirect=`. — `src/routes/(marketing)/login/+page.svelte:168-172,240-246` · `src/routes/(marketing)/login/+page.server.ts:6-15`
- The login page links "Start planning — no account needed" with the copy "Creates a private calendar on this device. Add an email later to sync." — `src/routes/(marketing)/login/+page.svelte:380-392`
- `/signup` checks password match and ≥8 client-side, then on `emailVerification:'pending'` reuses the code screen; successful verification toasts "Email verified — welcome to Family Planz." before navigating to the redirect target. — `src/routes/(marketing)/signup/+page.svelte:45-125`
- `/forgot-password` settles on "If an account exists for <email>, we've sent a password reset link."; `/forgot-password/reset` errors immediately when `?token=` is missing, blocks mismatched/<8 passwords, then shows "Password Reset!" and redirects to `/login` after 3 s. — `src/routes/(marketing)/forgot-password/+page.svelte:54-62` · `src/routes/(marketing)/forgot-password/reset/+page.svelte:13-56,82-88`
- `/claim` says unclaimed data "stays on this device and is deleted after 90 days of inactivity", shows a green "Check <email> … expires in 15 minutes" on success, and offers "Log in with my password & merge my calendar" (`/login?merge=1`) plus "Not now — back to my calendar". — `src/routes/(calendar)/claim/+page.svelte:11-85`
- `/merge-guest` greets by first name, states the exact event/task counts, lists what moves (events, checklists, guest cleanup), has the primary "Bring my N items over" and a two-tap destructive "Start fresh without them" ("Leave them behind?"); merge redirects to `/calendar?merged=<events>&tasks=<tasks>`. — `src/routes/(calendar)/merge-guest/+page.svelte:37-158` · `src/routes/(calendar)/merge-guest/+page.server.ts:40-56`
- The claim verify link renders a standalone HTML confirm page ("This link can be used once and expires in 15 minutes", one "Confirm claim" POST button, Cancel → `/claim`). — `src/routes/(calendar)/claim/verify/[token]/+server.ts:29-42`
- `/account/verify-email` shows one "Verify Email" button when a token is present, otherwise an 8-digit code form; success shows the message plus "Your email has been updated…" and a "Go to Account" link. — `src/routes/(calendar)/account/verify-email/+page.svelte:20-93`
- The invite page asks the invitee to set a password ("Create Your Password", ≥8, matching) with a "Skip for now →" path; a new invitee lands on `/family/<id>`, an existing account is redirected to `/login?notice=Family joined. Sign in to continue.`. — `src/routes/(marketing)/family/invite/email/+page.svelte:27-84` · `src/routes/(marketing)/family/invite/email/+page.server.ts:15-24,137-188`

### Probably accidental (candidates to drop, owner to confirm)
- Both signup completion paths (`/signup/email/code`, `/signup/password`) create a new session but never call `invalidateStaleAnonymousSession`, unlike every login path — the arriving guest session row survives signup. — `src/routes/(marketing)/signup/email/code/+server.ts:96-109`, `src/routes/(marketing)/signup/password/+server.ts:83-84` vs `src/routes/(marketing)/login/email/code/+server.ts:104-110` — asymmetric cleanup.
- Seven JSON auth handlers called `await request.json()` unguarded, so malformed bodies surfaced as framework 500s instead of the house `400 {"error":"Invalid JSON"}` used by the `/api` routes. — `src/routes/(marketing)/login/email/+server.ts:22`, `login/email/code/+server.ts:61`, `login/password/+server.ts:19`, `signup/email/+server.ts:17`, `signup/email/code/+server.ts:59`, `forgot-password/+server.ts:48`, `forgot-password/reset/+server.ts:69` — inconsistent error contract; **fixed in the port** (the first five answer the house 400, `forgot`/`reset` with Q-062 B; `/login/password` and `/signup/password` keep their own 500 copy because legacy parsed inside its `try`).
- `signup/email/code` answered 500 `"Account with this email already Exists"` (also a capitalisation typo) while every other path is deliberately generic — a membership signal at code redemption. — `src/routes/(marketing)/signup/email/code/+server.ts:87-93` — contradicted the no-enumeration rule; **fixed (Q-064 B)**: the generic 500.
- `login/email/code` had a distinct 500 `"No Account found"` next to the generic `"Unexpected error, please try again"` — a differential response for an orphaned code. — `src/routes/(marketing)/login/email/code/+server.ts:96-99`; **fixed (Q-064 B)**.
- The email validator is copy-pasted three times; two more checks are weaker — forgot-password tests `!email` only and the email-change request tests `includes('@')`. — `src/lib/server/services/magicLink.ts:112-113`, `src/lib/server/services/mobileAuth.ts:102-103`, `src/lib/server/services/claimRequest.ts:57`, `src/routes/(marketing)/forgot-password/+server.ts:50`, `src/lib/server/services/accountData.ts:338` — divergent validation. The three full-pattern copies collapse into the kernel rule; the two weaker ones are wire-visible and stay route by route (Decision 2).
- `findActiveTokenForUser` has no importers. — `src/lib/server/services/claimService.ts:58-65` — dead code.
- `login/email/callback` stashes `guest_merge` *before* validating the token, so a failed/invalid login still sets a 15-minute cookie for the anonymous session (same order in the signup callback). — `src/routes/(marketing)/login/email/callback/+server.ts:43-57`, `src/routes/(marketing)/signup/email/callback/+server.ts:31-45`
- The password reset writes the single-use marker *before* hashing/updating; a failure after the marker burns the link and returns 500. — `src/routes/(marketing)/forgot-password/reset/+server.ts:114-122` — user must request a new email.
- The web `/forgot-password/reset` has no throttle of its own (only the mobile wrapper adds one), so unauthenticated reset attempts are unlimited on the web. — `src/routes/api/mobile/auth/reset/+server.ts:5-11` vs `src/routes/(marketing)/forgot-password/reset/+server.ts:51-135` — carry-over #175 covers IP caps.
- Email-change codes are stored and read in plaintext (`codes.code`), unlike the SHA-256-hashed magic-link/password codes. — `src/lib/server/services/accountData.ts:375-383` vs `src/lib/server/db/actions/codes.ts:12-16` — inconsistent at-rest protection (#162).
- Mobile signup answers HTTP 200 for a success the web answers 201; same event, two contracts. — `src/routes/api/mobile/auth/signup/+server.ts:84-88` vs `src/routes/(marketing)/signup/password/+server.ts:91-98` — client-visible drift.
- `sessionCookieFor` carries the same JSDoc block twice. — `src/lib/server/services/magicLink.ts:413-422` — dead comment.
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#175](../../archive/issues/175-auth-guessing-surface.md) Reset TTL ≤ 30 min; IP-only login cap + backoff. | SECURITY | keep behaviour; separate ticket |
| [#176](../../archive/issues/176-mfa-absent.md) MFA: waive or build. | OWNER | owner |

## Plan

### Kernel prerequisites (before S5)

Three kernel seams do not exist yet; they are planned here, not written in this module's commits.

- **Mail port (`ctx.mail`).** Follow [add-a-port.md](../playbooks/add-a-port.md) steps 1–7: `kernel/mail/mailer.ts` (the type plus a memory adapter with `outbox`), `kernel/mail/resendMailer.server.ts` (config injected, never `process.env`), `Ctx.mail`, `testCtx().mail`, the `appCtx` wiring, both adapter tests and the kernel README. This is Q-067's recorded answer: the port lands with S5 so S6 can unskip the 9 spec-goldens. The legacy seam is `src/lib/utils/sendEmail.ts` (Resend, answers `{ success, data?.id }`); the port must keep the message id, because the code row stores it as `emailId` (`magicLink.ts:253`).
- **`AppConfig` fields** for `EMAILSECRET`, the site base URL and the from-address. Today `src/lib/kernel/ctx.server.ts:37-40` carries `cronSecret` only, while the legacy reads `EMAILSECRET`, `NOREPLYEMAIL` and `getUrl()` at module scope (`magicLink.ts:86-98`). R6 forbids `$env` inside the module, so S5 cannot mint or verify a JWT without them.
- **A random source.** `Ids` (`src/lib/kernel/ids/ids.ts:21-34`) yields `[a-z0-9]` ids only; the 8-digit code (`magicLink.ts:205`) and the 32-byte Claim token (`claimService.ts:13`) need raw bytes. Add `ids.random(bytes) → Uint8Array` (or a `Random` port) to `ctx`, seeded deterministically in tests.

### Files by role

| file | role | what goes in it |
|---|---|---|
| `index.ts` | entry | Re-exports the contract types, `authApi` and `authRedirectTarget`. |
| `index.server.ts` | entry | Re-exports the 13 `/api` endpoint handlers, the 2 page-group code endpoints and the page handlers — the things the rewritten route files import. The 16-odd services stay module-internal: no other module calls one (every caller is a route or a page this module owns), so exporting them would freeze signatures nobody depends on. |
| `access.contract.ts` | contract | Zod schemas for every `/api` request/response in this module (mobile bodies, `{email}`, `{code}`, `{token,password}`) plus the exact legacy error copy as constants; internal page/action inputs designed fresh. |
| `access.email.rules.ts` | rules | Magic-link payload shape (kind/email/names/code/redirect), `code`/`email` pairing, the 15-minute TTL and the 8-digit shape; pure, and every TTL rule takes `now` as a parameter (never `Date.now()`). |
| `access.redirect.rules.ts` | rules | `authRedirectTarget`: path-only same-origin landing (`safeRedirectPath` logic), fallbacks `/calendar/` and `/calendar`. |
| `access.password.rules.ts` | rules | Signup/password validation (four required fields, at least 8 characters), the reset form's order (both fields, then the length) and the `used:<hash>` single-use marker key. No email rule here: each route keeps exactly its own legacy check (Decision 2 in Notes). The `mobileTokenName` rule lives in `access.device.rules.ts`, not here (the sheet's first draft said "token name", meaning the reset marker). |
| `access.password.rules.test.ts` | rules test | Tables of input → message/valid. |
| `access.device.rules.ts` | rules | `mobileTokenName` (`Android — <deviceName>`, trimmed, 60-char cap, `Android` default) and the `toMobileUser` mask. |
| `access.device.rules.test.ts` | rules test | Device-name tables (empty, padded, 60/61/70 chars) and the guest email mask. |
| `access.claim.rules.ts` | rules | Claim-token shape (32 random bytes hex, 15-minute TTL — `now` passed in), the guests-only rule and the uniform answer. |
| `access.claim.rules.test.ts` | rules test | Token/email validation and the no-oracle answer. |
| `access.person.rules.ts` | rules | The Anonymous Account predicate access branches on (`isGuestPerson`, `isRegisteredPerson`, `maskGuestEmail`). Interim: identity owns the canonical predicate but its `index.ts` exports nothing yet, so S5 must switch these call sites to identity and delete this file. |
| `access.person.rules.test.ts` | rules test | The placeholder-domain table and the guest-safe mask (from `src/lib/utils/anonymous.test.ts:5-21`). |
| `access.contract.test.ts` | contract test | Every request schema's coercion/refusal order, the response shapes and the exact legacy copy table. |
| `access.email.rules.test.ts`, `access.redirect.rules.test.ts` | rules test | Kind-mismatch/legacy-token tables and the unsafe-redirect table (from the legacy `magicLink` unit tests). |
| `access.repo.server.ts` | repo | Claim-token queries only (access owns `claimTokens`): insert, peek by hash, atomic `DELETE … RETURNING`, delete expired. |
| `access.fixtures.server.ts` | fixtures | Written in the S2 fix-forward. `seedAccessGuest`, `seedAccessPasswordUser`, `seedAccessApiToken`, `seedAccessEmailCode` (hashed kinds, `expiresAt` overridable), `seedAccessProviderAccount`, `seedAccessSession`, plus `ACCESS_ANON_DOMAIN` and `ACCESS_PASSWORD_HASH`. S4 added `seedAccessClaimToken(db, …)` — the one builder that takes `db`, because it seeds this module's own table inside `rollbackTest`. `seedAccessAuthAccount` went with Q-104 C (no flow treats `auth_account.password` as a password store). Every name carries the `Access` noun: the module seeds foreign rows (user, provider account, session), the `seedTaskFamily` precedent. |
| `access.repo.db.test.ts` | repo test | A `rollbackTest` per query and edge: insert stamps the caller's `createdAt`; peek does not burn and refuses an expired row (the exact-`now` boundary is live); consume is exactly once and still deletes an expired row; retention removes `< now` and counts. |
| `access.email.service.server.ts` | service | `startEmailLink` (validation → gate and suppression → mint → email → code row), `completeEmailLink`, `verifySignupCode`, `resendSignupCode`. |
| `access.password.service.server.ts` | service | `signInWithPassword` (dummy-compare defence, generic 401, shared by web and Android), `signUpWithPassword`, `requestPasswordReset`, `resetPassword` (single-use marker, revoke sessions + tokens). |
| `access.claim.service.server.ts` | service | `requestClaim` (guests only, 10/15 per IP + 3/15 per address, uniform answer) and `confirmClaim` (peek → ownership → atomic consume → claim or Claim Conflict merge). |
| `access.guestMerge.service.server.ts` | service | `mergeGuest` in one `withTx`: personal calendar via calendar's entry, move Events (ids preserved) and Tasks via tasks' entry, delete sessions, delete the guest; same-person/non-guest is a no-op. |
| `access.emailChange.service.server.ts` | service | `requestEmailChange` (3/15 per person, guest refusal, code+link to the NEW address, identity-bound row) and `verifyEmailChange` (token or code path, 10/15 per IP). |
| `access.session.service.server.ts` | service | `signOut` (cookie session or exactly the presented `fp_` token) and `createGuestAccount`. |
| `access.email.service.db.test.ts` | service test | Send-before-persist, suppression, guest-session kill, signup creation. |
| `access.claim.service.db.test.ts` | service test | Preview without burn, atomic consume, Claim Conflict merge, verify POST signs into the merged target. |
| `access.password.service.db.test.ts` | service test | The dummy-compare defence (an unknown address and a password-less account each pay one compare), the one generic refusal, the single-use reset marker (written after the update, expiry = token expiry), revoking sessions and tokens, and the orphaned-row branch the HTTP route cannot reach (a `password-signup` code whose user row is gone). |
| `access.session.service.db.test.ts` | service test | `signOut`: deletes exactly the current session row and returns no cookie to set; revokes exactly the presented `fp_` token and no other. `createGuestAccount`: the user, its settings row and its token, with the placeholder email never leaving. |
| `access.emailChange.service.db.test.ts` | service test | Identity binding, single use, pending address in use. |
| `access.guestMerge.service.db.test.ts` | service test | Merge transaction, cookie-not-enough, no-op cases. |
| `access.http.server.ts` | http | All 13 `/api` endpoints (`endpoint()`), byte-for-byte the goldens: the eight `/api/mobile/auth/*` plus `/api/logout` and the four `/api/me/*`. |
| `access.http.db.test.ts` | test | This slice's goldens: the 13 `/api` routes plus the two page-group code JSON endpoints (Q-064), unchanged after S6 except for removing `.skip` from the 9 spec-goldens. Every test builds one ctx and passes it to every request, refusals and control requests included, and case tables are typed `it.each` rows so a failure names its case. |
| `access.http.server.test.ts` | http test | The throw→JSON-500 guard and the wiring-only route contract. |
| `access.pages.http.server.ts` | http | `pageLoad`/`formAction` for `/login`, `/signup`, `/forgot-password(+/reset)`, `/claim`, `/account/verify-email`, `/merge-guest` and the email-link callbacks. `/family/invite/email` is **family's** port: it only reuses the auth shell and identity's session. |
| `access.pages.http.db.test.ts` | http test | The page flows' observable results (redirect targets, form failures, the code row each flow writes). |
| `access.api.ts` | api | `authApi`: the browser calls the auth pages make (`requestLoginLink`, `submitLoginCode`, `signInWithPassword`, `requestSignupCode`, `submitSignupCode`, `signUpWithPassword`, `resendVerification`, `requestPasswordReset`, `resetPassword`). |
| `access.login.state.svelte.ts` | state | The `/login` and `/signup` code-screen state (mode, sent, error, resend countdown, redirect target). |
| `ui/AuthCard.svelte`, `ui/AuthInput.svelte`, `ui/ModeToggle.svelte` (+ `.svelte.test.ts`) | ui | The shared auth shell, the labelled input with `aria-invalid`/`aria-describedby`, the Password / Email Link group. |

### Where the legacy exports go

| legacy file | destination |
|---|---|
| `services/magicLink.ts` — `issueMagicLink`, `issueVerificationCode`, `consumeMagicLink`, `sendClaimLinkEmail`, `magicLinkRedirectPath` | `access.email.service.server.ts` (+ `access.email.rules.ts`); the JWT mint/verify and the send go through `ctx` ports (no `$env` in the module, R6). |
| `services/magicLink.ts` — `sessionCookieFor`, `magicLinkDeps.session` | identity's session service (identity owns sessions); access calls it. |
| `services/mobileAuth.ts` — `mobileEmail`, `mobileVerify`, `mobilePassword`, `mobileGuest`, `mobileLogout`, `guarded` | `access.http.server.ts` (thin) over `access.email`/`access.password`/`access.session` services; `guarded` becomes `endpoint()`'s 500 + fault filing. |
| `services/mobileAuth.ts` — `mobileTokenName`, `toMobileUser`, `MOBILE_ERRORS`, limits | `access.device.rules.ts` and `access.contract.ts` (the copy is the wire). |
| `services/passwordSignup.ts` | `access.password.service.server.ts`; `PASSWORD_VERIFY_CALLBACK_PATH` becomes a contract constant. |
| `services/claimService.ts` — token functions | `access.repo.server.ts` + `access.claim.rules.ts`; `verifyClaimToken` → `confirmClaim`. `findActiveTokenForUser` dies (no importers). |
| `services/claimRequest.ts` | `access.claim.service.server.ts`. |
| `services/guestMergeService.ts` | `access.guestMerge.service.server.ts` (cookie stash moves into the sign-in flows, after success). |
| `services/accountData.ts` — `requestEmailChange` + `UpdateEmailDeps` | `access.emailChange.service.server.ts`; the rest of `accountData` stays with the account screen/identity. **Done in S6 (security review finding 1):** `/account?/updateEmail` is wired to `changeEmailAction` (`access.pages.http.server.ts`, exported through `index.server.ts`), which calls the access service, so the code row is HMAC-keyed and the verify page can redeem it; the legacy `requestEmailChange`, `UpdateEmailDeps`, `defaultUpdateEmailDeps` and their two legacy route tests have been deleted. The action keeps legacy's bodies: `{success:false,message}` (+`guestNeedsClaim`), 429 `Too many attempts. Try again shortly.`, 500 `Failed to send verification email`. |
| `utils/createNewUser.ts` | identity (user + provider account + settings); the personal-calendar call is composed in `access.password.service.server.ts` through calendar's entry. |
| `components/auth/{AuthCard,AuthInput,ModeToggle}.svelte` | `ui/`, rebuilt on kernel/ui primitives. |

## Notes

### Verified, corrected inventory

Every wire line below was re-read against the legacy code on 2026-11-11.

- `/api/mobile/auth/signup` for a taken address answers **200** with `{token:"", user:{id:"",…}, emailVerification:"pending"}` (`src/routes/api/mobile/auth/signup/+server.ts:62-77`). `docs/guides/task-api-spec.md:711` still lists `400 "An account with this email already exists"`; the sheet's API table and the golden are right, the spec line is stale. The port must keep 200. Careful with the wording: it is not a full account oracle — nothing says whether anyone can sign in — but `token:""` and `user.id:""` are exactly how an app sees that the address is taken, so the response hides the password, not the membership.
- `/api/me/verify-email` 429 body carries `success:false` (`src/routes/(marketing)/signup/password/verify/+server.ts:47-52`), unlike the bare `{error}` the sheet's error column implies. Pinned by the golden.
- `/api/mobile/auth/forgot` with a malformed or empty body answered **500** `Failed to send reset email` before Q-062's fix (the web handler's unguarded `request.json()` threw inside its own `try`); **Q-062 B landed**: both doors answer the house `400 {"error":"Invalid JSON"}` (`bodyMode: 'strict'`).
- `/api/mobile/auth/reset` answered **500** `Failed to reset password` for the same reason before the fix; **Q-062 B landed** — `400 {"error":"Invalid JSON"}`, on the web form too.
- The mobile routes: a **non-string but truthy** `email` (e.g. `123`) throws in `.toLowerCase()` and lands in the same 500 (`forgot`). Not pinned: it is a defect, and pinning it would bless the TypeError.
- `/api/logout`'s "delete the session row and clear `locals`" half cannot be driven through `invoke` — the harness pins `locals.session` to `null` — so the golden pins the signed-out 302 only; the S5 service test pins the deletion.
- `/api/me/claim`'s rate limits cannot be reached without sending real emails: the per-address allowance is 3, so the fourth request both fills and trips it, and the per-IP allowance (10) needs ten addresses. Both 429 cases are skipped spec-goldens (`claimRequest.ts:63,66`), each with a control request that pins the key shape.
- The 9 spec-goldens at the bottom of `access.http.db.test.ts` (claim fresh address, claim registered address, claim per-address 429, claim per-IP 429, me/email success, resend send, mobile email login + fresh signup, mobile signup create, forgot send) were `it.skip` while the legacy handlers sent through the module-scope Resend client. **Q-067 landed**: the ported handlers take `ctx.mail`, so all nine run (the email-change one reads its code from the outbox and asserts the keyed digest, Q-065). The claim row's TTL window is the *request's*, not one millisecond of the test's: it asserts `before + 15 min <= expiresAt <= after + 15 min` (`after` read once the response arrives), because the handler's own clock read sits between the two and a spec row must not race it.
- Every budget golden pins its key shape, not just the 429: after the refusal it sends a control from a new IP and one from a new address (or person), and pins both answers. `/api/me/verify-email` and the reset service (both doors, Q-066) are IP-only, so their "new address on the same IP" control is the *same* 429 — that is the pin.
- Masked-by-construction branch: `/api/me/verify-email` forwards the caller's own address (`src/routes/api/me/verify-email/+server.ts:17-25`), so the web verify's "code whose user row is gone" branch (`signup/password/verify/+server.ts:68-72`) cannot be reached from HTTP; the golden pins the reachable half (a code for another address is refused and its row survives) and that branch moves to `access.password.service.db.test.ts`.
- Owner accidents were pinned on purpose until their fix landed, ids in the test comments: Q-102 a sign-in magic link reset a password; Q-103 an email-change request deleted the `reset_used` marker; Q-104 reset left `auth_account.password` stale; Q-105 `/api/logout` sent no `Set-Cookie`. **All four answers landed** (B, B, C, B): the reset reader requires the `password_reset` purpose claim, the change request deletes only `email_change` codes, no flow writes the credential column (and its golden assertion and fixture are gone), and logout answers a 302 that carries identity's expired `Set-Cookie`.
- Two page-group JSON endpoints have goldens too (`POST /signup/email/code`, `POST /login/email/code`), because Q-064's flip must be observable: they are the only non-`/api` goldens in this file, and they are JSON fetches, not page loads or form actions.
- `POST /api/mobile/auth/verify` login looks up `accounts` first (`src/lib/server/db/schema.ts:197`, via `getAccount`) and falls back to `users` (`src/lib/server/services/mobileAuth.ts:291-295`); a person with only a `users` row signs in. Pinned.

### Probably accidental, and what happens to it

- **Wire-visible accidents, all answered and landed:** the mobile/forgot and mobile/reset 500-on-malformed-JSON became the house 400 (Q-062 B); the `signup/email/code` 500 "Account with this email already Exists" and `login/email/code` 500 "No Account found" membership/state signals became the generic 500 (Q-064 B); the 200-vs-201 drift between mobile and web signup is kept (Q-063 A).
- **Internal, dropped (reasons):** `findActiveTokenForUser` has no importers → dies; the duplicated `sessionCookieFor` JSDoc → dies with the file; the three copy-pasted full-pattern email validators (`magicLink.ts:112-113`, `mobileAuth.ts:102-103`, `claimRequest.ts:57`) → kernel `isEmailAddress` (`src/lib/kernel/validation/validators.ts:62-66`), which answers exactly as they do; the `guest_merge` cookie stored *before* the token is validated → stashed after success; the reset single-use marker written before hashing → written after the password update so a failed hash cannot burn the link (wire unchanged: still 500).
- **Decision 2 — the two weaker legacy checks stay, route by route.** No access-local `emailAddress` rule: forgot-password keeps `!email` only (`forgot-password/+server.ts:50`, so `{email:'nope'}` is a 200 `{sent:true}` — pinned) and the email-change request keeps `!email || !email.includes('@')` (`accountData.ts:338`, no dot rule, case-sensitive compare — pinned). The kernel `isEmailAddress` answers differently on both, so it is not planned onto them; the difference is written into the README's invariants.
- **The failed-signup mail logs the address in legacy** (`passwordSignup.ts:124,127`: `Verification email not sent for ${who.email}`). The port logs the event and the reason without the address — a log line is not part of the wire, and the address is personal data. Say so in the S5 commit.
- **Email-change codes are hashed at rest from S5 on.** `issueEmailCode` stores `HMAC-SHA-256(EMAILSECRET pepper, code)` for every kind (Q-116/Q-117), so the change row's code is a digest and `/account/verify-email` redeems by digest. Q-065 B landed with the spec-golden's activation: it reads the mailed code from `ctx.mail.outbox` and asserts `HMAC-SHA-256(EMAILSECRET, code)`, never the plaintext.

### Questions for the owner

1. **Malformed JSON on the web-forwarded routes.** (Q-062) Context: `forgot` and `reset` answer 500 (not the house 400 `Invalid JSON`) because they forward to the web handlers, which parse unguarded. Options: keep 500 for these two (golden as-is), or return the house 400 like the `/api/me/*` routes and change the goldens with a `fix-in-port` commit. Recommendation: fix in port, ticket it — the Android client already treats `{"error"}` uniformly and a 500 pollutes the fault register.
2. **Mobile signup 200 vs web signup 201.** (Q-063) Same event, two statuses. Options: keep both (golden pins 200), or align the web to 200 behind an answered question. Recommendation: keep 200 for the app (it is installed and expects it), align the web page's response only if a client needs it — no change in this port.
3. **The two membership signals on the page-code routes** (`signup/email/code` → 500 "Account with this email already Exists", `login/email/code` → 500 "No Account found"). They leak account state on the wire. (Q-064) Options: leave (page-only, no installed client), or make both the generic 500 `Unexpected error, please try again`. Recommendation: make both generic in the port. **Answer (owner): B** — both answer the generic copy. Both are now goldens (they are JSON fetches, not page routes), so the change is visible: it lands after S6 as a `fix(access)` commit that edits those two expectations first.
4. **Email-change codes in plaintext (#162).** (Q-065) Options: leave until #162's ticket, or hash on write now (the codes are internal to the flow and burned on use). Recommendation: hash now; no wire change. **Answer (owner): B** — hashed at rest, after S6, with the skipped golden's plaintext assertion changed first.
5. **Carry-over #175:** the web `/forgot-password/reset` has no throttle of its own (only the mobile wrapper adds 10/15 per IP). (Q-066) Options: port as-is with the wrapper throttle, or move the throttle into the shared service. Recommendation: move it into the service when porting; the mobile golden's 429 stays valid and the web form gains the cap. **Answer (owner): B.** One limiter, not two: if the wrapper's limiter stays and the service also counts, the bucket fills twice as fast and the golden's "10 × 400" burst turns 429 early — the wrapper's copy goes when the service's arrives.
6. **Spec-golden activation (S6).** (Q-067) These 9 tests cannot run until the ported handler takes its email sender from `ctx` (there is no kernel email port yet). Recommendation: add the port in this module's S5 (a `ctx.mail` port in kernel, per add-a-port.md) so S6 unskips them rather than deferring again.

### Decided owner fixes (landed)

The owner answered seven of the questions the S1+S2 review raised, plus Q-062 and Q-065. **All of them landed**, each in its own `fix(access)` step that changed the golden row first and names the question id; Q-067's activation (the nine `.skip`s) landed with them. The rows below keep their answers; the "golden it edits" column now names the row as it reads after the flip.

| question | decision | the change | the golden it edits |
|---|---|---|---|
| Q-102 | **B** | Reset tokens carry a purpose claim (`purpose: 'password_reset'`); the reset reader refuses every other `EMAILSECRET` JWT, so a sign-in link can no longer set a password (`reset/+server.ts:88-96`). Landed: `RESET_TOKEN_PURPOSE` in `access.email.rules.ts`, minted by `requestPasswordReset`, required by `readResetTokenPayload`. | `POST /api/mobile/auth/reset › refuses a sign-in magic link as a reset token (Q-102)` — 400 `Invalid reset token`, password untouched. |
| Q-103 | **B** | An email-change request deletes only its own `email_change` codes, so the `reset_used` marker survives (`accountData.ts:374`). Landed: `discardEmailCodes(ctx, email, type?)` over identity's `deleteEmailCodesForEmail(db, email, type?)`, plus a `rollbackTest` for the scoped delete in identity. | `POST /api/me/email — mails a code to the NEW address and answers the message` keeps the marker row beside the `email_change` one. |
| Q-104 | **C** | `auth_account.password` stops being a password store: no access flow writes it (legacy reset writes `users.passwordHash` only), and the column is dropped at the next schema cleanup. Landed: the golden's credential assertion and the now-dead `seedAccessAuthAccount` fixture are gone; nothing in access reads or writes the column. | `POST /api/mobile/auth/reset › resets the password, kills every session and every token, and refuses the token again` drops the credential-row assertion. |
| Q-105 | **B** | `/api/logout` clears the session cookie with an expired `Set-Cookie` instead of leaving it in the browser (`src/routes/api/logout/+server.ts:5-13`). Landed: the endpoint answers a plain 302 carrying `sessionCookieHeader(blankSessionCookie(ctx))`. | `POST /api/logout › answers 302 / and clears the session cookie (Q-105)` pins the whole header. |
| Q-064 | **B** | Both page-code endpoints answer the generic `Unexpected error, please try again` instead of the membership signals (`signup/email/code/+server.ts:87-95`, `login/email/code/+server.ts:94-100`). Landed: `PAGE_SIGNUP_TAKEN_MESSAGE`/`PAGE_LOGIN_ORPHAN_MESSAGE` are deleted and both branches answer `VERIFY_GENERIC_ERROR_MESSAGE`. | The two page-JSON goldens change their 500 body; the signup one also pins that the code row is still burned. |
| Q-065 | **B** | Email-change codes are hashed at rest and looked up by digest like every other kind (`accountData.ts:375-383`, `account/verify-email/+page.server.ts:111,135`). Landed: `issueEmailCode` already stored the digest, so only the activated golden's assertion changed — it reads the mailed code and compares `HMAC-SHA-256(EMAILSECRET, code)`. | `POST /api/me/email — mails a code to the NEW address and answers the message` swaps its plaintext assertion for the digest. |
| Q-066 | **B** | The 10 / 15 min reset throttle moves from the mobile wrapper into the shared service, so the web form gains it too (`api/mobile/auth/reset/+server.ts:11-31`). Landed: `RESET_ATTEMPT_LIMIT`/`WINDOW_MS`/`SCOPE` in `access.recovery.service.server.ts`, enforced first in `resetPassword`; both endpoints pass `clientKeyOf(request, RESET_ATTEMPT_SCOPE)` and the endpoint-level `rateLimit` is gone. | None: the mobile 429 golden keeps its limit, message and burst. Exactly one limiter — the wrapper's copy went, so the burst is not counted twice. |

### A refused mail send does not fail an email change (e2e, 2026-11-21)

Legacy sent through the Resend SDK, which returns `{ error }` instead of throwing, and
`requestEmailChange` never read it: the code row was written and the request answered
`Verification email sent…` even when the provider refused. The port's `Mailer` rejects on a refusal
(`kernel/mail/resendMailer.server.ts`), which made the flow answer the legacy 500 and drop the row.
`requestEmailChange` now keeps the send inside its own `try`/`catch`, so the legacy observable answer
survives; the 500 `Failed to send verification email` stays for a fault of our own (the signed token,
the write). Making the adapter swallow refusals for every module is a kernel decision, not access's.

### S3/S4 decisions (landed with the port)

- **The Anonymous Account predicate is duplicated for one step.** identity owns
  `isAnonymousAccount` / `isRegisteredAccount` (`identity.person.rules.ts:18-42`)
  and its README lists them on `index.ts`, but that entry is still `export {}`.
  R2 forbids importing another module's rules file, so access's S3 carries
  `access.person.rules.ts` (`isGuestPerson`, `isRegisteredPerson`,
  `maskGuestEmail`). **S5 must switch the call sites to identity's entry and
  delete the file**; it is the only cross-module duplication in this slice.
- **`access.password.rules.ts` holds the reset marker, not the device name.**
  The plan row's "token name rule" is `used:<sha256(token)>`
  (`reset/+server.ts:101`); `mobileTokenName` is `access.device.rules.ts`'s.
- **`MobileAuthUserResponse` / `ClaimTokenOwner` are server view types in the
  contract,** so `access.device.rules.ts` can return the wire user shape without
  a second definition and the repo can answer `{userId,email}` without a row type.
- **The `seedAccessClaimToken` fixture takes `db`.** Every other access fixture
  writes through `testDb()` because the S2 goldens run committed; a Claim seed
  used by a `rollbackTest` would land outside the transaction. The file says so
  in place.
- **Q-104 C landed.** The repo and rules never read or write `authAccount.password`;
  the reset golden's stale-credential assertion and the `seedAccessAuthAccount`
  fixture are gone, and the reset service writes only `users.passwordHash` (via
  identity's `setPersonPasswordHash`), so the column drops at the schema cleanup
  without an access change.
- **S6 needs three body details the schemas cannot express alone.** `endpoint()`'s
  `json` mode answers the house `Invalid JSON` and maps an empty body to `{}`;
  `lenient` maps an empty body AND a literal `null` to `null`. The frozen goldens
  need: `mobile/auth/guest` empty body → 200 but literal `null` → 400;
  `mobile/auth/forgot`/`reset` malformed (and empty) body → their 500 copy;
  every other mobile route malformed → `Request body must be JSON`. The contract
  documents this and owns the copy; the mapping is S6's.
- **One unpinned legacy defect is not reproduced.** `forgot-password/+server.ts`
  calls `email.toLowerCase()` on the raw body value, so a truthy non-string
  (`{email:123}`) throws and lands in its 500. The sheet already lists that as a
  defect and does not pin it; the contract reads a non-string as `''`, so the
  port answers `400 Email is required`. Wire-identical for every JSON string,
  and no golden covers the numeric case — flagging it rather than blessing the
  TypeError.
- **The seven post-S6 owner fixes have all landed.** Q-102 mints and requires the
  `password_reset` purpose claim; Q-103 deletes only `email_change` codes
  (`discardEmailCodes(ctx, email, type?)`, backed by identity's scoped
  `deleteEmailCodesForEmail` and its own `rollbackTest`); Q-064's two membership
  sentences and their constants are gone (both answer
  `VERIFY_GENERIC_ERROR_MESSAGE`); Q-065's digest is what the activated golden
  asserts; Q-066's limiter lives in `resetPassword`. Each changed its golden row
  first.
- **Identity calls at S5.** This slice needs no `FOREIGN_READS` entry: the repo
  touches only `claimTokens`. S5 will need identity's services (person by
  email/id, session create/invalidate, `fp_` token mint/revoke, email-code
  insert/find/delete, password hashing, `setPersonPasswordHash`,
  `claimPersonEmail`, `deleteEmailCodesForEmail`) through `identity/index.server.ts`,
  which today exports only the two ports and `IdentityCtx`; those service
  functions must be added there by identity's S5 before access's S5 can compile.

### S6 decisions (landed with the wire)

- **Two http files, not one per topic.** `access.http.server.ts` holds every
  `/api` handler plus the page-group JSON endpoints (its test is the frozen
  `access.http.db.test.ts`); `access.pages.http.server.ts` holds the loads,
  form actions and callbacks (`access.pages.http.db.test.ts`). Every route file
  is now wiring-only; the 25 obsolete legacy route tests and their `fakes.ts`
  helper were deleted.
- **One `signOut` home.** `signOutSession`/`signOutMobile` were deleted;
  `access.account.service.server.ts`'s `signOut(ctx, actor, {sessionId?, token?})`
  serves both doors and refuses a non-`fp_` bearer (the mobile golden's 401).
- **`goldenCtx` carries the golden pepper.** `GOLDEN_CODE_PEPPER`
  (`kernel/testing`) resolves `process.env.EMAILSECRET` with the committed test
  fallback; `goldenCtx` passes it as `config.codePepper` and
  `seedAccessEmailCode` hashes with the same value (Q-116/Q-117). The frozen
  golden's only edits are that fixture and the reset marker comparison.
- **`AppConfig.siteUrl`** carries the legacy `getUrl()` answer (dev/test/prod);
  the mailed links build their absolute URLs from it, and the routes pass it to
  every service that mails.
- **A fourth body mode, `'empty-object'`,** in `endpoint()`: an empty body reads
  `{}` while a malformed or non-object body reaches the schema as `null`. The
  guest door needs exactly that (empty → 200, junk → its own sentence); the
  other mobile doors use `'lenient'` (empty and junk both refused with the
  mobile sentence).
- **Malformed bodies on the web-forwarded page/JSON routes.** Q-062 B landed:
  `forgot` and `reset` run `bodyMode: 'strict'` with the house
  `400 {"error":"Invalid JSON"}` on both doors, so the legacy 500 copy is gone.
  The routes without a golden (`/login/*`, `/signup/*`) already answered the
  house 400; `/login/password` and `/signup/password` keep their own 500 copy
  because legacy parsed inside its `try`.
- **The 9 spec-goldens run (Q-067 landed).** The `.skip`s are gone and the
  email-change send golden asserts the keyed digest, reading the mailed code from
  `ctx.mail.outbox` (Q-065).
- **`/family/invite/email` is not access's.** The module README and this sheet
  both assign it to family (`acceptInvite` is family's); it stays legacy here.
- **`ensurePersonalCalendar` landed.** calendar exports it (and the merge
  prompt's `countGuestEvents`/`countGuestTasks`); the four signup call sites use
  it instead of the `listCalendars` fallback.
- **`/login/password` is allow-listed in auth-audit.** The audit reads the legacy
  route's `locals.user` (the guest-session swap) as a user level; the door never
  required a session and the v2 handler performs the same swap through the
  optional actor, so `auth-audit-allow.json` carries the reason rather than a
  cosmetic check.
- **`invoke` gained a `cookies` option** (`kernel/testing`) so the page tests can
  drive the `guest_merge` stash; nothing in production reads it.

### Still unpinned until S5 (service tests on the fake mail port)

- The four send-failure 500s: mobile email `Couldn't send the email — try again` (`mobileAuth.ts:244-245`), `/api/me/email` `Failed to send verification email` (`accountData.ts:386-389`), resend `There was an error. Please try again.` (`signup/password/resend/+server.ts:99-102`), and forgot's send failure, whose copy is the same as its malformed-body 500 (`forgot-password/+server.ts:89-91`).
- The shared `pw-signup-code:<email>` 5 / 15 min gate that signup and resend both feed (`magicLink.ts:126-128`), and the claim per-address bucket's interaction with the per-IP one at their edges: reaching either from HTTP needs a real send.
- The magic-link callback flows (kind mismatch, guest-session kill, redirect landing), the reset marker being written after the password update, and Claim-token consumption with the Claim Conflict merge — all S5 service tests, all on `ctx.mail.outbox`.

### Files kept for unported importers

Seven of the ten legacy source files were deleted in S8, with all four legacy tests except the invite page's:

- deleted: `components/auth/{AuthCard,AuthInput,ModeToggle}.svelte`, `services/{claimRequest,magicLink,mobileAuth,passwordSignup}.ts`, and the tests `services/{claimService,magicLink}.test.ts` + `/login/page.svelte.test.ts` (the legacy behaviour is re-pinned by the module's rules/state/ui/golden tests).
- kept: `services/guestMergeService.ts` (the unported `/calendar` page reads `GUEST_MERGE_COOKIE` + `isClaimableGuest`), `utils/createNewUser.ts` (family's unported `/family/invite/email` page and its legacy test), `services/claimService.ts` (the app-owned cleanup cron still calls `deleteExpiredClaimTokens`; APP-01 removes it), and the family invite page + its `page.server.test.ts`. `npm run census -- access` shows those three source files and the two family-owned routes; each names its owner in the README's "Kept for unported importers".

### S7 decisions (landed)

- **One copy source.** Every string the auth pages show lives in `access.auth.rules.ts`; the screens hold markup only, with the two fragments that wrap a link ("Don't have an account? … Sign up or start planning") left inline in the markup as the legacy page had them.
- **One code screen, two doors.** `EmailCodeSection.svelte` is the single "Check Your Email" body; `label` set renders the login page's labelled field, unset the signup page's plain centred input, so both pages keep their approved look without two components.
- **State classes, not fat screens.** `LoginState`, `SignupState`, `ForgotPasswordState`, `ResetPasswordState` own the calls, pending flags, the 3-second beats (injected kernel scheduler) and the legacy network-fallback copy (`status === 0` keeps `Failed to login`, `Failed to create account`, … instead of the kernel client's generic sentence). `/claim`, `/merge-guest` and `/account/verify-email` post page actions through `enhance`, so they keep only the submit flags in the screen.
- **The URL is the route's business.** `?error=`/`?notice=` are read and cleaned in `login/+page.svelte` and passed into `LoginScreen`; `?token=` for reset/verify-email is read there too, so no component imports `$app/*` and the route files stay wiring-only (R8).
- **The auth components moved to `ui/` and lost `bind:`** (issue 200): `AuthInput`/`ModeToggle` take a value and a callback. `AuthInput` now also marks `aria-invalid` from its own `error` prop, not only from an `invalid` flag.
- **`access.faults.http.db.test.ts`** pins the mobile fault boundary with a real throwing mail port (the README's old "(planned)" invariant).
- **No visual/perf run in this worktree** (the agent contract's command list excludes `visual:check`/`perf:check`): the screens reproduce the legacy structure, spacing and copy, and the orchestrator's visual check is the gate.

### S7 follow-up for ADR 0010 (2026-11-21)

The first all-pages check put every rebuilt auth page far over its initial-JS ceiling. Measured
causes and the root fixes:

- **zod in every page (27,144 B gzip).** `access.auth.rules.ts` imported `PASSWORD_TOO_SHORT_MESSAGE`
  from `access.contract.ts`, whose chunk *is* zod. The sentence now lives in
  `access.password.rules.ts` (where the length rule decides it) and the contract no longer exports
  it; the two services and two tests take it from the rules file. No schema reaches a page.
- **luxon in every page (21,573 B).** Only path was the same contract chunk (`validators` imports
  `kernel/time/dates`); gone with the import above.
- **The `ui/index.ts` barrel (8,249 B).** Every route imported `$lib/domains/access/ui`, so all seven
  screens sat in one chunk and every page paid for all of them. Routes now import their own screen
  file; the barrel stays the module's public component entry (R2), as family's did.
- **The app chrome on pages that never render it (~23 KB).** The root layout imported `ShellRoot`, so
  `/claim`, `/merge-guest` and every marketing page shipped the navbar, bell, toaster and offline
  queue. `ShellRoot` is now rendered by the three app-chrome group layouts (`(calendar)/calendar`,
  `(calendar)/account`, `(family)`) — Q-073's recorded answer and the legacy structure — and the root
  layout imports only `app.css`.
- **Visual: `/account/verify-email` was 274 px wide instead of 448.** With the chrome in the root
  layout the page's `mx-auto max-w-md` block was a *flex item*, so its auto margins shrank it to its
  text width. The new `(calendar)/account/+layout.svelte` wraps children in the legacy
  `flex-grow pb-20 md:pb-0` column, which restores the block context and legacy pixels.
- **Visual: `/signup` was 117 px short.** The legacy guest-start block ("Start planning — no account
  needed" + its note) had been dropped; restored verbatim inside `AuthCard`.
- **`/family/invite/email` landed on `/login`.** Not the page: after identity unified the pepper,
  `appCtx` resolves `EMAILSECRET` at runtime while the harness seeds signed with the build
  placeholder. `e2e/pages/serve.ts` now pins `EMAILSECRET` (new `PAGES_EMAIL_SECRET` in
  `e2e/pages/env.ts`) exactly as it already pinned `BETTER_AUTH_SECRET`, and the seed imports it.


### Running the golden in the db project

The module graph of nine of the thirteen route modules reaches the legacy `$env/static/private` chain (`utils/sendEmail.ts` reads `RESEND_API_KEY`, `magicLink.ts` reads `NOREPLYEMAIL`/`EMAILSECRET`). SvelteKit bakes those at vite startup from `.env.test` merged with `process.env`; `RESEND_API_KEY` is not in `.env.test`, so the whole file fails to import unless the shell provides it (it does in this worktree). That is the same constraint the legacy `server`-project route tests already live with; it disappears when S8 deletes the legacy send path.


## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# access: 93% ported

legacy source files left (3/10, 278 LOC):
  - src/lib/server/services/claimService.ts (149 LOC, server) importers: 1
  - src/lib/server/services/guestMergeService.ts (93 LOC, server) importers: 2
  - src/lib/server/utils/createNewUser.ts (36 LOC, server) importers: 1

route files not yet wiring-only (2/43):
  - src/routes/(marketing)/family/invite/email/+page.server.ts  /family/invite/email
  - src/routes/(marketing)/family/invite/email/+page.svelte  /family/invite/email

legacy test files left (1/28) — reference only, kinds explained in docs/architecture/testing.md:
  - src/routes/(marketing)/family/invite/email/page.server.test.ts [route, 7 tests]
```
<!-- census:end -->
