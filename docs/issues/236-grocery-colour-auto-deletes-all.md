# 236 — Resetting one store colour to Auto (Just me) deletes all personal store colours

Status: open

Source: repo bug audit 2026-11-01 (lane D).

## Evidence

`src/lib/server/db/actions/groceries.ts:260-261` personal `scopeWhere` lacks `storeKey`; `color==='auto'` deletes by scopeWhere.

## Repro

Aldi red, Costco blue, set Aldi to Auto -> Costco colour gone too.

## Done

(none yet)

## Needs doing

- Add `eq(groceryStoreColours.storeKey, key)` to personal branch.
- Red test first where a seam exists (`tdd`).
