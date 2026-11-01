# 241 — /claim unreachable for every Anonymous Account (placeholder email)

Status: done

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`src/routes/(calendar)/claim/+page.server.ts:18,53` `if (locals.user.email)`; since #196 guests have `<id>@anonymous.placeholder.invalid`.

## Repro

Guest taps 'Save your data with an email' -> bounced to /calendar. Claiming impossible.

## Done

- New `isRegisteredAccount(user)` in `src/lib/utils/anonymous.ts` (real, non-placeholder email) + table test `anonymous.test.ts`.
- `/claim` load + `?/request` action use it — guests with placeholder email reach the form and can request a link. Red tests in `claim/page.server.test.ts` (load + action with placeholder email).
- Repo sweep of `user.email` truthiness / `!== null` "is registered" checks, same bug, fixed here:
  - `src/routes/(calendar)/calendar/+page.server.ts` guest-merge prompt (`email !== null`) — a guest with a stale stash cookie was bounced /calendar -> /merge-guest -> /claim. Test in `calendar/page.server.test.ts`.
  - `src/routes/(marketing)/signup/password/resend/+server.ts` (`!user.email`) — would mail a code to the placeholder address. Test in `resend/server.test.ts`.
- Fixed in sibling issues: `signup/email/callback` (#243), account page / sidebar / email section + navbar profile menu (#242).

## Needs doing

(none)
