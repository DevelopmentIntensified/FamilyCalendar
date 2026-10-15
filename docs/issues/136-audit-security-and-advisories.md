# 136 - Audit: security, correctness, and current advisories

Status: done

**What to build:** A numbered ticket per reachable defect, ordered by
**exploitability rather than scanner severity**. **No code changes in this
ticket.**

Cover: authorisation on every action, ownership checks on every resource read and
write, cross-site request forgery protection, injection, secrets in the bundle or
the repository, rate limits on authentication and invitation paths, session
teardown, token handling, and mass-assignment of fields a form does not own.

Separately: **research current advisories and check them against this code.** For
every finding, resolve the actually-installed version from the lockfile and
report it only when that version falls in the affected range. A CVE that does not
apply is not a finding.

**Blocked by:** None (can start immediately).

## Done 2026-10-15 — findings filed as #162–#169 (+ confirmations on existing)

- #162 plaintext unbound email codes (rank 2); #163 claim-verify GET mutates (3); #164 event-tasks visibility leak (4); #165 family event edit, no owner leg (5, fork); #166 email-change token gaps (6); #167 defaultCalendarId no check (7); #168 mass-assignment seams (12, hardening); #169 token/session/push/log hygiene bucket (10/11/14/15).
- Deduped, not refiled: rank 1 → #152 confirmed live (annotated); rank 8 → #150 stands; rank 9 → covered by #147–149/#151/#089; rank 13 (no CSP) tracked-not-finding; rank 16 by design; advisories all covered by #156–161 (none new: svelte 5.20.1 out of range for CVE-2025-15265, vite/esbuild dev-only).
- Checked clean (full list in SecAuditor report): every /api mutation authed, family role gates, event/calendar/task authz seams, magic-link/forgot/claim/cron guards, parameterised queries, no bundle secrets.

**Status:** done

- [ ] Every action with a side effect has an explicit authorisation check, or a
      ticket saying why not
- [ ] Every resource read verifies the caller may see that resource
- [ ] No secret appears in the client bundle, the repository, or a log line
- [ ] Each advisory finding states the installed version and why it is in range
- [ ] Findings are ordered by exploitability, with a reachable authorisation defect
      above a theoretical dependency advisory, and the ordering is stated

**Note:** order matters more than count. One reachable ownership defect matters
more than twenty advisory upgrades.
