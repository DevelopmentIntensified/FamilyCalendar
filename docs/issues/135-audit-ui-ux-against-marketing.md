# 135 - Audit: every route against the marketing pages

Status: done

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

## Done 2026-10-15 — findings filed as #170–#173

- Method: static class reads against the `src/lib/conformance/` seam (no browser in the audit lane per validation discipline); dimensional verdicts go to the #131 harness red → fix → green.
- #170 two-orange fork (terracotta vs primary ramp, `/pricing` inside the corpus masks it) — fork, not decided.
- #171 tracking + gray-ramp + radius drift (eyebrow rule fork, not decided).
- #172 touch targets below 44px (banners, checkboxes, rails; measure in Chromium first).
- #173 focus rings missing (search, selects, create-name, hero CTAs).
- Measured-clean: NONE (no browser) — every route needs the harness pass. Geometry rows stay manual per the #131 Option-A ruling.

**Status:** done

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
