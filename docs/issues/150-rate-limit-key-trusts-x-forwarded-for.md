# 150 — Rate-limit key trusts client-supplied `x-forwarded-for` verbatim

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 4/15 — conditional but multiplies every rate limit in the app (147–149, 151, login/reset limits).

## Done

- `src/lib/server/utils/rateLimit.ts:22-24` — `clientKey()` = `` `${scope}:${ip}` `` where `ip` is the **entire raw** `x-forwarded-for` header (or `'local'`). No single-hop extraction, no platform-trusted fallback.
- If the platform passes client-supplied XFF through or appends to it (common behaviour), an attacker rotating/ appending values gets a fresh bucket per request → all limiters bypassable: `login/password/+server.ts:25`, `signup/email/+server.ts:22`, `forgot-password/+server.ts:53`, `login/email/code/+server.ts:43`, `api/bug-report/+server.ts:28`, member-search, location-search, report-phrase, parse-event.
- Secondary effect: a multi-hop XFF string makes one real client's key differ per hop count → limits can also mis-fire on legit users.
- Uncertainty (must verify before fixing): what Vercel's edge actually writes into `x-forwarded-for` for this app — overwrite with observed client IP, or pass-through/append. One probe from prod (send crafted XFF, observe limiter key behaviour via a rate-limited endpoint) settles it.
- In-memory limiter itself (single instance) checked — acceptable for the current single-instance Vercel deploy (`rateLimit.ts:1-4` documents this).

## Needs doing

- Option A — key off the platform-trusted single IP (Vercel provides one; confirm exact header in current docs) and take one value only. Cost: helper becomes Vercel-specific; local dev needs the `'local'` fallback preserved; needs deploy + probe to confirm.
- Option B — keep XFF but take only the hop the platform guarantees it set. Cost: still depends on unverified platform semantics; choosing the wrong hop silently breaks all limits (shared bucket or still spoofable).
- Verification step (probe prod XFF handling) is required before either option.
