# 292 — Android: make the app a clone of the website's mobile view

Status: in-progress

Source: owner, 2026-11-03: _"make the app a clone of the website mobile view for now. Be thorough. And follow the same style guide."_

Spec: [`docs/specs/android-mobile-clone.md`](../specs/android-mobile-clone.md)

## What the spec holds

- A token table. Every colour, type, radius, spacing, shadow, motion and icon value cites its source:

  - the #131 conformance harness property it falls under
  - `tailwind.config.js`
  - `src/lib/marketing/theme.css`
  - Tailwind 3.4.19 defaults
  - a component `file:line`

  `docs/guides/android-design-tokens.md` (#291) stays the single Kotlin mapping. It is updated, not forked.

- 14 screen sections, inventoried from the code at < 768 px (`VIEW_BREAKPOINT_PX`):
  - shell
  - Calendar (month / list / week / day, sheets, modals, quick-add, bulk)
  - Day Dashboard, Tasks, Groceries, Alerts
  - Families, Family detail, Invitations, Create / Add member, Family tasks
  - Account, Sign-in / Sign-up
  - secondary pages
- 175 numbered, testable acceptance items (`AC-*`).
- 16 server API gaps (G1–G16). These are screens whose data is reachable only through SvelteKit page loads or form actions, or through non-`/api` routes, which Bearer `fp_` tokens cannot reach. Each gap has a proposed contract.
- Six implementation lanes with exclusive file ownership:

  - L0 server APIs
  - L1 shell + theme
  - L2 calendar
  - L3 tasks
  - L4 dashboard + groceries + alerts
  - L5 family + account + auth

  One sequencing point: L1-S1a splits `AppViewModel` and lands the entry stubs.

- Seven open questions for the owner (Q1–Q7).

## Needs doing

- [ ] Owner answers Q1–Q7 (spec §5)
- [ ] L0: G1–G16 server endpoints + `task-api-spec.md`
- [ ] L1-S1a: split `AppViewModel` and add entry stubs
- [ ] L1: shell + tokens (§1, §2.1)
- [ ] L2: Calendar (§2.2)
- [ ] L3: Tasks (§2.4)
- [ ] L4: Dashboard, Groceries, Alerts (§2.3, §2.5, §2.6)
- [ ] L5: Family, Account, Auth, secondary pages (§2.7–§2.14)
- [ ] Owner reviews screenshots at 390 dp and 320 dp (#130 gate)
