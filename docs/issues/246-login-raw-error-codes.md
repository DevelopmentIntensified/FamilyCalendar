# 246 — Login shows raw error codes / success as error / nothing when signed in

Status: done

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`family/invite/email/+page.server.ts:58-78` redirect `?error=invalid_token`; `login/+page.svelte:24-26` prints raw; JOIN_COMPLETE in red; `{#if data.isLoggedIn && !data.mergeMode}` hides notices.

## Repro

Expired invite link -> 'invalid_token' text, or nothing if signed in.

## Done

- New `login/loginMessages.ts` `loginErrorCopy()` maps `invalid_token` / `missing_token` to human copy; free-text errors pass through.
- `family/invite/email/+page.server.ts`: JOIN_COMPLETE now redirects `/login?notice=…` (failures stay `?error=`).
- `login/+page.svelte`: reads `?notice=` into a green `role="status"` banner; error + notice banners moved above the signed-in/form branch so both render for signed-in users; both params stripped from the URL.
- Tests: `login/page.svelte.test.ts` (code mapping x2, green notice, signed-in still sees message); `family/invite/email/page.server.test.ts` asserts `?notice=` for join-complete, `?error=` for refused.

## Needs doing

(none)
