# Port sheet: meals

**domain** · rank 13 · port #11 · home: `src/lib/domains/meals/` · README after the port: `src/lib/domains/meals/README.md` (written in S1)

PARKED (meals parked by owner). Owner answer [Q-002](../questions.md): delete-only. The endpoint, card and queries go; the table and the module id stay.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse, sponsored.
- **Owns tables:** `meals`.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [x] Delete-only ([Q-002](../questions.md)): `/api/meals`, `MealsCard` (+ test) and the meal queries (+ test) removed; census 100%. S1–S7 and S9 don't apply: there is no v2 module folder. The `meals` table and the Dashboard Module id stay.

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- DELETE-ONLY (Q-002). Remove `src/routes/api/meals/+server.ts`, `src/lib/components/dashboard/MealsCard.svelte` with its test, and `src/lib/server/db/actions/meals.ts` with its test. No golden: deleting the route is owner-approved. Keep the `meals` table (no DDL) and the `meals` Dashboard Module id (`src/lib/dashboardModules.ts`), so `/api/dashboard` and the family switches don't change; `UNMOUNTED_MODULES` keeps its switch off `/account`.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface

All routes are family-scoped through `requireUserJson` (401 `{"error":"Unauthorized"}` when signed out); `familyId` always comes from the caller's membership, never from the request body.

| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/meals` | GET | signed-in | `?date` REQUIRED as a strict `YYYY-MM-DD` key; no body | 200 `{meals: Meal[]}` (oldest first); no family → 200 `{meals: []}` | 400 `date is required as YYYY-MM-DD`; 500 `Failed to fetch meals` | `src/routes/api/meals/+server.ts:17-35` |
| `/api/meals` | POST | signed-in | JSON `{date, kind, label}`; all three required; `kind` ∈ breakfast \| lunch \| dinner \| snack exactly; `label` non-blank after trim | 201 `{success:true, meal}` | 403 `No family`; 400 `Invalid JSON body`; 400 `date is required as YYYY-MM-DD`; 400 `kind must be breakfast, lunch, dinner, or snack`; 400 `label is required`; 500 `Failed to create meal` | `src/routes/api/meals/+server.ts:42-81` |
| `/api/meals` | DELETE | signed-in | JSON `{id}`; id required; row must belong to the caller's family | 200 `{success:true}` | 403 `No family`; 400 `Invalid JSON body`; 400 `id is required`; 404 `Meal not found`; 500 `Failed to delete meal` | `src/routes/api/meals/+server.ts:84-113` |

### Rules the module must keep

- `familyId` is resolved from membership on every verb and is never read from the body, so a caller cannot write into another family — `src/routes/api/meals/+server.ts:14-15, 21, 45, 88`
- Reading with no family is an empty meal list, not an error; writing with no family is `403 No family` — `src/routes/api/meals/+server.ts:22, 47, 89`
- Meal kinds are a closed, case-sensitive set: `breakfast`, `lunch`, `dinner`, `snack`; `brunch`, `LUNCH`, `'breakfast '` and `''` are rejected — `src/lib/server/db/actions/meals.ts:5-12` · test: `src/lib/server/db/actions/meals.test.ts` › "rejects unknown kinds"
- A meal date is a strict zero-padded day key `^\d{4}-\d{2}-\d{2}$`; `2026-8-30`, an ISO timestamp, `08/30/2026`, `''` and `today` are all rejected — `src/lib/server/db/actions/meals.ts:14-17` · test: `src/lib/server/db/actions/meals.test.ts` › "rejects anything that is not a zero-padded date key"
- A day's meals read oldest first by `createdAt` — `src/lib/server/db/actions/meals.ts:19-25`
- `addMeal` re-validates kind + date and trims the label, returning `null` instead of writing garbage; `createdBy` is the caller — `src/lib/server/db/actions/meals.ts:29-52`, `src/routes/api/meals/+server.ts:71`
- Delete is scoped to `(id, familyId)` and reports whether a row was removed, so another family's meal is indistinguishable from a missing one (the route answers `404 Meal not found` for both) — `src/lib/server/db/actions/meals.ts:54-60`, `src/routes/api/meals/+server.ts:102-104`
- The dashboard module id stays `meals` (`scope: 'family'`, label "Meals", meaning "Show the family meal plan.") — `src/lib/dashboardModules.ts:33`

### Page and UI behaviour worth keeping

- MealsCard groups rows into Breakfast / Lunch / Dinner / Snack in that fixed order and renders only the kinds that have items — `src/lib/components/dashboard/MealsCard.svelte:10-28`
- The add field's placeholder follows the selected kind ("What's for lunch?"); the kind select defaults to Dinner — `src/lib/components/dashboard/MealsCard.svelte:19-22` · test: `src/lib/components/dashboard/MealsCard.svelte.test.ts` › "follows the selected meal kind"
- Empty state reads "No meals for this day"; the add button is disabled while the label is blank — `src/lib/components/dashboard/MealsCard.svelte:112-121, 105-110`
- Add/remove post to `/api/meals`, then `invalidateAll()`; toasts: `<label> added to <Kind>.`, `<Meal> removed.`, and failure copy `Couldn't add <label> — try again.` / `… — check your connection.` — `src/lib/components/dashboard/MealsCard.svelte:31-79`
- The remove button is hover-revealed on fine pointers, disabled for the row in flight, and carries `aria-label="Remove <label>"` — `src/lib/components/dashboard/MealsCard.svelte:137-165`

### Probably accidental (candidates to drop, owner to confirm)

- `MealsCard` has no importer and is rendered on no page (not in `DayDashboard` or the dashboard route), so the `meals` master switch enables a card that does not exist — `src/lib/components/dashboard/MealsCard.svelte:1-5`, `src/lib/dashboardModules.ts:33` — parked, unwired UI
- GET answers `200 {meals:[]}` without a family while POST/DELETE answer `403 No family`; one contract would be simpler for the Android client — `src/routes/api/meals/+server.ts:22, 47, 89` — inconsistent contract
- DELETE takes the id in the JSON body rather than the path, and both 500 handlers rebuild the path with `new URL(request.url).pathname` instead of the already-parsed `url` — `src/routes/api/meals/+server.ts:91-99, 75-80, 107-112` — shape/implementation artifact
- `addMeal` repeats the route's kind/date/label validation, so its `null` return is unreachable through HTTP and would surface as `201 {meal:null}` — `src/lib/server/db/actions/meals.ts:38-42`, `src/routes/api/meals/+server.ts:60-72` — duplicated validation, dead branch
- `meals.createdBy` is nullable in the schema but always written — `src/lib/server/db/schema.ts:366` — column allows a state the app never produces
<!-- inventory:end -->

## Carry-over tickets

None.

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# meals: 100% ported

legacy source files left (0/0, 0 LOC):

route files not yet wiring-only (0/0):

legacy test files left (0/0) — reference only, kinds explained in docs/architecture/testing.md:
```
<!-- census:end -->
