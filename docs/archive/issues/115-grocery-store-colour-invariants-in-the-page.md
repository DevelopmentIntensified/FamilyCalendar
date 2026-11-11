# 115 — Grocery Store colour: the invariants live in the page, not the interface

Status: done (2026-10-16)

Source: architecture review, 2026-09-30, candidate #7.


**Blocked by:** None. Smallest of the nine.

## The finding

Twelve exports for one page plus one dashboard card. The problem is not the
count — it is that **three different key conventions coexist**:

| Layer | Keys on |
|---|---|
| groups | `label.toLowerCase()` |
| colour resolution | the label **as written** |
| DB rows | the trimmed `storeKey` |

The page converts between them **by hand**. Nothing in the interface says which
convention a function wants, so the conversion is spread across the call sites
where it can be forgotten.

## Possible real bug — flagged, not confirmed

The optimistic override map is keyed by store **alone**, but `colourFor`
resolves **personal-then-family**. Set a personal colour, then a family colour
for the same Store in one session, and **the personal override is overwritten.**

**Repro result (2026-10-16): DISPROVED — the bug never shipped.** The override
map is (and by the landed code always is) keyed `scope:storeKey`
(`colourOverrideKey`), and each override carries the `familyId` of the scope it
was made at (`optimisticColourRow`), so a personal flip and a family flip are
two rows, and `colourFor`'s personal-then-family precedence reads both.
`page.svelte.test.ts` covers it: set a personal colour, then flip a family
colour for the same Store in one session, and the personal choice still wins
(the `Aldi` stays `lilac` assertions after the family write). No ticket needed.

## Needs doing

- [x] **Repro the personal-then-family overwrite first.** See "Possible real
      bug" above: disproof recorded there.
- [x] One key convention, stated in the interface, used by all three layers:
      `storeKey(name)` (trim + lowercase) now keys the grouping
      (`groupGroceriesByStore`), the colour lookup (`colourFor`), and the DB
      rows; the docblocks on `groceryStoreGroups` say so.
- [x] Grouping and colour resolution are **one concept**:
      `groceryStoreGroups(items, rows, viewer)` returns each group with its
      `StoreColour` attached in one call. The page's four-call assembly is
      gone — `resolveGroceryColours` (a label-keyed map over `colourFor`)
      deleted; the page consumes `groceryStoreGroups`.
- [x] `GroceriesCard.svelte`'s `storesOf` pass-through deleted — the card
      calls `groupGroceriesByStore(scope.items)` in the each block directly.
- [x] The store *name* is the hash input, and collisions are **permitted and
      disclosed**: unchanged and pinned by tests (the real colliding pair
      `Costco`/`Lidl`, plus the collision disclosure lines).

## The deletion test

Deleting the pure helpers makes the page re-implement key normalisation,
precedence, name-hashing and collision disclosure — that **concentrates**. The
helpers are deep. The *seam* between them and the page is not.

## Done

- `src/lib/utils/hashName.ts` — the repo's ONE name hash. Used by
  `defaultStoreColourKey` (groceries) and `getContactColor` (contactColors).
- `src/lib/data/groceries.ts` — one key convention (`storeKey`) across
  grouping/colour/rows; `groceryStoreGroups` = grouping + colour in one call;
  `resolveGroceryColours` deleted; default colour derives via `hashName`.
- `src/routes/(calendar)/calendar/groceries/+page.svelte` — consumes
  `groceryStoreGroups`; no hand key conversion left between grouping and
  colour.
- `src/lib/components/dashboard/GroceriesCard.svelte` — calls the grouping
  directly; no palette or mapping defined here (the palette stays in
  `$lib/data/groceries.ts`, single definition).
- Red→green under TDD: `groceryStoreGroups` suite (same store = same colour
  under any spelling / unknown store deterministic / no-store untinted) and the
  trimmed-group-key test both failed before the edits and pass after.

## Notes

- `hashName()` extracted (115 work): `groceries.ts` and `contactColors.ts`
  used byte-identical copies of the charCode-sum-with-shift hash and now share
  `src/lib/utils/hashName.ts`. `avatarColor.ts` deliberately keeps ITS OWN
  additive (no-shift) hash of an ID: swapping it would repaint every existing
  avatar, and its input is an ID, not a name. One hash per NAME; the avatar
  variant is a surface, not a duplicate.
- The grocery palette stays DEFINED ONCE in `$lib/data/groceries.ts`
  (`STORE_COLOURS`) — the page, the rail card, the group headers and the colour
  API all consume it; nothing forks a second palette.
- The store-name → colour mapping is owned at the PAGE level: the page resolves
  groups+colours through `groceryStoreGroups` (with the viewer's overrides
  merged), and other consumers (chips, rail card rows) resolve the same way via
  the same `colourFor` with the same rows and viewer — so one store is one
  colour on every surface.
- The `CONTEXT.md` Store Colour entry already states the personal-over-family
  precedence rule once, as this note wanted.
