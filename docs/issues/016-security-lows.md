# 016 — Audit findings: security LOWs (deferred)

Status: in-progress

## Done

- Signup email enumeration masked (identical happy-path response; e2e updated).
- Invite token params clamped server-side (`expiresInDays` 1–30, `maxUses`
  1–50); helper lives in `src/lib/server/utils/clampCount.ts` (route files
  can't export non-endpoints).
- Invite email subject casing fixed (`firstName`/`lastName`).

## Needs doing

- Cross-origin JSON POSTs accepted outside `/api/*` (hooks `apiOriginCheck`
  only covers `/api/*`) — widen origin check to all mutating requests;
  RISKY (auth flows use JSON posts) — design first, then fix.
- Checkout purchase action accepts client-supplied `finalPrice` (currently a
  stub) — MUST be server-validated before payments go live.
- `members/add/email` (JWT-invite flow) lets any member invite — same
  "any member can mint invites" shape as the fixed direct-add; decide if
  creator/admin-only.
