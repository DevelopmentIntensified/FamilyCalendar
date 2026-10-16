# 176 — No MFA — waive or roadmap
Status: open
Source: production-readiness access-control audit, 2026-10-16.
## Done
- Zero `totp|webauthn|2fa` hits anywhere in `src/`: no TOTP, no WebAuthn, no recovery codes.
- Product is a consumer family calendar shipping magic links + passwords as primary auth (`(marketing)/features/+page.svelte:94-96`).
## Needs doing
- Option A — waive with record (consumer segment, no enterprise SSO surface). Cost: one line + owner sign-off.
- Option B — TOTP/WebAuthn with hashed single-use recovery codes issued at setup. Cost: full auth slice + enrollment UX.
- Owner decision; not choosing in this ticket.
