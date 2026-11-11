# 243 — Signup magic link does nothing in a browser with a guest session

Status: done

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`src/routes/(marketing)/signup/email/callback/+server.ts:51` `if (locals.user?.email) redirect` after token consumed.

## Repro

Visit /calendar (guest), sign up by email, click link -> still guest, link now dead.

## Done

- Callback short-circuits only for `isRegisteredAccount(locals.user)`; a guest session falls through, the account + session are created, and the stashed guest merges on /calendar (#241 merge-prompt fix). Red test in `signup/email/callback/server.test.ts` (placeholder-email guest gets `createNewUser` + session cookie).

## Needs doing

(none)
