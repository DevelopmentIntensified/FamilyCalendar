# 284 — Emailed magic link drops ?redirect= (invitees land on /calendar)

Status: done

Source: 2026-11-02 leftovers pass.

## Evidence

#244 follow-up: login/signup honour `?redirect=` when the code is typed, but the emailed magic link goes to /calendar because the redirect isn't carried through the token.

## Done

- The redirect rides **inside the signed JWT** as `redirectTo` (tamper-proof; no extra query param). `issueMagicLink` (`src/lib/server/services/magicLink.ts`) sanitises the raw value with `safeRedirectPath`; unsafe/absent values are dropped so the token keeps its old shape. `issueVerificationCode` signs it via the new `opts.redirectTo`.
- `/login/email` and `/signup/email` POSTs forward `body.redirectTo`; the login/signup pages send their (already sanitised) `redirectTo` with the send and resend requests.
- Both callbacks redirect to `magicLinkRedirectPath(payload)`, which re-sanitises (`safeRedirectPath(…, '/calendar/')`) — defence in depth at the callback. Error paths, the "already signed in"/"account exists" signup branches, guest merge and the claim flow are unchanged.
- Tests: `magicLink.test.ts` (claim signed for login+signup, unsafe values dropped, real `createJWT`/`validateJWT` round-trip from the emailed link, non-string claim ignored); POST route tests (claim present / `//evil.com` dropped); callback tests for both kinds (honours `/invite/abc?x=1`; `//evil.com`, `/\evil.com`, `https://evil.com`, `/x%0d%0aSet-Cookie:a=b` all land on `/calendar/`; no claim keeps `/calendar/`).
- Evidence: new tests red (7 failing) before the change, green after; full suite green under TZ=UTC and TZ=America/Chicago apart from `*.real.test.ts` (no Postgres) and the pre-existing env-dependent `auth.test.ts` placeholder-secret case; `npm run build` passes; no svelte-check errors in touched files.

## Needs doing

(nothing)
