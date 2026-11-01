# 243 — Signup magic link does nothing in a browser with a guest session

Status: open

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`src/routes/(marketing)/signup/email/callback/+server.ts:51` `if (locals.user?.email) redirect` after token consumed.

## Repro

Visit /calendar (guest), sign up by email, click link -> still guest, link now dead.

## Done

(none yet)

## Needs doing

- Check `locals.user && !isAnonymousAccount(locals.user)`.
- Red test first where a seam exists (`tdd`).
