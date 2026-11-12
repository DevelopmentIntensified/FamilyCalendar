# Port sheet: access

**domain** · rank 15 · port #15 · home: `src/lib/domains/access/` · README after the port: `src/lib/domains/access/README.md` (written in S1)

Sign-in flows: login, signup, magic links, password reset, Claiming, Claim Conflict merge, guest merge, email change/verify, mobile (Android) auth, logout.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse, sponsored, meals, feedback.
- **Owns tables:** `claimTokens`.
- **Must be ported first:** identity, calendar (from the legacy import graph; see the ledger).
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
| `/api/mobile/auth/forgot` | POST | none | `{email}` | 200 `{sent:true}` always (reuses the web handler) | 400 `Email is required`; 429 `Too many attempts. Try again shortly.`; 500 `Failed to send reset email` | `src/routes/api/mobile/auth/forgot/+server.ts:11-16` |
| `/api/mobile/auth/reset` | POST | none | `{token,password}` | 200 `{success:true}` (forwards the web reset) | 429 `Too many attempts. Try again shortly.` (per IP, 10/15 min) then the web reset 400s | `src/routes/api/mobile/auth/reset/+server.ts:11-32` |
| `/login/email` | POST | none | `{email,redirectTo?}`; unguarded `request.json()` | 200 `{success:true,message:"If that email has an account, we've sent a login link."}` for sent **and** suppressed | 400 `Invalid email`; 429 `Too many attempts. Try again shortly.`; 500 `There was an error. Please try again.` | `src/routes/(marketing)/login/email/+server.ts:13-66` |
| `/login/email/code` | POST | optional guest session | `{code,email}`; falsy either → 400 | 200 empty body + `Set-Cookie`; code row deleted | 400 `Unexpected error, please try again`; 429 `Too many attempts. Try again shortly.`; 500 generic; 500 `No Account found` | `src/routes/(marketing)/login/email/code/+server.ts:41-127` |
| `/login/password` | POST | none | `{email,password}`; unguarded `request.json()` | 200 `{success:true,user:{id,email,firstName}}` + `Set-Cookie` | 400 `Email and password are required`; 429 `Too many attempts. Try again shortly.`; 401 `Invalid email or password`; 401 `Please use email login for this account`; 500 `Failed to login` | `src/routes/(marketing)/login/password/+server.ts:13-66` |
| `/signup/email` | POST | none | `{email,firstName,lastName,redirectTo?}` | 200 `{success:true}` for sent **and** suppressed (already registered) | 400 `Invalid email`; 400 `First and last name are required`; 429 `Too many attempts. Try again shortly.`; 500 `There was an error. Please try again.` | `src/routes/(marketing)/signup/email/+server.ts:13-68` |
| `/signup/email/code` | POST | none | `{code,email}` | 200 empty body + `Set-Cookie`; user created from the code row's names | 400 `Unexpected error, please try again`; 429 `Too many attempts. Try again shortly.`; 500 generic; 500 `Account with this email already Exists` | `src/routes/(marketing)/signup/email/code/+server.ts:38-116` |
| `/signup/password` | POST | none | `{email,password,firstName,lastName}` | 201 `{success:true,user:{id,email,firstName},emailVerification:'pending'}`; a taken email gets the same 201 with `user.id:''` and no session/email | 400 `All fields are required`; 400 `Password must be at least 8 characters`; 429 `Too many attempts. Try again shortly.`; 500 `Failed to create account` | `src/routes/(marketing)/signup/password/+server.ts:53-102` · `src/lib/server/services/passwordSignup.ts:62-102` |
| `/signup/password/resend` | POST | session, registered user only | none | 200 `{success:true}`; verified user → success without emailing | 401 `Unauthorized`; 429 `Too many attempts. Try again shortly.`; 500 `There was an error. Please try again.` | `src/routes/(marketing)/signup/password/resend/+server.ts:47-105` |
| `/signup/password/verify` | POST | none | `{code,email}` | 200 `{success:true}`; flips `emailVerified`; code deleted | 400 `Unexpected error, please try again`; 429 `Too many attempts. Try again shortly.` | `src/routes/(marketing)/signup/password/verify/+server.ts:41-80` |
| `/forgot-password` | POST | none | `{email}`; unguarded `request.json()` | 200 `{success:true}` for known and unknown/Anonymous Account addresses | 400 `Email is required`; 429 `Too many attempts. Try again shortly.`; 500 `Failed to send reset email` | `src/routes/(marketing)/forgot-password/+server.ts:34-92` |
| `/forgot-password/reset` | POST | none | `{token,password}`; unguarded `request.json()` | 200 `{success:true}`; password replaced, all sessions + all `fp_` tokens revoked | 400 `Token and password are required`; 400 `Password must be at least 8 characters`; 400 `Invalid or expired reset token. Please request a new one.`; 400 `Invalid reset token`; 400 `This reset link has already been used. Please request a new one.`; 400 `Account not found`; 500 `Failed to reset password` | `src/routes/(marketing)/forgot-password/reset/+server.ts:51-135` |
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
- Seven JSON auth handlers call `await request.json()` unguarded, so malformed bodies surface as framework 500s instead of the house `400 {"error":"Invalid JSON"}` used by the `/api` routes. — `src/routes/(marketing)/login/email/+server.ts:22`, `login/email/code/+server.ts:61`, `login/password/+server.ts:19`, `signup/email/+server.ts:17`, `signup/email/code/+server.ts:59`, `forgot-password/+server.ts:48`, `forgot-password/reset/+server.ts:69` — inconsistent error contract.
- `signup/email/code` answers 500 `"Account with this email already Exists"` (also a capitalisation typo) while every other path is deliberately generic — a membership signal at code redemption. — `src/routes/(marketing)/signup/email/code/+server.ts:87-93` — contradicts the no-enumeration rule.
- `login/email/code` has a distinct 500 `"No Account found"` next to the generic `"Unexpected error, please try again"` — a differential response for an orphaned code. — `src/routes/(marketing)/login/email/code/+server.ts:96-99`
- The email validator is copy-pasted three times plus a fourth weaker `includes('@')` check in forgot-password; `claimRequest` requires a dot in the domain while forgot-password does not. — `src/lib/server/services/magicLink.ts:112-113`, `src/lib/server/services/mobileAuth.ts:102-103`, `src/lib/server/services/claimRequest.ts:56-58`, `src/routes/(marketing)/forgot-password/+server.ts:50-52` — divergent validation.
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

### Files by role

| file | role | what goes in it |
|---|---|---|
| `index.ts` | entry | Re-exports the contract types, `authApi` and `authRedirectTarget`. |
| `index.server.ts` | entry | Re-exports the services, the 13 `/api` endpoint handlers and the page handlers. |
| `access.contract.ts` | contract | Zod schemas for every `/api` request/response in this module (mobile bodies, `{email}`, `{code}`, `{token,password}`) plus the exact legacy error copy as constants; internal page/action inputs designed fresh. |
| `access.email.rules.ts` | rules | Magic-link payload shape (kind/email/names/code/redirect), `code`/`email` pairing, the 15-minute TTL and the 8-digit shape; pure. |
| `access.redirect.rules.ts` | rules | `authRedirectTarget`: path-only same-origin landing (`safeRedirectPath` logic), fallbacks `/calendar/` and `/calendar`. |
| `access.password.rules.ts` | rules | Signup/password validation (four required fields, at least 8 characters, email format) and the token name rule. |
| `access.password.rules.test.ts` | rules test | Tables of input → message/valid. |
| `access.device.rules.ts` | rules | `mobileTokenName` (`Android — <deviceName>`, trimmed, 60-char cap, `Android` default) and the `toMobileUser` mask. |
| `access.device.rules.test.ts` | rules test | Device-name tables (empty, padded, 60/61/70 chars) and the guest email mask. |
| `access.claim.rules.ts` | rules | Claim-token shape (32 random bytes hex, 15-minute TTL), the guests-only rule and the uniform answer. |
| `access.claim.rules.test.ts` | rules test | Token/email validation and the no-oracle answer. |
| `access.email.rules.test.ts`, `access.redirect.rules.test.ts` | rules test | Kind-mismatch/legacy-token tables and the unsafe-redirect table (from the legacy `magicLink` unit tests). |
| `access.repo.server.ts` | repo | Claim-token queries only (access owns `claimTokens`): insert, peek by hash, atomic `DELETE … RETURNING`, delete expired. |
| `access.fixtures.server.ts` | fixtures | `seedGuest`, `seedPasswordUser`, `seedApiToken`, `seedEmailCode`, `seedClaimToken`. |
| `access.repo.db.test.ts` | repo test | A `rollbackTest` per query (peek does not burn, consume is exactly once, expired is gone). |
| `access.email.service.server.ts` | service | `startEmailLink` (validation → gate and suppression → mint → email → code row), `completeEmailLink`, `verifySignupCode`, `resendSignupCode`. |
| `access.password.service.server.ts` | service | `signInWithPassword` (dummy-compare defence, generic 401, shared by web and Android), `signUpWithPassword`, `requestPasswordReset`, `resetPassword` (single-use marker, revoke sessions + tokens). |
| `access.claim.service.server.ts` | service | `requestClaim` (guests only, 10/15 per IP + 3/15 per address, uniform answer) and `confirmClaim` (peek → ownership → atomic consume → claim or Claim Conflict merge). |
| `access.guestMerge.service.server.ts` | service | `mergeGuest` in one `withTx`: personal calendar via calendar's entry, move Events (ids preserved) and Tasks via tasks' entry, delete sessions, delete the guest; same-person/non-guest is a no-op. |
| `access.emailChange.service.server.ts` | service | `requestEmailChange` (3/15 per person, guest refusal, code+link to the NEW address, identity-bound row) and `verifyEmailChange` (token or code path, 10/15 per IP). |
| `access.session.service.server.ts` | service | `signOut` (cookie session or exactly the presented `fp_` token) and `createGuestAccount`. |
| `access.email.service.db.test.ts` | service test | Send-before-persist, suppression, guest-session kill, signup creation. |
| `access.claim.service.db.test.ts` | service test | Preview without burn, atomic consume, Claim Conflict merge, verify POST signs into the merged target. |
| `access.emailChange.service.db.test.ts` | service test | Identity binding, single use, pending address in use. |
| `access.guestMerge.service.db.test.ts` | service test | Merge transaction, cookie-not-enough, no-op cases. |
| `access.http.server.ts` | http | All 13 `/api` endpoints (`endpoint()`), byte-for-byte the goldens: the eight `/api/mobile/auth/*` plus `/api/logout` and the four `/api/me/*`. |
| `access.http.db.test.ts` | test | This slice's goldens (13 routes); unchanged after S6. |
| `access.http.server.test.ts` | http test | The throw→JSON-500 guard and the wiring-only route contract. |
| `access.pages.http.server.ts` | http | `pageLoad`/`formAction` for `/login`, `/signup`, `/forgot-password(+/reset)`, `/claim`, `/account/verify-email`, `/merge-guest`, `/family/invite/email`, and the email-link callbacks. |
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
| `services/accountData.ts` — `requestEmailChange` + `UpdateEmailDeps` | `access.emailChange.service.server.ts`; the rest of `accountData` stays with the account screen/identity. |
| `utils/createNewUser.ts` | identity (user + provider account + settings); the personal-calendar call is composed in `access.password.service.server.ts` through calendar's entry. |
| `components/auth/{AuthCard,AuthInput,ModeToggle}.svelte` | `ui/`, rebuilt on kernel/ui primitives. |

## Notes

### Verified, corrected inventory

Every wire line below was re-read against the legacy code on 2026-11-11.

- `/api/mobile/auth/signup` for a taken address answers **200** with `{token:"", user:{id:"",…}, emailVerification:"pending"}` (`src/routes/api/mobile/auth/signup/+server.ts:62-77`). `docs/guides/task-api-spec.md:711` still lists `400 "An account with this email already exists"`; the sheet's API table and the golden are right, the spec line is stale. The port must keep 200 (no account oracle) — the spec needs a doc fix, not the wire.
- `/api/me/verify-email` 429 body carries `success:false` (`src/routes/(marketing)/signup/password/verify/+server.ts:47-52`), unlike the bare `{error}` the sheet's error column implies. Pinned by the golden.
- `/api/mobile/auth/forgot` with a malformed body answers **500** `Failed to send reset email`, not 400: the web handler's unguarded `request.json()` throws inside its own `try` (`src/routes/(marketing)/forgot-password/+server.ts:47-92`). Pinned as today's wire; see the owner question.
- `/api/mobile/auth/reset` with a malformed body answers **500** `Failed to reset password` for the same reason (`src/routes/(marketing)/forgot-password/reset/+server.ts:68-135`). Pinned.
- The mobile routes: a **non-string but truthy** `email` (e.g. `123`) throws in `.toLowerCase()` and lands in the same 500 (`forgot`). Not pinned: it is a defect, and pinning it would bless the TypeError.
- `/api/logout`'s "delete the session row and clear `locals`" half cannot be driven through `invoke` — the harness pins `locals.session` to `null` — so the golden pins the signed-out 302 only; the S5 service test pins the deletion.
- `/api/me/claim`'s rate limits cannot be reached without sending real emails: the per-address allowance is 3, so the fourth request both fills and trips it. That one 429 case (per-address bucket) is in the skipped spec-golden block; the per-IP bucket (10) is the same test ten times over.
- The 8 spec-goldens at the bottom of `access.http.db.test.ts` (claim fresh address, claim registered address, claim 429, me/email success, resend send, mobile email send, mobile signup create, forgot send) are `it.skip` with the required marker: the legacy handlers send through the module-scope Resend client, so running them would hit the network. They assert the spec (and the legacy unit tests' expectations). **S6 must delete the `.skip`s** in the same commit that makes the ported handler take its sender from `ctx` — that is the one sanctioned edit to this golden file.
- `POST /api/mobile/auth/verify` login looks up `accounts` first (`src/lib/server/db/schema.ts:197`, via `getAccount`) and falls back to `users` (`src/lib/server/services/mobileAuth.ts:291-295`); a person with only a `users` row signs in. Pinned.

### Probably accidental, and what happens to it

- **Wire-visible, kept + owner questions:** the mobile/forgot and mobile/reset 500-on-malformed-JSON (pinned); the 200-vs-201 drift between mobile and web signup (kept, question); the `signup/email/code` 500 "Account with this email already Exists" and `login/email/code` 500 "No Account found" membership/state signals (page routes, no goldens — question).
- **Internal, dropped (reasons):** `findActiveTokenForUser` has no importers → dies; the duplicated `sessionCookieFor` JSDoc → dies with the file; the three copy-pasted email validators and forgot-password's weaker `includes('@')` → one `emailAddress` rule in `access.email.rules.ts` (the dot requirement wins; `task-api-spec` and every `/api` golden already assume it); the `guest_merge` cookie stored *before* the token is validated → stashed after success; email-change codes stored in plaintext (`accountData.ts:375-383`, #162) → hashed like every other code row (internal, no wire change); the reset single-use marker written before hashing → written after the password update so a failed hash cannot burn the link (internal, wire unchanged: still 500).

### Questions for the owner

1. **Malformed JSON on the web-forwarded routes.** Context: `forgot` and `reset` answer 500 (not the house 400 `Invalid JSON`) because they forward to the web handlers, which parse unguarded. Options: keep 500 for these two (golden as-is), or return the house 400 like the `/api/me/*` routes and change the goldens with a `fix-in-port` commit. Recommendation: fix in port, ticket it — the Android client already treats `{"error"}` uniformly and a 500 pollutes the fault register.
2. **Mobile signup 200 vs web signup 201.** Same event, two statuses. Options: keep both (golden pins 200), or align the web to 200 behind an answered question. Recommendation: keep 200 for the app (it is installed and expects it), align the web page's response only if a client needs it — no change in this port.
3. **The two membership signals on the page-code routes** (`signup/email/code` → 500 "Account with this email already Exists", `login/email/code` → 500 "No Account found"). They leak account state on the wire. Options: leave (page-only, no installed client), or make both the generic 500 `Unexpected error, please try again`. Recommendation: make both generic in the port; the goldens cover no page routes, so nothing breaks.
4. **Email-change codes in plaintext (#162).** Options: leave until #162's ticket, or hash on write now (the codes are internal to the flow and burned on use). Recommendation: hash now; no wire change.
5. **Carry-over #175:** the web `/forgot-password/reset` has no throttle of its own (only the mobile wrapper adds 10/15 per IP). Options: port as-is with the wrapper throttle, or move the throttle into the shared service. Recommendation: move it into the service when porting; the mobile golden's 429 stays valid and the web form gains the cap.
6. **Spec-golden activation (S6).** These 8 tests cannot run until the ported handler takes its email sender from `ctx` (there is no kernel email port yet). Recommendation: add the port in this module's S5 (a `ctx.mail` port in kernel, per add-a-port.md) so S6 unskips them rather than deferring again.

### Files kept for unported importers

None of the 10 legacy source files is kept: every importer is inside this module's own routes, which S8 rewires. `npm run census -- access` after S8 should show 0.

### Running the golden in the db project

The module graph of nine of the thirteen route modules reaches the legacy `$env/static/private` chain (`utils/sendEmail.ts` reads `RESEND_API_KEY`, `magicLink.ts` reads `NOREPLYEMAIL`/`EMAILSECRET`). SvelteKit bakes those at vite startup from `.env.test` merged with `process.env`; `RESEND_API_KEY` is not in `.env.test`, so the whole file fails to import unless the shell provides it (it does in this worktree). That is the same constraint the legacy `server`-project route tests already live with; it disappears when S8 deletes the legacy send path.


## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# access: 0% ported

legacy source files left (10/10, 1443 LOC):
  - src/lib/components/auth/AuthCard.svelte (10 LOC, ui) importers: 2
  - src/lib/components/auth/AuthInput.svelte (63 LOC, ui) importers: 2
  - src/lib/components/auth/ModeToggle.svelte (31 LOC, ui) importers: 2
  - src/lib/server/services/claimRequest.ts (87 LOC, server) importers: 2
  - src/lib/server/services/claimService.ts (149 LOC, server) importers: 3
  - src/lib/server/services/guestMergeService.ts (93 LOC, server) importers: 9
  - src/lib/server/services/magicLink.ts (471 LOC, server) importers: 10
  - src/lib/server/services/mobileAuth.ts (373 LOC, server) importers: 7
  - src/lib/server/services/passwordSignup.ts (130 LOC, server) importers: 3
  - src/lib/server/utils/createNewUser.ts (36 LOC, server) importers: 6

route files not yet wiring-only (43/43):
  - src/routes/(calendar)/account/verify-email/+page.server.ts  /account/verify-email
  - src/routes/(calendar)/account/verify-email/+page.svelte  /account/verify-email
  - src/routes/(calendar)/claim/+page.server.ts  /claim
  - src/routes/(calendar)/claim/+page.svelte  /claim
  - src/routes/(calendar)/claim/verify/[token]/+server.ts  /claim/verify/[token]
  - src/routes/(calendar)/merge-guest/+page.server.ts  /merge-guest
  - src/routes/(calendar)/merge-guest/+page.svelte  /merge-guest
  - src/routes/(marketing)/family/invite/email/+page.server.ts  /family/invite/email
  - src/routes/(marketing)/family/invite/email/+page.svelte  /family/invite/email
  - src/routes/(marketing)/forgot-password/+page.svelte  /forgot-password
  - src/routes/(marketing)/forgot-password/+server.ts  /forgot-password
  - src/routes/(marketing)/forgot-password/reset/+page.svelte  /forgot-password/reset
  - src/routes/(marketing)/forgot-password/reset/+server.ts  /forgot-password/reset
  - src/routes/(marketing)/login/+page.server.ts  /login
  - src/routes/(marketing)/login/+page.svelte  /login
  - src/routes/(marketing)/login/email/+server.ts  /login/email
  - src/routes/(marketing)/login/email/callback/+server.ts  /login/email/callback
  - src/routes/(marketing)/login/email/code/+server.ts  /login/email/code
  - src/routes/(marketing)/login/loginMessages.ts  /login
  - src/routes/(marketing)/login/password/+server.ts  /login/password
  - src/routes/(marketing)/signup/+page.server.ts  /signup
  - src/routes/(marketing)/signup/+page.svelte  /signup
      NOTE: Fat page: extract state into `<name>.state.svelte.ts` + pure rules; the screen component stays under ~250 lines.
  - src/routes/(marketing)/signup/email/+server.ts  /signup/email
  - src/routes/(marketing)/signup/email/callback/+server.ts  /signup/email/callback
  - src/routes/(marketing)/signup/email/code/+server.ts  /signup/email/code
  - src/routes/(marketing)/signup/password/+server.ts  /signup/password
  - src/routes/(marketing)/signup/password/resend/+server.ts  /signup/password/resend
  - src/routes/(marketing)/signup/password/verify/+server.ts  /signup/password/verify
  - src/routes/(marketing)/signup/password/verifyPath.ts  /signup/password
  - src/routes/api/logout/+server.ts  /api/logout
  - src/routes/api/me/claim/+server.ts  /api/me/claim
  - src/routes/api/me/email/+server.ts  /api/me/email
  - src/routes/api/me/verify-email/+server.ts  /api/me/verify-email
  - src/routes/api/me/verify-email/resend/+server.ts  /api/me/verify-email/resend
  - src/routes/api/mobile/auth/email/+server.ts  /api/mobile/auth/email
  - src/routes/api/mobile/auth/fakes.ts  /api/mobile/auth
  - src/routes/api/mobile/auth/forgot/+server.ts  /api/mobile/auth/forgot
  - src/routes/api/mobile/auth/guest/+server.ts  /api/mobile/auth/guest
  - src/routes/api/mobile/auth/logout/+server.ts  /api/mobile/auth/logout
  - src/routes/api/mobile/auth/password/+server.ts  /api/mobile/auth/password
  - src/routes/api/mobile/auth/reset/+server.ts  /api/mobile/auth/reset
  - src/routes/api/mobile/auth/signup/+server.ts  /api/mobile/auth/signup
  - src/routes/api/mobile/auth/verify/+server.ts  /api/mobile/auth/verify

legacy test files left (28/28) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/server/services/claimService.test.ts [pure, 7 tests]
  - src/lib/server/services/magicLink.test.ts [pure, 20 tests]
  - src/routes/(calendar)/account/verify-email/page.server.test.ts [route, 12 tests]
  - src/routes/(calendar)/claim/page.server.test.ts [route, 11 tests]
  - src/routes/(calendar)/claim/verify/[token]/server.test.ts [route, 6 tests]
  - src/routes/(marketing)/family/invite/email/page.server.test.ts [route, 7 tests]
  - src/routes/(marketing)/forgot-password/reset/server.test.ts [route, 4 tests]
  - src/routes/(marketing)/forgot-password/server.test.ts [route, 4 tests]
  - src/routes/(marketing)/login/email/callback/server.test.ts [route, 8 tests]
  - src/routes/(marketing)/login/email/code/server.test.ts [route, 5 tests]
  - src/routes/(marketing)/login/email/server.test.ts [route, 7 tests]
  - src/routes/(marketing)/login/page.server.test.ts [route, 0 tests]
  - src/routes/(marketing)/login/page.svelte.test.ts [component, 6 tests]
  - src/routes/(marketing)/signup/email/callback/server.test.ts [route, 10 tests]
  - src/routes/(marketing)/signup/email/code/server.test.ts [route, 6 tests]
  - src/routes/(marketing)/signup/email/server.test.ts [route, 9 tests]
  - src/routes/(marketing)/signup/password/resend/server.test.ts [route, 6 tests]
  - src/routes/(marketing)/signup/password/server.test.ts [route, 6 tests]
  - src/routes/(marketing)/signup/password/verify/server.test.ts [route, 5 tests]
  - src/routes/api/me/claim/server.test.ts [route, 5 tests]
  - src/routes/api/mobile/auth/email/server.test.ts [route, 8 tests]
  - src/routes/api/mobile/auth/forgot/server.test.ts [route, 9 tests]
  - src/routes/api/mobile/auth/guest/server.test.ts [route, 4 tests]
  - src/routes/api/mobile/auth/hooks.test.ts [route, 3 tests]
  - src/routes/api/mobile/auth/logout/server.test.ts [route, 3 tests]
  - src/routes/api/mobile/auth/password/server.test.ts [route, 4 tests]
  - src/routes/api/mobile/auth/signup/server.test.ts [route, 3 tests]
  - src/routes/api/mobile/auth/verify/server.test.ts [route, 8 tests]
```
<!-- census:end -->
