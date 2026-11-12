# Port sheet: groceries

**domain** · rank 10 · port #10 · home: `src/lib/domains/groceries/` · README after the port: `src/lib/domains/groceries/README.md` (written in S1)

Grocery List (one list, scope filter), Grocery Items, Store Memory, Store Colours.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks.
- **Owns tables:** `groceryItems`, `groceryStoreMemory`, `groceryStoreColours`.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `ffe9c94`
- [ ] S3 contract + rules
- [ ] S4 repo (+ fixtures)
- [ ] S5 service
- [ ] S6 http + route wiring (goldens unchanged since S2)
- [ ] S7 UI rebuild (rules, api, state, components, screen) + visual check
- [ ] S8 rewire importers, delete legacy code and legacy tests
- [ ] S9 README final, census --write, gate:push, ledger done

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- One list; scope filter All / Family / Mine (`family_id` NULL = Mine); open = `checkedAt` NULL, oldest first; history key = trim + lowercase.
- Stores are ordered, `[0]` is the primary group; `uniqueStores` is case-insensitive, first spelling wins (each_key_duplicate crash fix).
- Store Memory is family-wide, auto-fills the most frequent store, survives check-off and delete.
- Store Colour precedence: personal > family > name hash; overrides keyed by (store, scope); collisions allowed and disclosed; one name hash (#115).
- Android uses `/api/groceries` (GET with `scope`/`suggest`, POST), `/[id]` PATCH/DELETE (`?scope`), `/colours` GET/PATCH.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface

All routes need a signed-in user via `requireUserJson`; missing session → 401 `{"error":"Unauthorized"}` (`src/lib/server/utils/requireUser.ts:48-53`). "scope" is always `mine` (`familyId` NULL) or `family` (resolved from membership); `all` exists only in the UI.

| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/groceries` | GET | signed-in | `?scope` REQUIRED, exactly `mine` or `family` (absent or junk → 400); `?suggest` + `?name` selects the Store Memory read (`?name` ignored without `suggest`) | 200 `{items: GroceryItem[]}` (open, oldest first) or `{store: string \| null}` | 400 `scope must be mine or family`; 500 `Failed to fetch groceries` | `src/routes/api/groceries/+server.ts:27-43` |
| `/api/groceries` | POST | signed-in | JSON `{scope, input, stores?}`: `scope` required; `input` is quick-add text; `stores` optional string[] (non-strings filtered out) | 201 `{item}` | 400 `Invalid JSON body`; 400 `scope must be mine or family`; 400 `Name is required`; 500 `Failed to add item` | `src/routes/api/groceries/+server.ts:46-75` |
| `/api/groceries/[id]` | PATCH | signed-in | JSON `{scope, op, stores?, target?}`; `scope` comes from the BODY; `op` ∈ `check` \| `uncheck` \| `stores` \| `move`; `stores` required for `stores`; `target` ∈ `mine` \| `family` for `move` | 200 `{ok:true}` | 400 `Item ID required`; 400 `Invalid JSON body`; 400 `scope must be mine or family`; 400 `No family to move to`; 400 `op must be check, uncheck, stores, or move`; 404 `Item not found`; 500 `Failed to update item` | `src/routes/api/groceries/[id]/+server.ts:28-67` |
| `/api/groceries/[id]` | DELETE | signed-in | `?scope` REQUIRED (QUERY, not body); no body | 200 `{ok:true}` | 400 `Item ID required`; 400 `scope must be mine or family`; 404 `Item not found`; 500 `Failed to delete item` | `src/routes/api/groceries/[id]/+server.ts:70-87` |
| `/api/groceries/colours` | GET | signed-in | none | 200 `{colours: [{storeKey,color,userId,familyId}], palette: [{key,label}]}` | 500 `Failed to fetch store colours` | `src/routes/api/groceries/colours/+server.ts:20-30` |
| `/api/groceries/colours` | PATCH | signed-in | JSON `{store, color, scope?}`; `scope` anything but `family` means personal; `color` = declared swatch key or `auto` | 200 `{ok:true}` | 400 `Invalid JSON body`; 400 `store and color are required`; 400 `No family to set a family colour on`; 400 `That store or colour cannot take a colour`; 500 `Failed to set the colour` | `src/routes/api/groceries/colours/+server.ts:33-62` |

### Rules the module must keep

- One list with a scope FILTER, not tabs: `SCOPE_FILTERS` is All / Family / Mine in that order, and a junk or absent `?scope=` falls back to `all` — `src/lib/data/groceries.ts:387-403` · test: `src/lib/data/groceries.test.ts` › "opens on \"all\" — the page shows everything rather than one scope to switch away from", "only accepts a real scope, so a junk ?scope= falls back to \"all\""
- A row's scope is a property of the row, never of which list loaded it: `familyId` NULL = Mine, set = Family — `src/lib/data/groceries.ts:411-413` · test: `src/lib/data/groceries.test.ts` › "reads the scope off the row itself, not off which list it was loaded from"
- Open = `checkedAt` NULL, ordered `createdAt` ascending; Family reads by `familyId`, Mine reads by `userId` AND `familyId IS NULL` — `src/lib/server/db/actions/groceries.ts:121-136`
- History key = item name trimmed + lowercased; a blank name is refused (action returns null) — `src/lib/data/groceries.ts:11-13`, `src/lib/server/db/actions/groceries.ts:89-96` · test: `src/lib/data/groceries.test.ts` › "normalizeGroceryName" (`  Oat Milk  ` → `oat milk`)
- Quick-add parses an optional leading OR trailing 1–4 digit integer as quantity, the rest as name; blank → `{name:'', quantity:1}` — `src/lib/data/groceries.ts:16-24` · test: `src/lib/data/groceries.test.ts` › "parseGroceryQuickAdd" (`milk 2`, `2 milk`, `  Eggs   6  `)
- Quantity is floored and clamped to ≥ 1 — `src/lib/server/db/actions/groceries.ts:97`
- Stores are cleaned on every write: trimmed, blank dropped, case-insensitively de-duplicated, first spelling kept — `src/lib/server/db/actions/groceries.ts:78-87`
- Adding with NO stores auto-fills the single most-frequent Store Memory store for that name; adding WITH stores trains Store Memory instead — `src/lib/server/db/actions/groceries.ts:100-110`
- Store Memory is family-wide when the item is Family (rows keyed by `familyId`), per-user when Mine (`familyId` NULL + `userId`); suggestion = highest count, ties → first row seen — `src/lib/server/db/actions/groceries.ts:18-47`, `src/lib/data/groceries.ts:27-37` · test: `src/lib/data/groceries.test.ts` › "picks the highest-count store, ties -> first seen"
- Training increments the count for a case-insensitive existing store, else inserts count 1 — `src/lib/server/db/actions/groceries.ts:48-75`
- Editing stores replaces the list AND trains Store Memory from the new list — `src/lib/server/db/actions/groceries.ts:149-167`
- Moving an item re-owns it to the mover (`userId` = target scope's viewer), so a Family item moved to Mine lands on the mover's list, not the adder's; Store Memory is not moved — `src/lib/server/db/actions/groceries.ts:163-182` · test: `src/lib/server/db/actions/groceries.test.ts` › "moving a family item to Mine re-owns it to the viewer"
- Check-off sets `checkedAt` (hides), uncheck clears it (revives), delete removes the row and leaves Store Memory intact — `src/lib/server/db/actions/groceries.ts:184-210`
- `uniqueStores` de-dupes case-insensitively, trims, drops blanks, keeps the first spelling and the first position (position 0 is the primary store) — `src/lib/data/groceries.ts:90-102` · test: `src/lib/data/groceries.test.ts` › "treats case as the same shop, and keeps the first spelling", "keeps the first store in first position, because it is the primary one"
- Grouping is by `stores[0]` (fallback `Any store`), groups sorted alphabetically case-insensitively, items keep insertion order; the group key is `storeKey` = trim + lowercase — `src/lib/data/groceries.ts:104-129` · test: `src/lib/data/groceries.test.ts` › "sorts Store groups alphabetically, not by insertion order", "group keys use the ONE convention: trimmed, so \" Costco \" joins \"Costco\""
- Store Colour palette is a closed set of six curated swatches (terracotta, sky, sage, lilac, amber, slate); only declared keys are ever accepted — `src/lib/data/groceries.ts:145-207` · test: `src/lib/data/groceries.test.ts` › "is a small curated set, never a free colour field", "accepts only declared keys"
- Colour precedence: the viewer's personal row → the viewer's family's row → a name-derived default; another member's personal row never applies; an undeclared colour is ignored; no store / `Any store` resolves to null — `src/lib/data/groceries.ts:256-274` · test: `src/lib/data/groceries.test.ts` › "tier 1 — a personal row wins over the family row", "another member's personal row is not this viewer's", "never tints the no-store group — an absent store is not a shop", "ignores a colour the palette does not declare rather than rendering it"
- The default colour is `hashName(storeKey(name)) % 6` — name-derived, so adding a store never repaints others; collisions are allowed and disclosed, never prevented — `src/lib/data/groceries.ts:232-236`, `src/lib/data/groceries.ts:276-289` · test: `src/lib/data/groceries.test.ts` › "derives from the store NAME, so adding a store never repaints the others", "names the other stores on the same swatch so a collision is disclosed"
- Colour writes: personal → `familyId` NULL + viewer `userId`; family → requires a family (otherwise false, nothing written); `auto` deletes that ONE store's row in that scope; blank store, `Any store` and non-palette colours write nothing — `src/lib/server/db/actions/groceries.ts:253-305` · test: `src/lib/server/db/actions/groceries.test.ts` › "refuses the family scope when the user has no family", "clearing one personal colour scopes the delete to that store only", "rejects a colour outside the declared palette", "refuses to clear the no-store group — it has no colour to carry"
- One colour row per (family, storeKey) and one per (user, storeKey) where family is NULL, via partial unique indexes — `src/lib/server/db/schema.ts:1147-1172`
- Optimistic colour overrides are keyed `scope:storeKey` and carry their own scope; an override replaces a loaded row only in the same scope, and an unscoped legacy key is dropped — `src/lib/data/groceries.ts:306-380` · test: `src/lib/data/groceries.test.ts` › "keys an override by its scope AND its store, never the store alone", "is not re-labelled by anything the page can change afterwards", "lets a loader row be replaced by an override in the SAME scope only"
- Search trims + lowercases, an empty query matches everything, and matches the item name OR any of its stores — `src/lib/data/groceries.ts:421-431` · test: `src/lib/data/groceries.test.ts` › "matches on the store, which the tasks-page idiom does too", "an empty query matches everything, exactly like the tasks-page helper"
- The page loader fetches Mine + Family lists and the colour rows together, each leg degrading to `[]` on error rather than failing the page — `src/routes/(calendar)/calendar/groceries/+page.server.ts:14-33`

### Page and UI behaviour worth keeping

- Unauthenticated visitor is redirected to `/login` (302) — `src/routes/(calendar)/calendar/groceries/+page.server.ts:6-9`
- Side rail: scope chips with per-scope counts, a search box ("Searching “…”" hint + clear button), a quick-add field, an explicit visible "Add to" scope select (Family option only when the user has a family), a Store Memory suggestion chip under the field, and a `known-stores` datalist — `src/routes/(calendar)/calendar/groceries/+page.svelte:466-608`
- Checked-off rail exists only after something is checked this session; each entry is struck through, carries a Mine/Family badge, and unchecks on the scope the item came from — `src/routes/(calendar)/calendar/groceries/+page.svelte:613-640`
- Store colours card lists every shop from BOTH scopes with its dot, a per-shop select (palette + Auto), an Everyone / Just me select for the whole card, and a collision line ("shares <colour> with …"); empty state explains a shop appears once typed — `src/routes/(calendar)/calendar/groceries/+page.svelte:648-745`
- Group header: colour bar + dot, `<n> items · <total> total`, collision disclosure, and a "Colour" button opening an inline picker with Everyone / Just me radios and "Done" — `src/routes/(calendar)/calendar/groceries/+page.svelte:768-830`
- Row: checkbox, name ×quantity, Mine/Family badge in words, every store as its own coloured chip with the word "or" before alternates, the primary store additionally marked by a filled dot and a heavier ring, plus edit / move / delete icon buttons and an inline comma-separated store editor — `src/routes/(calendar)/calendar/groceries/+page.svelte:835-960`
- Check-off is optimistic (row hidden before the ack) with a toast carrying an Undo action; failure restores the row and writes the error region — `src/routes/(calendar)/calendar/groceries/+page.svelte:325-360`
- Toast copy set: `Added "<input>" to Mine|Family[ — <suggested store>].`, `Checked off "<name>".` (+ Undo), `Put "<name>" back on the list.`, `Stores updated for "<name>".`, `Moved "<name>" to Mine|Family.`, `Removed "<name>" — store memory kept.`, `<store> is now <Colour>[ (just you)].`, `<store> is back to its own default colour.` — `src/routes/(calendar)/calendar/groceries/+page.svelte:214-220, 309, 340, 366, 390, 414, 435`
- Failure copy distinguishes a refused request from a dead network: `<what>. Try again.` vs `<what> — check your connection and try again.` — `src/routes/(calendar)/calendar/groceries/+page.svelte:250-253`
- Empty states are per filter/search: "No items match “…”", "Your list is empty. Add the first item.", "The family list is empty…", "No family list yet…", "Both lists are empty. Add the first item." — `src/routes/(calendar)/calendar/groceries/+page.svelte:750-762`
- With no family and a non-Mine filter the page says "No family yet — join or create one to use the shared list." — `src/routes/(calendar)/calendar/groceries/+page.svelte:487-490`
- Layout is one column below 950px and `21rem + 1fr` at/above it — `src/routes/(calendar)/calendar/groceries/+page.svelte:459`
- Picking a filter that names one scope also points the add form at that scope, so the two cannot disagree — `src/routes/(calendar)/calendar/groceries/+page.svelte:481-486`

### Probably accidental (candidates to drop, owner to confirm)

- `[id]` is taken from `url.pathname.split('/').pop()` instead of the route param, so a trailing slash turns into `Item ID required` — `src/routes/api/groceries/[id]/+server.ts:32, 74` — implementation artifact
- Scope travels differently per verb (`body.scope` for PATCH, `?scope` for DELETE) — `src/routes/api/groceries/[id]/+server.ts:42, 77` — one contract would do
- Family colour rows store the writer's `userId`, a column the family tier never reads; every family flip rewrites it to the last writer — `src/lib/server/db/actions/groceries.ts:289-305` — unused ambiguity
- The route refuses a blank name before `addGroceryItem`, so the action's `null` (unreachable) would surface as `201 {item:null}` — `src/routes/api/groceries/+server.ts:60-71`, `src/lib/server/db/actions/groceries.ts:92-93` — dead branch
- The Store colours card's shop list is built from open items across both loaded lists, so a shop whose items are all checked off disappears from the card (its colour row survives) — `src/routes/(calendar)/calendar/groceries/+page.svelte:123-144` — read path narrower than the write path
- `hiddenIds` is a `Set` mutated then reassigned to itself (`hiddenIds = hiddenIds`) purely to trip Svelte reactivity at four call sites — `src/routes/(calendar)/calendar/groceries/+page.svelte:100, 332, 348, 358, 371` — implementation artifact
- The add toast appends the remembered store only when the user did not type one, even though the server may have auto-filled a different suggestion — `src/routes/(calendar)/calendar/groceries/+page.svelte:307-313` — cosmetic mismatch
- `setGroceryStores` accepts an empty list, which silently clears every store on a row (the row editor's Save can send one if the user empties the field) — `src/lib/server/db/actions/groceries.ts:149-153`, `src/routes/(calendar)/calendar/groceries/+page.svelte:380-388` — unvalidated edge
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#074](../../archive/issues/074-groceries-approved-layout.md) 320px no-overflow check needs a real browser. | DESIGN | keep markup; do not regress |
| [#086](../../archive/issues/086-migration-baseline-missing.md) Verify the #115 store-colour scope-key question; retire stale bills SQL files in sql/ root… | BEHAVIOUR | FIX-IN-PORT: golden + repo tests pin personal-vs-family colour keys; SQL file cleanup stays a ticket |

## Plan

Everything below lives in `src/lib/domains/groceries/` unless it says otherwise. `index.ts`, `index.server.ts` and `ui/index.ts` are the only entries; they re-export the files below.

| file | role | what goes in it |
|---|---|---|
| `groceries.contract.ts` | contract | zod schemas + types for the wire the goldens pin: `GroceryListQuery` (`scope`, `suggest`, `name`), `GroceryAddBody`, `GroceryChangeBody` (op union, `stores` array, `target`), `GroceryColourBody`, the item/colour/palette response shapes, and the page model. Legacy wording (`Invalid JSON body`, `scope must be mine or family`, `Name is required`, `Item ID required`, `Item not found`, `op must be …`, `No family to move to`, `store and color are required`, `No family to set a family colour on`, `That store or colour cannot take a colour`) stays as the endpoint `failMessage`s / `invalid()` messages, not as schema text. |
| `groceries.items.rules.ts` | rules | `parseGroceryQuickAdd`, `normalizeGroceryName`, `cleanGroceryStores` (the one clean + dedupe home), `mostFrequentGroceryStore`, `matchesGrocerySearch`, `NO_STORE_LABEL`. |
| `groceries.colours.rules.ts` | rules | `STORE_COLOURS`, `isStoreColourKey`, `groceryStoreKey`, `defaultGroceryStoreColour` (`hashName(key) % 6`), `resolveGroceryStoreColour` (personal → family → name), `groupGroceryItems` (grouping + colour as one concept, #115), `groceryStoresSharingColour`, `groceriesColourOverrideKey`, `hasGroceryColourOverride`, `applyGroceryColourOverrides`. |
| `groceries.scope.rules.ts` | rules | `GROCERY_SCOPE_FILTERS` (All / Family / Mine), `groceryScopeFromParam`, `groceryScopeOf`. |
| `groceries.repo.server.ts` | repo | `listOpenGroceryItems(db, scope)`, `insertGroceryItem`, `setGroceryItemStores`, `moveGroceryItem`, `checkGroceryItem`, `uncheckGroceryItem`, `removeGroceryItem` (each scoped by `userId`/`familyId`), `listGroceryMemoryRows`, `incrementGroceryMemory`, `insertGroceryMemory`, `listGroceryColourRows(db, viewer)`, `upsertGroceryColour`, `deleteGroceryColour`. `db: Db` first, no authorization. |
| `groceries.fixtures.server.ts` | fixtures | item / memory / colour / family builders over `seedUser` + `uniqueSuffix`. |
| `groceries.service.server.ts` | service | the seven use-cases plus `loadGroceriesPage`: scope resolution through `family`, the add (quick-add → clean → auto-fill or train memory), the op switch, move re-owning, colour write validation, and the page's three legs degraded to `[]`. |
| `groceries.http.server.ts` | http | six `endpoint()` handlers reproducing the golden wire (`user` auth, no rate limit today, 201 on add, scope in body for PATCH / query for DELETE) and `pageLoad()` for `loadGroceriesPage`. |
| `groceries.api.ts` | api | `createGroceryApi(fetch)`: `list`, `suggest`, `add`, `change`, `remove`, `colours`, `setColour` on the kernel api client, typed from the contract. |
| `groceries.state.svelte.ts` | state | the page's runes class: filter, search, quick-add + "Add to" scope, optimistic check-off with rollback and Undo, optimistic store edits, optimistic colour overrides keyed `scope:storeKey`, error region and toast copy. |
| `ui/GroceryRow.svelte` | ui | checkbox, name ×quantity, Mine/Family badge, coloured store chips with "or" and the primary ring, edit/move/delete, inline store editor. |
| `ui/GroceryGroup.svelte` | ui | colour bar + dot, `<n> items · <total> total`, collision line, inline Colour picker (Everyone / Just me, Done). |
| `ui/GrocerySideRail.svelte` | ui | scope chips + counts, search + hint + clear, quick-add with the visible "Add to" select, Store Memory chip, `known-stores` datalist. |
| `ui/GroceryCheckedRail.svelte` | ui | the checked-off-this-session list with its badges and uncheck. |
| `ui/StoreColoursCard.svelte` | ui | one row per shop with its dot, palette + Auto, Everyone / Just me, collision line, empty state. |
| `ui/index.ts` | entry | re-exports the five components. |
| `groceries.items.rules.test.ts` | test | tables for quick-add, name key, store cleaning, memory pick, search. |
| `groceries.colours.rules.test.ts` | test | palette guard, default hash, three-tier precedence, collision disclosure, grouping, overrides. |
| `groceries.scope.rules.test.ts` | test | filter vocabulary, `?scope=` fallback, row scope. |
| `groceries.repo.db.test.ts` | test | `rollbackTest` per query with a filter/order/upsert; one row per scope key. |
| `groceries.service.db.test.ts` | test | every IO invariant above, titled after the rule; page-leg degradation and the `/login` redirect. |
| `groceries.state.test.ts` | test | filter→add-form, optimistic check-off + rollback, colour overrides, toast and failure copy. |
| `groceries.http.db.test.ts` | test | **already written in S2** — do not edit it; S6 must make it pass unchanged (except the #086 fix-in-port test, see Notes). |
| `ui/*.svelte.test.ts` | test | one per component. |

Page routes stay in `src/routes/` and become wiring only: `src/routes/api/groceries/**/+server.ts` re-export the handlers, `src/routes/(calendar)/calendar/groceries/+page.server.ts` re-exports `loadGroceriesPage`, and `+page.svelte` composes the state class + components.

Where each legacy export goes:

| legacy | destination |
|---|---|
| `normalizeGroceryName`, `parseGroceryQuickAdd`, `mostFrequentStore`, `uniqueStores`, `matchesGrocerySearch`, `NO_STORE_LABEL` | `groceries.items.rules.ts` (`uniqueStores` folds into `cleanGroceryStores`) |
| `STORE_COLOURS`, `isStoreColourKey`, `storeKey`, `defaultStoreColourKey`, `colourFor`, `storesSharingColour`, `groupGroceriesByStore`, `groceryStoreGroups`, `colourOverrideKey`, `hasColourOverride`, `optimisticColourRow`, `withColourOverrides` | `groceries.colours.rules.ts` (grouping + colour stay ONE function) |
| `SCOPE_FILTERS`, `scopeFromParam`, `scopeOf` | `groceries.scope.rules.ts` |
| `memoryRows`, `trainMemory`, `cleanStores` | `groceries.repo.server.ts` + `groceries.items.rules.ts` (`cleanGroceryStores`) |
| `addGroceryItem`, `getOpenGroceries`, `setGroceryStores`, `moveGroceryItem`, `checkGroceryItem`, `uncheckGroceryItem`, `deleteGroceryItem` | `groceries.service.server.ts` (use-case) over `groceries.repo.server.ts` (query); `scopeFilter` dies into per-query scope filters |
| `getStoreColours`, `setStoreColour` | repo reads/writes + `groceries.service.server.ts` (`listGroceryStoreColours`, `setGroceryStoreColour`) |
| the page loader's `leg()` wrapper | `loadGroceriesPage` in the service |
| `requireUserJson` / `apiError` / `isString` in the three route files | kernel `endpoint()` (auth, parsing, error mapping, fault filing) |

## Notes

**Surprises found while verifying the inventory.**

- **The family Store Colour write is broken today (#086).** `setStoreColour` upserts with `on conflict ("family_id","store_key")` and no conflict predicate, but the only matching unique index is partial (`family_id IS NOT NULL`), so Postgres cannot infer it and the statement faults. Verified directly against the test Postgres with a temp-table probe: `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification`. So `PATCH /api/groceries/colours {scope:'family'}` answers 500 `Failed to set the colour` for every user with a family and writes nothing; the personal branch is fine (it passes `targetWhere: family_id IS NULL`) and both `auto` deletes are fine. The S2 golden pins today's 500 on purpose. **S6 must fix it in its own `rewrite(groceries): fix-in-port #086` commit and flip that one golden to `200 {ok:true}`** — that is the only permitted golden change.
- **There is no 403 on this wire.** Authorization is the scope filter itself: a row outside the requested scope (another person's Mine row, another family's row, an unknown id) is indistinguishable from a missing one and answers `404 {"error":"Item not found"}`; a family-scoped action without a family answers 400. So the goldens prove the wrong-person / wrong-family paths with 404s (a second user and a second family), not 403s, and the port must not start leaking existence.
- **Two reads rely on physical row order.** Store Memory (`memoryRows`) and the colour read (`getStoreColours`) have no `ORDER BY`, so "ties → first row seen" and the colour-row order are heap order today. The goldens pin the order produced by fresh inserts; S4 must not add an `ORDER BY` that reorders them without an owner decision (the tie rule needs one to be stable).
- The route refuses a blank name before `addGroceryItem`, so the action's `null` return is unreachable — dropped (internal dead branch; the port validates once in the contract).
- `hiddenIds = hiddenIds` in `+page.svelte` exists only to trip Svelte reactivity — dropped; the state class owns the set.
- `scope` really does travel differently per verb (PATCH body vs DELETE query) and the Android client sends exactly that; the goldens pin both (question 2). The `[id]` trailing-slash 400 is a `pathname.split('/')` artifact, but it is visible on the wire, so it is pinned and questioned (question 1).

**Decisions.**

- Grouping and colour stay ONE function (`groupGroceryItems`), and the store key is the trim+lowercase key at every layer — the #115 rule.
- `uniqueStores` and `cleanStores` become one rule (`cleanGroceryStores`) because they are the same rule applied on read and on write; keeping two homes is how the `each_key_duplicate` crash happened.
- The page has no form actions today (everything is `/api` + optimistic UI), so the module exposes a `pageLoad` and endpoints only; the state class keeps the optimistic/rollback behaviour.
- The colour palette travels on the `GET /colours` response (Android reads it nowhere but the page does), so it stays part of the wire.

**Questions for the owner.**

1. **Trailing slash on `/api/groceries/<id>/`.** Context: today the id is `url.pathname.split('/').pop()`, so a trailing slash answers `400 {"error":"Item ID required"}`. Options: (a) keep the 400 by rejecting an empty route param; (b) let the route 404. Recommendation: (a) — one line, keeps today's answer for a client that double-slashes.
2. **Scope per verb.** Context: PATCH takes `scope` in the body, DELETE in `?scope`, GET in `?scope`; Android sends each exactly. Options: (a) keep the asymmetry; (b) unify into the query (breaks the installed Android client). Recommendation: (a), note it in the contract.
3. **The family colour row's `userId`.** Context: the column is NOT NULL, so a family write records the writer, but the family tier never reads it — every flip rewrites it to the last writer. Options: (a) keep writing the actor and never read it; (b) read it for nothing; (c) drop the column (DDL, out of scope). Recommendation: (a), documented as "the writer, not the owner".
4. **The store-colours card's shop list.** Context: it is built from the open items across both loaded lists, so a shop whose items are all checked off disappears from the card although its colour row survives. Options: (a) keep today's read path; (b) feed the card from the colour rows too, so a shop with a colour is always offered. Recommendation: (b) after S7, as its own ticket — it is a visible improvement, not a port.
5. **`stores: []` clears every store.** Context: the row editor can post an empty list and the server accepts it, so a row loses all its stores (and its group). Options: (a) keep it (an empty field honestly means "no store"); (b) reject with 400. Recommendation: (a); the UI already treats the empty field as "no store".
6. **The add toast's store mismatch.** Context: the toast appends the remembered store only when the user typed none, even though the server may have auto-filled a different one. Options: (a) keep the legacy copy logic; (b) print the store the created item actually carries (the response has it). Recommendation: (b) — same copy shape, truthful value.
7. **#086 family colour upsert.** Context and recommendation in "Surprises" above: fix in port and flip the golden in its own commit. Owner approval needed only for the golden change; the wire intent (`Everyone` writes work) is already shown by the UI.

**Files kept for unported importers.** Both legacy source files must stay until the dashboard is rebuilt: `src/lib/components/dashboard/GroceriesCard.svelte` imports `groupGroceriesByStore` from `$lib/data/groceries`, and `src/lib/server/services/dashboardData.ts` imports `getOpenGroceries` from `$lib/server/db/actions/groceries`. S8 rewires those two importers at the module entries listed above (legacy may import v2) and then deletes the legacy files and their three legacy test files.

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# groceries: 0% ported

legacy source files left (2/2, 735 LOC):
  - src/lib/data/groceries.ts (430 LOC, model) importers: 5
  - src/lib/server/db/actions/groceries.ts (305 LOC, server) importers: 5

route files not yet wiring-only (5/5):
  - src/routes/(calendar)/calendar/groceries/+page.server.ts  /calendar/groceries
  - src/routes/(calendar)/calendar/groceries/+page.svelte  /calendar/groceries
      NOTE: Fat page: extract state into `<name>.state.svelte.ts` + pure rules; the screen component stays under ~250 lines.
  - src/routes/api/groceries/+server.ts  /api/groceries
  - src/routes/api/groceries/[id]/+server.ts  /api/groceries/[id]
  - src/routes/api/groceries/colours/+server.ts  /api/groceries/colours

legacy test files left (3/3) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/data/groceries.test.ts [pure, 52 tests]
  - src/lib/server/db/actions/groceries.test.ts [stub-db, 17 tests]
  - src/routes/(calendar)/calendar/groceries/page.svelte.test.ts [component, 67 tests]
```
<!-- census:end -->
