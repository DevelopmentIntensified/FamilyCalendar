# 057 — Grocery list page

Status: in-progress

## Done

- Slice 1 (2026-09-20): `grocery_items` + `grocery_store_memory` tables, migration 015 applied, actions (add/suggest/check/uncheck/stores/delete), pure helpers + 12 tests green, build green

- Grilled shape: Mine + Family tabs at `/calendar/groceries`, no bottom-nav item yet (Family page + Dashboard slot link)
- Store model: ordered list, first = primary grouping, family-shared free-text
- Auto-fill most-frequent store from family history (normalized trim+lowercase key), user-overridable
- Check-off hides, Store Memory survives check-off + delete
- Quick-add: name + optional qty ("milk 2"), store editable; parse = hint, never commit
- CONTEXT.md: Groceries terms added

## Needs doing

- [ ] Table `grocery_items` (familyId | ownerId, name, nameKey, qty, stores[], checkedAt) + `grocery_store_memory` (familyId, nameKey, store, count)
- [ ] Server actions: add / check / uncheck / delete / set-stores; auto-fill on add
- [ ] UI: `/calendar/groceries` Mine/Family tabs, grouped by primary store, alternates shown
- [ ] Link entry points (Family page, Dashboard module slot)
- [ ] TDD: normalization + most-frequent + multi-store grouping
