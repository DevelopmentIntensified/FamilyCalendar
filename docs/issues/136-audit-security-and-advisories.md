# 136 - Audit: security, correctness, and current advisories

Status: open

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

**Status:** open

- [ ] Every action with a side effect has an explicit authorisation check, or a
      ticket saying why not
- [ ] Every resource read verifies the caller may see that resource
- [ ] No secret appears in the client bundle, the repository, or a log line
- [ ] Each advisory finding states the installed version and why it is in range
- [ ] Findings are ordered by exploitability, with a reachable authorisation defect
      above a theoretical dependency advisory, and the ordering is stated

**Note:** order matters more than count. One reachable ownership defect matters
more than twenty advisory upgrades.
