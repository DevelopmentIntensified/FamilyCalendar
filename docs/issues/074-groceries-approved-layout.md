# 074 — Groceries: the approved layout, on the real page

Status: in-progress

Source: `app-ui/groceries.html` review — "prototype approved".

**Blocked by:** None (can start immediately).

## Done

- [x] Two columns on wide screens (list plus a side rail) —
      `grid items-start lg:grid-cols-[21rem_minmax(0,1fr)]`. The rail carries the
      scope tabs, the add field, Store Memory and the checked-off rail; the wide
      column carries the list.
- [x] Store groups with a summary line — "2 items · 4 total" (count + summed
      quantity), tinted header bar per group.
- [x] The two-scope tabs carry counts and match the prototype's default and
      order: **Family first, defaulting to Family**, then Mine.
- [x] Store Memory surfaces as suggestion chips under the add field (a "Store
      Memory:" label plus a clickable store chip) instead of placeholder text;
      the store chip on each row carries its alternates as the "or X" line.
- [x] Items read as a trip — square check box (`role="checkbox"`,
      `rounded-md`), quantity as `×N`, and Store groups sorted alphabetically
      rather than by insertion order.
- [x] **Uncheck has a UI** — a "Checked off (N)" rail in the side rail, with
      struck-through items and a per-item uncheck, plus an "Undo" action on the
      check-off toast. Both call the existing `op: 'uncheck'`.
- [x] Everything the real page already had survives: edit-stores, scope move,
      delete, the error region, the "no family yet" message, per-item alternates,
      and the instant check-off.
- [x] A page test covers the grouping, the summary line, the tabs (default,
      order, counts), the check-off, the uncheck, the error region, the row
      actions and the Store Memory chip; the grouping helper's suite grew the
      sorted-order case.

## Needs doing

- [ ] No horizontal overflow at 320px. Handled by CSS discipline (`min-w-0` +
      `truncate` on every flexible child, `flex-wrap` on the row, the add row and
      the edit row, single column below `lg`), but jsdom does no layout, so
      there is no automated assertion. Needs a real browser check.

## Notes

- This is a **restyle, not a rewrite**: grouping by store, the two tabs, store
  memory and the optimistic check-off are all already built. The judgement
  calls are store ordering, tab default, and turning the suggestion endpoint's
  answer into chips.
- Uncheck exists server-side with no UI. If the restyle surfaces it, good;
  if not, it is a separate ticket.
- Uncheck was surfaced. It is **session-scoped**: the rail is client state, since
  `getOpenGroceries` only returns unchecked items and surfacing a durable
  "checked" list would mean changing the groceries actions module. A checked
  item therefore stays recoverable for the session (and via the toast's Undo),
  not across a reload.
- `groupGroceriesByStore` now sorts. It has exactly one consumer (this page), so
  no other call site changes behaviour.
- Tab default is Family even with no family, per the prototype; the "join or
  create a family" message covers that case.
- Row actions stay in the existing edit mode ("Stores" opens the editor, which
  also holds Move/Cancel). The prototype shows three always-visible icon
  buttons; converting them is a behaviour change, not a restyle, so it was left.

