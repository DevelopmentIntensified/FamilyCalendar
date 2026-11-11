# 237 — Moving another member's family grocery item to Mine sends it to their list

Status: done

Source: repo bug audit 2026-11-01 (lane D).

## Evidence

`groceries.ts:173` `.set({ familyId: target.familyId })` keeps original `userId`.

## Repro

Mom adds milk (Family); Dad taps To Mine -> toast 'Moved to Mine', item lands in Mom's private list.

## Done

- Confirmed real: `moveGroceryItem` only set `familyId`; family scopeFilter matches any member's item, so `userId` stayed the adder's.
- `moveGroceryItem` now sets `userId: target.userId` (target comes from `resolveScope(auth.user.id, …)` in `api/groceries/[id]` = the viewer). Personal→Family is unchanged in effect (personal scopeFilter already pins `userId` to the viewer).
- Red→green: `groceries.test.ts` `moveGroceryItem` suite (update stub captures `.set()`): family→Mine re-owns to viewer; Mine→Family keeps owner; no-match → false.

## Needs doing

(none)
