# 175 — Reset TTL 60min + login has no backoff
Status: open
Source: production-readiness access-control audit, 2026-10-16.
## Done
- `src/routes/(marketing)/forgot-password/+server.ts:66-77` — reset JWT lives 60 minutes, above the 15-30min spec. Single-use is solid (SHA-256 `used:` marker in codes, `reset/+server.ts:94-113`; all sessions invalidated `:117-120`).
- `src/routes/(marketing)/login/password/+server.ts:24-26` — combined `pw-login:<email>` x IP key at 10/5min, but no IP-only cap, no backoff/captcha, counter resets: distributed guessing unthrottled.
- Contrast (good): verification codes are 8-digit, IP-only 10/15min (`signup/password/verify/+server.ts:57`), deleted on use.
## Needs doing
- Cut reset TTL to <=30min; add IP-only login cap + exponential backoff (never a hard lock, per spec).
- Tests: expired-token rejected; burst past the caps 429s with a clear message.
