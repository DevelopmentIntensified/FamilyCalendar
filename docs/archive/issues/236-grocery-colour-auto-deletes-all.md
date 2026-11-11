# 236 — Resetting one store colour to Auto (Just me) deletes all personal store colours

Status: done

Source: repo bug audit 2026-11-01 (lane D).

## Evidence

`src/lib/server/db/actions/groceries.ts:260-261` personal `scopeWhere` lacks `storeKey`; `color==='auto'` deletes by scopeWhere.

## Repro

Aldi red, Costco blue, set Aldi to Auto -> Costco colour gone too.

## Done

- Confirmed real: personal `scopeWhere` = `userId AND familyId IS NULL` only, so Auto deleted every personal colour row.
- Added `eq(groceryStoreColours.storeKey, key)` to the personal branch of `setStoreColour`.
- Red→green: `groceries.test.ts` captures the delete where-clause, renders via `PgDialect`, asserts `store_key`/`aldi` present (personal + family).

## Needs doing

(none)
