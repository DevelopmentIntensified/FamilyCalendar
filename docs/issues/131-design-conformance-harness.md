# 131 - The design-conformance harness

Status: open

**What to build:** One module that takes a rendered route and reports where it
departs from the design language the marketing pages actually emit. It ships
reporting **zero** deviations on a marketing page, so it is proven before it is
allowed to judge anything. This is the single new seam in the programme; every
visual ticket after this one is a red assertion in it.

Derive the expectations from the marketing pages' own emitted values. Do **not**
write a second style guide by hand - a second source of truth is how the current
drift happened in the first place.

**Blocked by:** None (can start immediately).

**Status:** open

- [ ] Given a marketing page, the harness reports zero deviations
- [ ] Given a known-drifting app route, the harness reports the specific deviation
- [ ] The token set is derived from the marketing pages, not hand-written
- [ ] Deviation output names the property, the expected value and the actual
- [ ] A unit test per rule, written red first

**Note:** three review rounds in this repository reported a page as "matches the
prototype" and were wrong each time. All three compared feature presence rather
than emitted values. This harness exists so that verdict stops being an opinion.
