# 244 — ?redirect= ignored by login/signup; invitees lose the invite

Status: done

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`family/join/[code]/+page.svelte:129,135` and `checkout/+page.server.ts:18` send `?redirect=`; `login/+page.svelte:51,97` and signup `:68,115` always `goto('/calendar')`.

## Repro

Signed-out invitee -> 'Sign in to join' -> lands on /calendar, never joins.

## Done

- New `src/lib/utils/safeRedirect.ts` `safeRedirectPath(raw, fallback='/calendar')`: only same-origin relative paths (single leading `/`, no `//`, no backslash, no control chars / encoded CR-LF, URL-origin check). Table test `safeRedirect.test.ts` (22 cases incl. `//evil.com`, `/\evil.com`, `https://…`, `javascript:`).
- `login/+page.server.ts` + `signup/+page.server.ts` return `redirectTo` (sanitised). Test `login/page.server.test.ts`.
- Login + signup pages: password login, code verification and the "already logged in" button go to `redirectTo`; the login<->signup cross links carry `?redirect=` forward. Test `login/page.svelte.test.ts`.
- Limitation: clicking the emailed magic link (instead of typing the code) still lands on `/calendar` — the redirect isn't threaded through the JWT. Follow-up if wanted.

## Needs doing

(none)
