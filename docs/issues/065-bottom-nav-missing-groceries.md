# 065 — Groceries is unreachable from the mobile nav

Status: done

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

- **One list, two surfaces.** Every signed-in destination is declared once and
  both navs read it. The tab bar had its own hand-copied array *and* its own
  copy of the longest-prefix matching logic; that duplication is the whole bug,
  not a symptom of it. Icons moved onto the shared entries, so a new destination
  now appears in both navs or neither.
- **Groceries is in the tab bar.** The reviewer's actual complaint, on a phone,
  where the top nav is a hamburger.
- **Six tabs, `Groceries` shortened to `Shop`.** At 320px a six-tab bar is
  ~53px per tab and the full label will not fit. The visible label is the
  compromise; the **accessible name stays "Groceries"**, so a screen reader
  never hears "Shop". The label width is asserted in the test rather than left
  to taste (9 characters, ~11px).
- The tab bar's columns derive from the item count, so it stops hardcoding
  `grid-cols-5` — the class that had to be edited by hand every time an item
  was added, and the reason nothing failed when the two navs disagreed.
- The icon pill's fixed `min-w-14` is gone: it was sized for five tabs and
  would have overflowed six. Labels truncate instead of pushing a tab wide.
- Alerts stays tab-bar-only, and that is now explicit and tested rather than
  incidental: the desktop nav represents it as a bell, so the entry carries
  `bellInstead` and the nav test asserts the two lists differ by exactly that
  one item.
- **Guards**: `navItems.test.ts` gained five cases (groceries reachable, alerts
  retained, no desktop-only destination, every tab has an icon and a label
  short enough to fit, and the active tab resolves on a grocery-list visit).
  `links.test.ts` gained two more: every nav destination resolves to a real
  route, and the two navs agree in both directions.
- **Mobile e2e** now asserts the groceries tab is visible with the right href,
  and that the bar fits 320px with no tab squeezed below 40px.
- Gates: `navItems` + `BottomNav` 18/18; `links.test.ts` 7/7; `src/lib` suites
  771/771 across 102 files; `svelte-check` unchanged at 47 errors / 26 files;
  `npm run build` green.

## Notes

- The dev server is the only way to see the six-tab bar for real; the unit tests
  pin the structure and the e2e pins the geometry at 320px.
- Six tabs is dense on a small phone. If it reads as crowded in the hand, the
  honest next move is a More tab rather than dropping a destination — this
  issue deliberately did not hide anything to make room.
