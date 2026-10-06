# 149 — Public contact form sends email unauthenticated and unthrottled

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 3/15 — pre-auth, direct monetary/deliverability abuse (Resend quota), one request per iteration.

## Done

- `src/routes/api/contact/+page.server.ts:25-73` — `default` action: no session check, no `rateLimit` anywhere in the file; only defence is a honeypot field (lines 29–32), defeated by not sending `website`.
- Sends via Resend to `hello@familyplanz.com` (lines 47–62) on every POST → unauthenticated attacker can burn the email quota and hurt sender reputation/domain deliverability.
- HTML injection checked — fine: `escapeHtml` (lines 7–14) applied to name/email/message.
- CSRF checked — fine: form action, SvelteKit `checkOrigin` default on (`svelte.config.js` sets no override) + `apiOriginCheck` for `/api/*` (`hooks.server.ts:129-151`).

## Needs doing

- Option A — rate limit, mirroring the existing pattern `api/bug-report/+server.ts:28`: `rateLimit(clientKey(request, 'contact'), 3, 15 * 60 * 1000)`. Cost: negligible; bucket key quality depends on issue 150.
- Option B — CAPTCHA (e.g. Turnstile) on the contact form. Cost: third-party script on a marketing page (CSP/privacy review), user friction; protects even if IP keying is weak.
