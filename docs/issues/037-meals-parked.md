# 037 — Meals parked (PAUSED — do not triage)

Status: done (parked; PAUSED — do not check this area for issues until the user unpauses it)

## Done

- Unmounted `MealsCard` from `DayDashboard.svelte` (import, `meals`/`dateKey`
  props, kids+meals grid block → kids only).
- Dashboard `+page.svelte` no longer passes `meals`/`dateKey`;
  `+page.server.ts` no longer loads meals (`getMealsByDate` import, `Meal`
  type, `dateKey`, `meals` payload all removed; `familyModulesVisible` no
  longer counts `modules.meals`).
- Parked in place, untouched: `MealsCard.svelte` (+ its test, still green),
  `src/routes/api/meals/+server.ts`, `actions/meals.ts` (+ tests), meals
  tables. No UI entry point remains; API reachable but unlinked.

## Needs doing (frozen while paused)

- Future meals sub-app section (page + nav) if unpaused.
