# 137 - Parity: the worst route first

Status: open

**What to build:** The parity loop proven end to end on the single route the audit
names as the worst offender, brought to conformance and green through the
harness.

Its purpose is to prove the loop - harness reports red, page is fixed, harness
reports green - before the remaining routes are attempted in parallel. Skipping
this risks discovering the approach is wrong four times over.

**Blocked by:** 131, 135.

**Status:** open

- [ ] The harness fails on this route before the change and passes after
- [ ] Every deviation the audit listed for this route is closed
- [ ] Deviation output is recorded in the ticket, before and after
- [ ] Regression test red first
- [ ] No capability is removed to achieve conformance - the prototype cannot show
      loading, empty, error or authorisation states, so its silence is not
      instruction to delete them
