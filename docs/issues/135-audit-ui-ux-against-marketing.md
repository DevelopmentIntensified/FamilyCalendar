# 135 - Audit: every route against the marketing pages

Status: open

**What to build:** A numbered ticket per visual or interaction defect found by
measuring every route against the design language the marketing pages emit.
**No code changes in this ticket** - tickets only, so nothing reaches the preview
branch that the owner has not seen.

Cover, at minimum: radius, spacing, type scale, colour tokens, empty states,
loading states, error states, focus visibility, keyboard operability, touch
target size, horizontal overflow at narrow widths, and time-to-interactive on a
throttled connection.

**Blocked by:** 131 (the harness is how a verdict becomes evidence instead of an
opinion).

**Status:** open

- [ ] Every route is measured, and routes with no deviation are recorded as
      measured-clean rather than omitted
- [ ] Each ticket names the route, the property, the expected value, the actual
      value, and how the measurement was taken
- [ ] Dimensional claims come from a real browser, not from arithmetic on
      framework defaults - one arithmetic claim in this repository understated a
      page by 139 pixels
- [ ] No code is modified

**Note:** an earlier account-page round compared section prose and missed the card
chrome underneath it. Measure the container, not only the contents.
