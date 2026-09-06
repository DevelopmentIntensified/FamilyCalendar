# 016 — Audit findings: security LOWs (deferred)

Status: open

## Needs doing

- Cross-origin JSON POSTs accepted outside `/api/*` (hooks `apiOriginCheck`
  only covers `/api/*`) — widen origin check to all mutating requests;
  RISKY (auth flows use JSON posts) — design first, then fix.
- Signup email enumeration (generic "code sent if eligible" body) — if not
  already fixed in the HIGH pass, fix here.
- Invite token params unbounded (`expiresInDays`, `maxUses`) — clamp
  server-side (≤30 days / ≤50 uses) if not already fixed in the HIGH pass.
- `/api/family/invite` email subject renders "undefined undefined"
  (`user.FirstName` wrong casing) — if not already fixed in the HIGH pass.
- Checkout purchase action accepts client-supplied `finalPrice` (currently a
  stub) — MUST be server-validated before payments go live.

## Done

- (nothing yet)
