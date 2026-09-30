# 081 — Dashboard: groceries replaces the parked meals card

Status: done

Source: `app-ui/dashboard.html` review, meals marked **bad** — "remove for now.
add groceries here".

**Blocked by:** None (can start immediately).

## Needs doing

- [x] The dashboard has a groceries card: what is on the list, how many items
      are still open, and the stores it spans.
- [x] The card links into the groceries page, filtered to the relevant scope.
- [x] The parked meals card is gone from the dashboard prototype, and the
      prototype's copy about meals being half-wired stops claiming a card that
      no longer exists.
- [x] A dashboard card that has nothing to show says so and stays quiet, rather
      than rendering an empty box.
- [x] Tests for the card's populated, empty and hidden states; the dashboard
      module suite covers it as a module the family can switch off.

## Done

- `src/lib/dashboardModules.ts` — new `groceries` module, `scope: 'family'`,
  `band: 'card'`. A family admin can master-switch it off; each member can hide
  it for themself. The family page picks the row up with no edit (it renders
  `FAMILY_DASHBOARD_MODULES`).
- `src/lib/components/dashboard/GroceriesCard.svelte` (new) — one line per
  scope (Family first), open count, store chips, the first three names and
  "+N more". Store chips come from the list page's own
  `groupGroceriesByStore`, so "Any store" means the same thing in both places.
  Each scope label is a link to `/calendar/groceries?scope=…`.
  Empty reads "Nothing on the list yet." + a link — no empty box, no "0 open".
- `src/lib/components/dashboard/DayDashboard.svelte` — card mounted in the card
  band, gated on `visible('groceries')`.
- `src/routes/(calendar)/calendar/dashboard/+page.server.ts` — a `groceriesLeg`
  folded into the existing streamed `dashboardData` batch.
- `prototypes/app-ui/dashboard.html` — the Meals slot in the band now carries
  Groceries; the "081 had not landed" note is corrected. `spacing-check` and
  `render-check` clean.

### Queries

Two fixed reads, issued together in one `Promise.all` inside the streamed leg
(`getOpenGroceries` for the family scope, and for the viewer's own) — never one
per item. Zero queries when `modules.groceries` is false, and one when the
viewer has no family. A failure degrades to an empty list, not a 500.

### Tests (red first, then green)

- `src/lib/components/dashboard/GroceriesCard.svelte.test.ts` (new, 11) —
  counts, store chips, "+2 more", both scoped links, quiet empty state, no
  family ⇒ Mine only, no store ⇒ "Any store", chips wrap at 320px.
- `src/lib/components/dashboard/DayDashboard.svelte.test.ts` (+4) — mounted,
  saved hidden state, family master switch off, and `hasFamily` threading.
- `src/lib/dashboardModules.test.ts` (+2) and
  `src/lib/server/db/actions/dashboardModules.test.ts` (+4) — the module
  suite: canonical id, family-scoped, family-off beats a member's hide.

## Notes

- The meals table, its API and its card are parked in place by user directive;
  this removes the *dashboard prototype's* copy of the parked card. Do not
  delete the parked code. **Untouched: `MealsCard.svelte`, `/api/meals`, the
  `meals` module entry, the meals table.**
- The account page still shows a Meals toggle that switches nothing. That is
  its own ticket if it is still true after this lands.

### Left undone, on purpose

- The groceries page ignores `?scope=`: `groceries/+page.svelte:18` hardcodes
  `let tab: Scope = 'family'`. The card emits the correctly-filtered URL, but
  the page will not honour it — a "Mine →" link lands on the Family tab. That
  file is on this lane's do-not-touch list, so it is flagged, not fixed. It is
  a two-line change: read `page.url.searchParams.get('scope')` into `tab`.
