# 057 — Grocery list page

Status: in-progress

**Restyle is tracked in #074 — that ticket owns everything still open here.
Do not start a second groceries lane; file anything genuinely new as its own
numbered issue.**

## Done

- Slice 1 (2026-09-20): `grocery_items` + `grocery_store_memory` tables
  (schema.ts:890, :915), migration `015_grocery_lists.sql` applied
  (migrations/scripts.ts:25,45), actions (add/suggest/check/uncheck/stores/
  move/delete), pure helpers + 12 tests green, build green
- Grilled shape: Mine + Family tabs at `/calendar/groceries`, no bottom-nav
  item yet (Family page + Dashboard slot link)
- Store model: ordered list, first = primary grouping, family-shared free-text
- Auto-fill most-frequent store from family history (normalized trim+lowercase
  key), user-overridable
- Check-off hides, Store Memory survives check-off + delete
- Quick-add: name + optional qty ("milk 2"), store editable; parse = hint,
  never commit
- CONTEXT.md: Groceries terms added
- Shipped since (verified 2026-09-29):
  - Store grouping by primary store with alternates, via
    `groupGroceriesByStore` (`src/lib/data/groceries.ts` + `groceries.test.ts`).
  - Mine/Family tabs at `src/routes/(calendar)/calendar/groceries/+page.svelte`
    with the family/no-family messaging.
  - Store Memory surfaced as an add-time suggestion fetch
    (`GET /api/groceries?suggest=1&name=…`, page line 40).
  - Optimistic check-off (<100ms ack, revert on failure, toast naming the
    item) — page lines 84-101.
  - Full item surface: edit stores, move Mine↔Family, delete
    (`api/groceries/[id]` PATCH ops `check` / `uncheck` / `stores` / `move`,
    plus DELETE; page lines 103-142).
  - Entry points: both navs reach it from one destination list
    (`src/lib/utils/navItems.ts:54`, tab bar + desktop nav — #065) and the
    Family page links it (`family/[familyId]/+page.svelte:257`).

## Needs doing

- **Nothing here — every remaining item belongs to #074** (approved-layout
  restyle: two-column wide layout, store-group summary lines, tab counts,
  store-memory suggestion chips, row alternates, square check box +
  strike-through, alphabetical store ordering, tab default/order, the page
  test, 320px overflow). Do not duplicate that scope here.
- Dashboard module slot: the groceries card that replaces the parked meals
  card is **#081**, not this ticket. Still open.
- Uncheck: exists server-side (`uncheckGroceryItem`, API op `uncheck`) with
  no UI, because checked items are hidden on check-off. #074 notes it as its
  own call — if the restyle surfaces a "recently checked" affordance, wire it
  there; otherwise leave it.
