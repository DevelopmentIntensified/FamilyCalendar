# 018 — Family area cohesion: hub page + detail grid rebalance

Status: done

## Done

- Hub page (/family) redesigned in C1 card language: hero card with
  Families title + Create CTA, whole-row family links (color dot +
  member count + chevron), Invitations card + Family Tasks link rows,
  centered empty state. Role pill omitted (not in hub load shape —
  server contract untouched).
- Detail grid rebalanced — Option A: Activity card moved under Members
  in the left column (fills the void, matches member-action semantics);
  Settings + Invitations stay in the right rail. All C1 cards, gates,
  sheets, pending states intact.
- 320px-safe (min-w-0 everywhere), ≥44px targets, pb-20 clearance.
- Gates: e2e family+mobile 13 ✅, colocated page tests 9 ✅,
  check/eslint/oxlint/prettier 0. Commit 5f8be5c.
