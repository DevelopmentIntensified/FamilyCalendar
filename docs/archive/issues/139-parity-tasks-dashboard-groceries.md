# 139 - Parity: tasks, dashboard and groceries

Status: open

**What to build:** Three routes brought to conformance, using the loop proven in
137. One context window, one lane.

**Blocked by:** 137, 135.

**Status:** open

- [ ] All three routes report zero deviations through the harness
- [ ] The grocery scope-capture behaviour is retained - the override key includes
      the scope captured at write time, and flipping the scope toggle must not
      relabel an existing override
- [ ] The pinned day-dashboard assertions still pass, including the glance pairing,
      the grid count and the ancestor walk
- [ ] The chip vocabulary and their predicates stay true of what each chip names
- [ ] Tests red first
