# 248 — Family detail page does not update after remove/role change/rename

Status: done

Source: repo bug audit 2026-11-01 (lane F).

## Evidence

`src/routes/(family)/family/[familyId]/+page.svelte:27` `const { family, members, ... } = data`.

## Repro

Remove member -> toast, row stays until hard reload.

## Done

- Red: `[familyId]/page.svelte.test.ts` "follows fresh data (issue 248)" — removed member stayed, rename not shown (hero + name field), admin controls kept after role change (3 failing).
- Fix in `[familyId]/+page.svelte`:
  - `$: ({ family, members, currentUserRole, currentUserId, activity = [] } = data);`
  - `$: isAdmin = ...` (was `const`).
  - `editingName` / `editingColor` re-seed only when the server's `family.id|name|color` changes — an unrelated reload (module toggle, member action) never clobbers a half-typed name.
- Green 24/24. Sweep of other `(family)` pages recorded in #247.

## Needs doing

(none)
