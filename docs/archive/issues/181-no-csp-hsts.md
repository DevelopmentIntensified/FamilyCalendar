# 181 — No CSP, no HSTS
Status: open
Source: production-readiness security audit, 2026-10-16.
## Done
- `src/hooks.server.ts:109-118` sets only X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy; comment defers CSP (inline scripts would break). No HSTS (no `vercel.json` headers; Vercel adds none by default). CSP + HSTS absent on every response.
- Tension recorded: #169 line 13 kept CSP tracked, not a finding; this re-raises it per the spec (headers on every response).
## Needs doing
- Nonce/hash the inline scripts, then ship CSP; add HSTS; verify headers on the test deploy.
