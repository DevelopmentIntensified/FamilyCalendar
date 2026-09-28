# 065 — Groceries is unreachable from the mobile nav

Status: open

Source: `app-ui/tasks.html` review, bottom nav marked "we need groceries too".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] Groceries is reachable from the bottom nav without opening a menu. Today
      the bottom nav carries Calendar, Dashboard, Tasks, Alerts, Family; the
      top nav carries Groceries but has no Alerts.
- [ ] The two navs stop disagreeing: every destination in the top nav is
      reachable on mobile, and every bottom-nav item exists in the top nav.
- [ ] The active-item highlight resolves for the new item (longest-prefix
      match, query-carrying hrefs compared pathname-only).
- [ ] Touch targets stay at the repo's minimum height at 320px, and the bar
      still fits five (or six) items without overflow.
- [ ] The nav tables' unit tests cover the new item; the mobile e2e smoke test
      still passes.

## Done

## Notes

- Bottom nav items are currently hardcoded in the component rather than shared
  with the top nav table. If the fix is smaller by moving them onto the shared
  table, do that — the divergence is the bug's root.
