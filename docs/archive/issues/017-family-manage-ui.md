# 017 — Family manage page UI redesign

Status: done

## Done

- C1 "Card Stack" shipped: hero card (color avatar, role pill, add-member,
  admin gear scroll), Members card (role pills, desktop inline
  edit/remove, mobile kebab → focus-trapped bottom sheet), Invitations
  card (fixed broken href), always-visible admin-gated Settings card
  (`showSettings` state deleted), Activity card; 2-col desktop grid.
- 320px overflow root-caused (truncate min-width inflation) → `min-w-0`
  on grid/flex items; verified 0 overflow at 320/375.
- All gating/toast/pending/inline-confirm work preserved; 9 new component
  tests + 2 e2e selector updates (settings toggle removed, header renamed).
- Gates: unit 1119 ✅, e2e 91 ✅, check/eslint/oxlint/prettier 0, build ✔,
  live on test.familyplanz.com.
