# 284 — Emailed magic link drops ?redirect= (invitees land on /calendar)

Status: open

Source: 2026-11-02 leftovers pass.

## Evidence

#244 follow-up: login/signup honour `?redirect=` when the code is typed, but the emailed magic link goes to /calendar because the redirect isn't carried through the token.

## Done

(none yet)

## Needs doing

- Carry the sanitised `redirectTo` (reuse `safeRedirectPath`) through the magic-link token/URL for login and signup email links; callback redirects there. Open-redirect tests on the callback too.
