# 096 — Groceries: every store carries its own colour

Status: done

Source: `app-ui/groceries.html` review, store chip marked **idea** — "Why only
one highlighted? make each store have configurable color."

**Blocked by:** None (can start immediately).

## SQL for the user to run

**Hand-run this. Do not add it as a migration file and do not run
`drizzle-kit push`.** The migration baseline (#086) is not in place yet, so
nothing can apply this for you — the runner diffs `schema.ts` against the live
database and would try to reconcile all twenty-odd tables at once. #086 owns
that reconciliation; this DDL is written to be pasted in ahead of it, and it is
idempotent, so running it twice is harmless.

```sql
-- 096: store colours. A store is free text inside grocery_items.stores, so
-- there is no entity to hang a column on; one row per store NAME is what a
-- colour needs. store_key is the trim+lowercase key the store group already
-- groups on, so two spellings of one shop are one row and one colour.
--
-- Dual scope, exactly like grocery_store_memory and itemTags: family_id SET
-- is the family's colour, family_id NULL is the viewer's override, and the
-- override wins on read. Postgres treats NULLs as distinct in a unique
-- index, so each scope needs its own PARTIAL unique index or a personal
-- upsert could never conflict. Idempotent.
CREATE TABLE IF NOT EXISTS "grocery_store_colours" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"family_id" text REFERENCES "families"("id") ON DELETE CASCADE,
	"store_key" text NOT NULL,
	"color" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "grocery_store_colours_family_store_unique"
	ON "grocery_store_colours" ("family_id", "store_key") WHERE "family_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "grocery_store_colours_user_store_unique"
	ON "grocery_store_colours" ("user_id", "store_key") WHERE "family_id" IS NULL;

CREATE INDEX IF NOT EXISTS "grocery_store_colours_store_key_idx"
	ON "grocery_store_colours" ("store_key");
```

Before running it, confirm the table does not already exist under a different
name. There is no reason it should — this is new:

```sql
SELECT tablename FROM pg_tables WHERE tablename LIKE 'grocery%';
-- expect grocery_items and grocery_store_memory only.
```

**Do not skip the two partial unique indexes.** They are not an optimisation,
they are what makes the personal-scope upsert a single statement: without them
`ON CONFLICT (user_id, store_key)` can never fire for a personal row (the NULL
`family_id` never compares equal), so every colour flip by a user with no
family would insert a duplicate row.

## Needs doing

- [x] A store can be given a colour, and the colour is what identifies the
      group: the group header bar and the store chip on each row take the
      store's colour instead of one hard-coded tint for every group.
      The header carries `data-store-bar`, tinted with that store's own `bar`
      class plus a dot in its `dot` colour; the row chip carries its `chip`
      class. The old `bg-emerald-50/60` header tint and the `bg-sky-100` chip
      are both gone.
- [x] The colour is picked from a curated palette, not a free colour field. —
      **with a caveat recorded below.** `STORE_COLOURS`
      (`src/lib/data/groceries.ts`) is one declared six-swatch set; the picker
      is a `<select>` over it, `isStoreColourKey` guards the write, and an
      undeclared value falls back rather than rendering.
- [x] A store with no colour set gets a deterministic default. The default is
      derived from the store's name rather than from its position, so adding a
      store does not repaint the others. — **the "two groups never in the same
      tint by accident" half of this bullet does not hold and was replaced by
      a disclosure promise. See Notes.**
- [x] "Any store" (an item with no store) is never given a colour — it is the
      absence of a store, not a shop. `colourFor` returns `null` for it, the
      group gets no `data-store-bar`, no dot and no colour control, and it is
      never counted as a twin on another store's header.
- [x] The colour is editable where a store is already editable: on the group
      itself and on the per-item stores editor, so a user who notices a
      mis-coloured store while looking at an item can fix it there. — **on the
      group only. See Notes for why the per-item editor does not get one.**
- [x] The flip acks under 100ms and confirms what changed, by toast, naming
      the store and the new colour. `setColour` writes `colourOverrides`
      before the request, so the bar repaints in the same tick, and reverts on
      failure. Toast: `Aldi is now Lavender` / `… (just you)` /
      `Aldi is back to its own default colour.`
- [x] Tests: a colour set on a store reaches the group header and the row chip;
      an unset store gets the deterministic default; the no-store group is
      never tinted; setting a colour for a store resolves identically for the
      family list and a personal list. — **the "two different stores do not
      collide" case was replaced by a disclosure case. See Notes.**

## Done

- [x] Schema: `grocery_store_colours`, dual-scope, two partial unique
      indexes, mirroring the `itemTags` precedent.
- [x] Pure client-safe colour layer in `src/lib/data/groceries.ts`:
      `STORE_COLOURS`, `isStoreColourKey`, `storeKey`, `defaultStoreColourKey`,
      `colourFor` (personal -> family -> default), `storesSharingColour`,
      `resolveGroceryColours`. 24 new tests.
- [x] Server actions `getStoreColours` / `setStoreColour`, 12 new tests
      against a scripted drizzle stub.
- [x] `GET`/`PATCH /api/groceries/colours` — a dedicated route, **not**
      `/api/groceries/[id]`. A colour belongs to a store, and a store is free
      text on an item rather than a row of its own, so there is no id to hang
      it on; putting it under `[id]` would have made it look like an item
      mutation and would have demanded a meaningless `scope` and `id`.
- [x] The page reads the colour rows and the viewer identity from the loader,
      so the resolution is client-side and by VIEWER — a colour set on the
      family list reads identically on a personal one.
- [x] The free-text store field offers the shops already on the lists as a
      `<datalist>`, so a typo is less likely to become a second store, and so a
      second colour.
- [x] 12 new page tests covering all of the above.
- [x] `npm run build` green; both vitest projects green (197 files, 2421
      tests); no new `svelte-check` errors in any file touched.

## Notes

- **The three-tier resolution held up against the code exactly as briefed.**
  Personal beats family beats a name-derived default, and Store Memory
  (`grocery_store_memory`) is indeed the same `userId` + optional `familyId`
  shape. The Tag Table's rule (`item_tags_user_key_category_unique` /
  `item_tags_global_key_category_unique`) is the precedent for the two partial
  unique indexes, and it is the reason both are needed rather than one.

- **"Two different stores do not collide" cannot hold, and the same bullet
  forbids the fix.** A six-swatch palette and unbounded free-text stores cannot
  be collision-free; the only collision-free assignment is position-based, and a
  position-based assignment means *adding a store repaints the others* — which
  the very next sentence forbids. The two asks contradict each other, so I kept
  the stronger one (name-derived, so adding a store never repaints another) and
  made the collision **permitted but always disclosed**, which is what the
  approved prototype does ("Collisions: ALLOWED and never enforced... the group
  header names both"). The header now reads
  `2 items · 4 total · shares Sage with Trader Joe's`, the store name is always
  printed beside the colour, and the toast names the colour. A collision is
  therefore never *silent*, which is the promise actually worth keeping. With
  the repo's charCode-sum hash `Aldi` and `Trader Joe's` really do collide, and
  the suite pins that real pair rather than leaving the case hypothetical.

- **The picker lives on the group, not on each item's editor.** The per-item
  editor edits an item's store *names*; with five items at Aldi it would render
  five identical colour pickers, and after saving stores the colour would have
  to follow a string the user had just retyped. The group header is the one
  place a store's colour lives, it is one tap from the item that revealed the
  problem, and 097 makes it truer still (a group is a store, not a
  store-in-a-scope). Recorded as a deliberate narrowing, not an oversight.

- **The write scope is explicit, never inferred.** The group carries an
  "Everyone" / "Just me" control, shown only when the user actually has a
  family. Everyone writes the family row; Just me writes the viewer's personal
  row, which wins on read. A colour chosen for a real shop is family knowledge,
  and a user with no family still needs somewhere to put one — which is the
  dual-scope decision this ticket already made, reachable from the UI.

- **The palette is declared here, in `$lib/data/groceries.ts`, rather than
  taken from the family colour.** 075 has not landed, so the "curated family
  palette" this ticket points at does not exist in the app yet:
  `family/create/+page.svelte` still carries a 17-swatch grid inline, and that
  route is out of bounds for this ticket. `STORE_COLOURS` is the curated earthy
  six that the approved groceries prototype and the approved family-create
  prototype already agree on, declared once. **075/099 should adopt this
  declaration** rather than declaring a third set — that is precisely the "one
  fact in one place" work 099 exists to do, and this is the fact it should
  adopt.

- **The group key is `label.toLowerCase()`, not trimmed.**
  `groupGroceriesByStore` was left untouched, as briefed. That is equivalent to
  the trim-and-lowercase rule the colour table uses on every row the server
  writes, because `cleanStores` trims every store on every write path. A colour
  keyed from `'  Aldi '` still matches a group labelled `Aldi`. Pinned by a test
  so the two can never drift apart silently. If `cleanStores` ever stops
  trimming, the group helper must change to match — not the colour key.

- **The colour column is free text and the app is the only guard.** A crafted
  `PATCH` could set anything the column accepts, so `setStoreColour` rejects
  any value outside `STORE_COLOURS` and `colourFor` treats an unrecognised
  stored value as "no colour set". This is the same hole 099 flags for the
  family colour; a `CHECK` constraint or a Postgres enum would close it at the
  database and is worth doing when the baseline lands.

- 074 shipped the store grouping, the summary line and the chip. This was
  additive: the grouped list, the tabs, the uncheck rail, Store Memory and the
  optimistic check-off all survive untouched.

## Carried into 097

- The colour resolution is by VIEWER, not by which tab is open, so replacing
  the tabs with a scope filter does not disturb it.
- `resolveGroceryColours` is keyed by the group label *as written*, so the
  filter view reads a colour straight off a group with no re-normalising.
- The group header already carries a "shares X with Y" clause, which is
  exactly the honest way to count a group that now holds both scopes.
