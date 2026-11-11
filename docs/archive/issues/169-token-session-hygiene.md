# 169 — API tokens: no expiry, no scopes; push upsert reassigns endpoints; PII in logs

Status: open

Source: security audit (issue 136), 2026-10-15. Ranks 10/11/14/15 — hygiene bucket, all LOW/INFO.

## Done

- `src/lib/server/db/actions/apiTokens.ts:9-15` — personal token = full account power on ALL `/api/*` until manual revoke. No expiry, no scopes. (Theft required; shown once + hashed at rest — good.)
- `src/lib/server/auth.ts:14-27` — 90-day absolute session, no idle eviction; logout kills current session only. Stolen cookie usable 90d unless logoutAllDevices/reset. (Reset-password already kills all sessions — good.)
- `src/lib/server/services/pushService.ts` — `saveSubscription` upsert on endpoint reassigns `userId`. Endpoint URLs unguessable; needs a leak. INFO/LOW.
- `src/lib/server/services/analyticsService.ts:44-62` — userId/email/plan in server logs; bug-report paths log messages. Log exposure only, no tokens/secrets. INFO.
- `src/hooks.server.ts` — no CSP by stated intent; `{@html}` is static icon literals only, no stored-XSS sink found. Kept tracked, not a finding.

## Needs doing

- Token expiry + minimal scopes as the API surface grows; consider idle timeout + rotation for sessions; scrub PII from logs when convenient. Each shippable alone. No forks.
