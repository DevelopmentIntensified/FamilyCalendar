# 143 - The promotion gate

Status: open

**What to build:** One written checklist for promoting the preview branch to the
production branch, with the owner's sign-off as the exit criterion. The point is
that "is it ready" is answered once, against a list, rather than repeatedly from
memory by whoever is available.

**Blocked by:** 134, 138, 139, 140, 141, 142.

**Status:** open

- [ ] Every checklist item is pass or fail, with no judgement items
- [ ] Build passes, full suite passes with an exact file and test count, and the
      count has not fallen against the previous baseline
- [ ] Type-check findings have not increased
- [ ] End-to-end specs pass with the database available, and a database outage is
      distinguished from a real failure
- [ ] Prototype and brand checks pass
- [ ] The owner has reviewed a screenshot of every route and has marked it
      approved or waived
- [ ] Every audit finding is closed or waived with the waiver recorded
- [ ] Nothing remains blocked on an owner decision
