# 141 - Parity: import, notifications and event

Status: open

**What to build:** Three routes brought to conformance, using the loop proven in
137. One context window, one lane.

**Blocked by:** 137, 135.

**Status:** open

- [ ] All three routes report zero deviations through the harness
- [ ] Import preview-before-commit and batch undo are not regressed
- [ ] The event attendance region computes from real attendance data, and its
      per-status breakdown is present rather than deferred to another surface
- [ ] The notification preference controls persist, and a control that does not
      persist is treated as a failure rather than a partial
