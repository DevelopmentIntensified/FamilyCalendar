# groceries

**domain** — Grocery List (one list, scope filter), Grocery Items, Store Memory, Store Colours.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns the **Grocery List**: one check-off list over both scopes with an All / Family / Mine filter (not two tabs), its Grocery Items (name + optional quantity + ordered store list), and the `/api/groceries` surface the Android app and the page both drive.
- Owns **Store Memory** (item-name → store learning that survives check-off and delete) and **Store Colours** (one swatch per Store, personal choice winning over the family one, then a name-derived default).
- Does not own family membership or the family id: the `family` domain supplies the viewer's family, and this module only asks for it. It does not compose the Day Dashboard's Groceries card (`dayDashboard` screen does), nor the tasks-page filter idiom it mirrors (`tasks` domain).

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: contract types, the pure rules (quick-add, store cleaning, grouping + colour, scope filter, search, optimistic colour overrides) and the browser api. Rules are isomorphic so the server and the page cannot disagree about a key. | `groceries.items.rules.test.ts`, `groceries.colours.rules.test.ts`, `groceries.scope.rules.test.ts` |
| [index.server.ts](index.server.ts) | entry | Public server interface: the seven use-cases, the page load and the six `/api` endpoint handlers. | [groceries.http.db.test.ts](groceries.http.db.test.ts), `groceries.service.db.test.ts` |
| [ui/index.ts](ui/index.ts) | entry | Public components: the grocery row, the store group, the side rail, the checked-off rail and the store-colours card. | `ui/*.svelte.test.ts` |
| [groceries.http.db.test.ts](groceries.http.db.test.ts) | test | Golden contract tests for every groceries `/api` route and method, run against the legacy handlers so the port cannot move the wire. | — |

## Public interface

Everything other modules and routes may use, grouped by entry file. One line each: `name` — what it does.

- `index.ts`:
  - `GroceryItem`, `GroceryListScope` (`'mine' | 'family'`), `GroceryScopeFilter` (`'all' | 'family' | 'mine'`), `StoreColour`, `StoreColourRow`, `StoreColourViewer`, `GroceryGroup` — the module's words as types; the wire shapes live in the contract file and are re-exported.
  - `parseGroceryQuickAdd(input)` — `"milk 2"` / `"2 milk"` / `"Eggs 6"` → `{ name, quantity }`.
  - `normalizeGroceryName(name)` — the history key (trim + lowercase).
  - `cleanGroceryStores(stores)` — trimmed, blanks dropped, case-insensitively de-duplicated, first spelling and first position kept. One home for the write-path clean and the chip read-path dedupe.
  - `mostFrequentGroceryStore(rows)` — the Store Memory suggestion; ties go to the first row seen.
  - `groupGroceryItems(items, rows, viewer)` — the store groups, each with its resolved colour: grouping and colour are one concept (#115) so no caller re-assembles them from two key conventions.
  - `resolveGroceryStoreColour(name, rows, viewer)` — personal → family → name-derived default; `null` when there is no store to colour.
  - `groceryStoresSharingColour(name, names, rows, viewer)` — the twins on one swatch, so a collision is disclosed rather than prevented.
  - `STORE_COLOURS`, `isStoreColourKey`, `groceryStoreKey`, `defaultGroceryStoreColour` — the closed six-swatch palette and its key/default rules.
  - `groceriesColourOverrideKey`, `hasGroceryColourOverride`, `applyGroceryColourOverrides` — the optimistic colour map, keyed by scope AND store so one flip cannot re-label another scope's answer.
  - `GROCERY_SCOPE_FILTERS`, `groceryScopeFromParam`, `groceryScopeOf` — the one list's filter vocabulary and a row's own scope.
  - `matchesGrocerySearch(item, query)` — trim + lowercase, empty matches all, name OR any store.
  - `createGroceryApi(fetch)` — the browser client (kernel api client, K-07): `list`, `suggest`, `add`, `change`, `remove`, `colours`, `setColour`; typed from the contract, no UI state, no `fetch` in components.
- `index.server.ts`:
  - `listGroceryItems(ctx, actor, { scope })` — the open items of one scope, oldest first.
  - `suggestGroceryStore(ctx, actor, { scope, name })` — the remembered store, or `null`.
  - `createGroceryItem(ctx, actor, input)` — quick-add → a stored item (auto-filled store, trained memory).
  - `updateGroceryItem(ctx, actor, input)` — one use-case for check / uncheck / replace stores / move.
  - `deleteGroceryItem(ctx, actor, { id, scope })` — remove the row, keep Store Memory.
  - `listGroceryStoreColours(ctx, actor)` — every colour row the viewer can resolve against (`{ colours, palette }`).
  - `setGroceryStoreColour(ctx, actor, input)` — write or clear one store's colour in one scope.
  - `loadGroceriesPage(ctx, actor)` — the page's whole read in one call: the two item legs (`mine`, `family`) and the colour rows, each degrading to `[]`, plus the rail's own fields — `hasFamily` (drives the "Add to" Family option and the "No family yet…" line) and `viewer` (`userId`, `familyId`); mirrors the legacy load at `src/routes/(calendar)/calendar/groceries/+page.server.ts:13-29`.
  - Endpoints: `listGroceryItemsEndpoint`, `createGroceryItemEndpoint`, `updateGroceryItemEndpoint`, `deleteGroceryItemEndpoint`, `listGroceryColoursEndpoint`, `setGroceryColourEndpoint`.
- `ui/index.ts`:
  - `GroceryRow` — checkbox, name ×quantity, the Mine/Family badge, every store as its own coloured chip ("or" before alternates, primary ringed), edit/move/delete.
  - `GroceryGroup` — colour bar + dot, `<n> items · <total> total`, collision line, and the inline Colour picker with Everyone / Just me.
  - `GrocerySideRail` — scope chips with counts, search with its hint and clear button, quick-add with the visible "Add to" scope, the Store Memory chip and the `known-stores` datalist.
  - `GroceryCheckedRail` — what was checked off this session, struck through with its scope badge, unchecking on the scope it came from.
  - `StoreColoursCard` — every shop with its dot, a palette + Auto select per shop, one Everyone / Just me select, the collision line and the empty state.

**Deletion test.** Every export above hides a rule, not a body: `groupGroceryItems` would need the one-key convention and the three-tier colour merge re-pasted at each call site; `updateGroceryItem` would need scope resolution, the op switch and the memory training copied into the route; `loadGroceriesPage` would need three parallel legs and three fallbacks in `+page.server.ts`. Nothing here is a pass-through: no export only renames another, and the page-owned state (filter, search, toasts, optimistic overrides) lives in `groceries.state.svelte.ts`, not in exports.

## How to test

- Whole module: `npm run test:mod -- groceries` (add `--legacy` while legacy tests remain).
- Pure rules: `groceries.items.rules.test.ts`, `groceries.colours.rules.test.ts`, `groceries.scope.rules.test.ts` — tables of input → expected output, no setup.
- Database + repo: `groceries.repo.db.test.ts` with `rollbackTest` (needs Postgres: `docker start familycalendar-db`).
- Services: `groceries.service.db.test.ts` with `rollbackTest` + `testCtx({ db })`.
- HTTP contract: [groceries.http.db.test.ts](groceries.http.db.test.ts) pins status, full body and observable rows of every endpoint, in committed mode (`beforeEach(truncateAll)`) because the legacy handlers write through the `db` singleton.
- State: `groceries.state.test.ts` drives the runes class with a fake api and no DOM.
- UI: `ui/*.svelte.test.ts` render with props; the page itself is pinned by the visual check (`npm run visual:check -- groceries`).
- Fixtures: `groceries.fixtures.server.ts` (item / memory / colour / family builders).

## Invariants

Behaviour that must not change, each with its test that pins it (`file › test title`). Wire rules cite the golden test; internal rules cite the S3/S5 test that will pin them; layout and copy cite the S7 visual check.

### Auth and scope (wire)

- Every groceries route needs a signed-in user; signed out → `401 {"error":"Unauthorized"}` — `src/lib/server/utils/requireUser.ts:47-53` · pinned by golden `GET /api/groceries › answers 401 …` (each route has its own 401 test).
- `scope` is `mine` (`familyId` NULL) or `family` (the viewer's family from membership); absent, `all` or junk → `400 {"error":"scope must be mine or family"}`, and `scope=family` with no family gets the same 400 — `src/routes/api/groceries/+server.ts:20-27,31-32` · pinned by golden `GET /api/groceries › answers 400 "scope must be mine or family" …` and `› answers 400 for scope=family when the viewer has no family`.
- POST and PATCH carry `scope` in the BODY, DELETE in the QUERY; GET reads the QUERY string — `src/routes/api/groceries/[id]/+server.ts:42,77`, `src/routes/api/groceries/+server.ts:31` · pinned by golden `DELETE /api/groceries/[id] › answers 400 "scope must be mine or family" when ?scope is absent or junk` (question 2).

### Grocery Items

- Open = `checkedAt` NULL, `createdAt` ascending; Mine reads `userId` AND `familyId IS NULL`, Family reads `familyId` — `src/lib/server/db/actions/groceries.ts:121-136` · pinned by golden `GET /api/groceries › answers {items} with the open Mine items, oldest first` and `› answers the Family list only from the viewer's own family`.
- Quick-add parses an optional leading OR trailing 1–4 digit integer as the quantity; blank → `{ name: '', quantity: 1 }` — `src/lib/data/groceries.ts:16-24` · pinned by golden `POST /api/groceries › reads a leading quantity and a trailing quantity …` and by `groceries.items.rules.test.ts › parseGroceryQuickAdd`.
- Quantity is floored and clamped to at least 1 — `src/lib/server/db/actions/groceries.ts:98` · pinned by golden `POST /api/groceries › clamps a zero quantity up to 1`.
- History key = item name trimmed + lowercased, and a blank name is refused — `src/lib/data/groceries.ts:11-13`, `src/lib/server/db/actions/groceries.ts:95-96` · pinned by golden `POST /api/groceries › answers 400 "Name is required" …` and `groceries.items.rules.test.ts › normalizeGroceryName`.
- Stores are cleaned on every write: trimmed, blanks dropped, case-insensitively de-duplicated, first spelling and first position kept (`[0]` is the primary store) — `src/lib/server/db/actions/groceries.ts:76-87`, `src/lib/data/groceries.ts:90-102` · pinned by golden `POST /api/groceries › cleans the stores it is given …` and `PATCH /api/groceries/[id] › replaces the stores …`, plus `groceries.items.rules.test.ts › cleanGroceryStores`.
- Adding with NO stores auto-fills the single most-frequent Store Memory store and does not train memory; adding WITH stores trains memory instead (count + 1 for a case-insensitive match, else a new row at 1) — `src/lib/server/db/actions/groceries.ts:52-119` · pinned by goldens `POST /api/groceries › auto-fills the remembered store …` and `› cleans the stores it is given and trains Store Memory with them`.
- Store Memory is family-wide when the item is Family (rows keyed by `familyId`) and per-user when Mine (`familyId` NULL + `userId`); the suggestion is the highest count, ties → first row seen — `src/lib/server/db/actions/groceries.ts:18-50`, `src/lib/data/groceries.ts:27-37` · pinned by goldens `GET /api/groceries › answers {store} for a suggest read …`, `› picks the first store seen when the counts tie`, `POST /api/groceries › trains Family Store Memory under the family, not the user`.
- PATCH ops: `check` sets `checkedAt` (hides from the next GET), `uncheck` clears it, `stores` replaces the list and trains Store Memory from it, `move` re-owns the row to the mover (`userId`) and sets `familyId` to the target, so a Family item moved to Mine lands on the mover's list and Store Memory stays where it was trained — `src/lib/server/db/actions/groceries.ts:149-210` · pinned by goldens `PATCH /api/groceries/[id] › checks an item off …`, `› unchecks an item …`, `› moves a Family item to Mine and re-owns it to the mover`, `› moves a Mine item to the Family list`.
- Any op that is not one of the four, `stores` that is not an array, or a `target` that is not `mine`/`family` → `400 {"error":"op must be check, uncheck, stores, or move"}`; `move` to Family with no family → `400 {"error":"No family to move to"}` — `src/routes/api/groceries/[id]/+server.ts:55-60` · pinned by golden `PATCH /api/groceries/[id] › answers 400 for every op it cannot run` and `› answers 400 "No family to move to" without a family`.
- A row outside the requested scope (another person's, another family's, unknown) → `404 {"error":"Item not found"}`, on PATCH and DELETE — `src/routes/api/groceries/[id]/+server.ts:62,82`, `src/lib/server/db/actions/groceries.ts:137-147` · pinned by golden `PATCH /api/groceries/[id] › answers 404 for another person's Mine item`, `› answers 404 for another family's item`, `DELETE /api/groceries/[id] › answers 404 for another person's item …`.
- Delete removes the row and leaves Store Memory intact — `src/lib/server/db/actions/groceries.ts:202-210` · pinned by golden `DELETE /api/groceries/[id] › deletes a Mine item and keeps Store Memory`.
- `[id]` is the last path segment today, so a trailing slash answers `400 {"error":"Item ID required"}` — `src/routes/api/groceries/[id]/+server.ts:32,74` · pinned by golden `PATCH … › answers 400 "Item ID required" for a trailing slash` and `DELETE … › answers 400 "Item ID required" for a trailing slash` (question 1).
- `stores: []` is accepted and clears every store on the row — `src/lib/server/db/actions/groceries.ts:149-153` · pinned by golden `PATCH /api/groceries/[id] › accepts an empty store list …` (question 5).

### Store Colours

- The palette is a closed set of six curated swatches (terracotta, sky, sage, lilac, amber, slate); only declared keys are ever accepted, and the API sends `{key,label}` for each — `src/lib/data/groceries.ts:145-209` · pinned by golden `GET /api/groceries/colours › answers the viewer's own colour rows plus the palette` and `groceries.colours.rules.test.ts › isStoreColourKey`.
- Colour precedence is personal → family → name hash: the viewer's personal row wins over the viewer's family row, another member's personal row never applies, an undeclared colour is ignored, and no store / `Any store` resolves to `null` — `src/lib/data/groceries.ts:256-274` · pinned by `groceries.colours.rules.test.ts › resolveGroceryStoreColour`.
- The default is `hashName(storeKey(name)) % 6`: derived from the store NAME, so adding a store never repaints others; collisions are allowed and disclosed, never prevented — `src/lib/data/groceries.ts:232-236,276-289` · pinned by `groceries.colours.rules.test.ts › defaultGroceryStoreColour` and `› groceryStoresSharingColour`.
- Writes: personal → `familyId` NULL + the viewer's `userId`; family → requires a family (else `400 "No family to set a family colour on"`); `auto` deletes that ONE store's row in that scope; a blank store, `Any store` and a non-palette colour write nothing and answer `400 "That store or colour cannot take a colour"` — `src/lib/server/db/actions/groceries.ts:253-305`, `src/routes/api/groceries/colours/+server.ts:43-59` · pinned by goldens `PATCH /api/groceries/colours › writes the viewer's personal colour …`, `› updates the same personal row in place …`, `› answers 400 "No family to set a family colour on" without a family`, `› auto clears one store's personal colour and leaves the other`, `› auto clears the family row only when the scope is family`, `› answers 400 for a colour outside the declared palette`, `› answers 400 for a blank store and for the no-store group`.
- `scope` on the colour write is the COLOUR's own scope: anything but `family` writes the personal override — `src/routes/api/groceries/colours/+server.ts:46` · pinned by golden `PATCH /api/groceries/colours › treats any scope other than family as personal`.
- The colour read returns the viewer's personal rows plus the viewer's family's rows and nothing from another person's personal scope or another family — `src/lib/server/db/actions/groceries.ts:221-249` · pinned by golden `GET /api/groceries/colours › answers the viewer's own colour rows plus the palette` and `› answers only the viewer's personal rows when they have no family`.
- A family colour row records its writer's `userId`, a column the family tier never reads — `src/lib/server/db/actions/groceries.ts:289-305` · pinned by golden `GET /api/groceries/colours › answers the viewer's own colour rows plus the palette` (the family row carries `userId: other.id`) (question 3).
- One colour row per (family, storeKey) and one per (user, storeKey) where family is NULL, via partial unique indexes — `src/lib/server/db/schema.ts:1162-1171`, `sql/migrations/0000-baseline-tables.sql:532-533` · pinned by `groceries.repo.db.test.ts › upserts one row per scope key`.
- Optimistic overrides are keyed `scope:storeKey`, carry their own scope, replace a loaded row only in the same scope, and an unscoped legacy key is dropped — `src/lib/data/groceries.ts:306-380` · pinned by `groceries.colours.rules.test.ts › applyGroceryColourOverrides`.

### One list, a scope filter

- `GROCERY_SCOPE_FILTERS` is All / Family / Mine in that order; a junk or absent `?scope=` falls back to `all` (UI only, never the API) — `src/lib/data/groceries.ts:387-403` · pinned by `groceries.scope.rules.test.ts › groceryScopeFromParam`.
- A row's scope is a property of the row: `familyId` NULL is Mine, set is Family — `src/lib/data/groceries.ts:411-413` · pinned by `groceries.scope.rules.test.ts › groceryScopeOf`.
- Grouping is by `stores[0]` (fallback `Any store`), groups sorted alphabetically case-insensitively, items keep insertion order, and the group key is the trim+lowercase `storeKey` — `src/lib/data/groceries.ts:104-129` · pinned by `groceries.colours.rules.test.ts › groupGroceryItems`.
- Search trims + lowercases, an empty query matches everything, and matches the item name OR any of its stores — `src/lib/data/groceries.ts:421-431` · pinned by `groceries.items.rules.test.ts › matchesGrocerySearch`.

### Page

- An unauthenticated visitor is redirected to `/login` (302) — `src/routes/(calendar)/calendar/groceries/+page.server.ts:7-9` · pinned by `groceries.service.db.test.ts › loadGroceriesPage redirects a signed-out viewer`.
- The page loader fetches Mine + Family + colour rows together, each leg degrading to `[]` rather than failing the page — `src/routes/(calendar)/calendar/groceries/+page.server.ts:13-29` · pinned by `groceries.service.db.test.ts › loadGroceriesPage degrades a failed leg to []`.
- Layout is one column below 950px and `21rem + 1fr` at/above it — `src/routes/(calendar)/calendar/groceries/+page.svelte:454-459` · pinned by the S7 visual check and the #074 320px no-overflow check.
- Picking a filter that names one scope also points the add form at that scope, so the two cannot disagree; with no family and a non-Mine filter the rail says "No family yet — join or create one to use the shared list." — `src/routes/(calendar)/calendar/groceries/+page.svelte:481-490` · pinned by `groceries.state.test.ts › selecting a scope filter follows into the add form` and the S7 visual check.
- The rail keeps the scope chips with per-scope counts, the search box with its "Searching “…" hint and clear button, the quick-add field with the explicit "Add to" select (Family only when there is a family), the Store Memory suggestion chip and the `known-stores` datalist — `src/routes/(calendar)/calendar/groceries/+page.svelte:466-608` · pinned by `ui/GrocerySideRail.svelte.test.ts` and the S7 visual check.
- The checked-off rail appears only after something is checked this session; each entry is struck through, carries its Mine/Family badge, and unchecks on the scope the item came from — `src/routes/(calendar)/calendar/groceries/+page.svelte:614-616` · pinned by `ui/GroceryCheckedRail.svelte.test.ts`.
- The store-colours card lists every shop with its dot, a per-shop palette + Auto select, one Everyone / Just me select, a "shares <colour> with …" line, and an empty state explaining a shop appears once typed — `src/routes/(calendar)/calendar/groceries/+page.svelte:654-690` · pinned by `ui/StoreColoursCard.svelte.test.ts` and the S7 visual check.
- The group header carries the colour bar + dot, `<n> items · <total> total`, the collision line and a "Colour" button opening an inline picker with Everyone / Just me and "Done" — `src/routes/(calendar)/calendar/groceries/+page.svelte:768-830` · pinned by `ui/GroceryGroup.svelte.test.ts`.
- A row is a checkbox, `name ×quantity`, the scope badge in WORDS (a colour means "which shop", never "which scope"), every store as its own coloured chip with "or" before alternates, the primary additionally marked by a filled dot and a heavier ring, plus edit / move / delete and the inline comma-separated store editor — `src/routes/(calendar)/calendar/groceries/+page.svelte:835-900` · pinned by `ui/GroceryRow.svelte.test.ts`.
- Toast copy set: `Added "<input>" to Mine|Family[ — <suggested store>].`, `Checked off "<name>".` (+ Undo), `Put "<name>" back on the list.`, `Stores updated for "<name>".`, `Moved "<name>" to Mine|Family.`, `Removed "<name>" — store memory kept.`, `<store> is now <Colour>[ (just you)].`, `<store> is back to its own default colour.` — `src/routes/(calendar)/calendar/groceries/+page.svelte:217-218,310,341,366,390,415,435` · pinned by `groceries.state.test.ts › toast copy` (question 6).
- A refused request and a dead network read differently: `<what>. Try again.` vs `<what> — check your connection and try again.` — `src/routes/(calendar)/calendar/groceries/+page.svelte:251` · pinned by `groceries.state.test.ts › failure copy distinguishes a refused request from a dead network`.
- Empty states are per filter/search: "No items match “…”", "Your list is empty. Add the first item.", "The family list is empty. Add the first item.", "No family list yet — join or create a family to use the shared list.", "Both lists are empty. Add the first item." — `src/routes/(calendar)/calendar/groceries/+page.svelte:752-760` · pinned by the S7 visual check.
- Check-off is optimistic (row hidden before the ack) with a toast carrying Undo; failure restores the row and writes the error region — `src/routes/(calendar)/calendar/groceries/+page.svelte:325-360` · pinned by `groceries.state.test.ts › check-off is optimistic and rolls back on failure`.

## Depends on

- May import: kernel + identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks (public entries only).
- Owns tables: `groceryItems`, `groceryStoreMemory`, `groceryStoreColours`.
- Reads (join only): none.
- Calls: the `family` domain's family-id-for-actor service — the only thing this module needs from another domain, because membership is family's rule and the API's `scope` resolution depends on it.
- Called by: the groceries page route (`src/routes/(calendar)/calendar/groceries/*`), the `/api/groceries*` route files (wiring only), the `dayDashboard` screen for the Groceries card, and `meals` later if it reuses Store Memory.
