# 142 - Security and correctness fixes

Status: open

**What to build:** One ticket per reachable defect found by the security audit,
each shipped with the regression test that would have caught it, in
exploitability order.

This ticket is a fan-out by nature: it spawns one child ticket per finding. It is
not grabbable as a single unit, and should not be attempted as one.

**Blocked by:** 136.

**Status:** open

- [ ] Every finding from the audit is either fixed or explicitly waived by the owner,
      with the waiver recorded
- [ ] Each fix ships a test that fails without it
- [ ] Findings are worked in exploitability order, reachable authorisation defects first
- [ ] Any schema change is hand-written SQL recorded alongside the ticket, and
      irreversible DDL is confirmed by the owner before it runs
- [ ] Full suite green after each finding, not only at the end
