# 241 — /claim unreachable for every Anonymous Account (placeholder email)

Status: open

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`src/routes/(calendar)/claim/+page.server.ts:18,53` `if (locals.user.email)`; since #196 guests have `<id>@anonymous.placeholder.invalid`.

## Repro

Guest taps 'Save your data with an email' -> bounced to /calendar. Claiming impossible.

## Done

(none yet)

## Needs doing

- Use `isAnonymousAccount(user)`; test with placeholder email.
- Red test first where a seam exists (`tdd`).
