# 148 — Claim-link request: unthrottled send + registration oracle

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 2/15 — pre-auth (anonymous session only), trivially reachable, dual impact (email bomb + enumeration).

## Done

- `src/routes/(calendar)/claim/+page.server.ts:50-79` — `request` action has no `rateLimit` call (imports lines 1–10 have none): every POST issues a claim token (line 64) and sends an email (lines 73–76) to any address. Unbounded email bombing from the Family Planz domain.
- Registration oracle: lines 69–70 compute `alreadyRegistered` from `getUserByEmail`, line 78 returns it in the response. Attacker POSTs candidate addresses and reads `true/false` → account-existence enumeration, contradicting the deliberate anti-enumeration comment at lines 61–63.
- Only guard is honeypot-free session check (lines 51–52); a guest session is auto-created by `hooks.server.ts:17` (`claim` in `protectedRoutes`) on plain GET — cost to attacker: one GET.
- Claim verify side checked — fine: `claim/verify/[token]` consumes hashed token atomically (per issue 109 work).
- Waitlist is unthrottled too but already tracked as issue 089 — not duplicated here.

## Needs doing

- Option A — drop `alreadyRegistered` from the response (surface the merge hint after the verify click instead) + rate limit per IP and per email (e.g. 3/15min, pattern from `forgot-password/+server.ts:53`). Cost: guest sees "check your inbox" only; merge-preview UX moves to the verify step.
- Option B — keep the response, rate limit only. Cost: oracle survives as a slow leak (15 min per bucket per address) and per-IP limits are only as good as the XFF keying — see issue 150.
