# 080 — Dashboard: the verse leaves the module band

Status: done

Source: `app-ui/dashboard.html` review, daily verse marked **bad** — "too big and
shouldn't be part of the dashboard section, should be above in the more
utils/info section".

**Blocked by:** None (can start immediately).

## Needs doing

- [x] The verse moves out of the toggleable dashboard module band into an
      info band above it, and gets smaller.
- [x] The verse's module switch changes meaning with it: it now controls
      whether the verse shows at all, not whether a band renders. Existing
      users' saved switch states keep working.
- [x] The info band is quiet: the verse is a reading, not a task.
- [x] The card's own tests stay green; the dashboard module suite covers the
      moved card's visibility.
- [x] The prototype's module band shows the verse above it, matching the app.

## Done

- `src/lib/dashboardModules.ts` — every module gains `band: 'info' | 'card'`
  and `meaning`. Verse is `band: 'info'`, **id unchanged**, so
  `isDashboardModule('verse')` and `composeModuleVisibility` still honour a
  saved hidden-list entry. New `INFO_DASHBOARD_MODULES` / `CARD_DASHBOARD_MODULES`
  and `verseIsVisible({ showDailyVerse, modules })`. Meaning lives here, once.
- `src/lib/components/dashboard/DashboardInfoBand.svelte` (new) — quiet strip:
  no card chrome, no heading, 13px verse, `break-words`, stacks at 320px.
  Renders nothing when there is no verse.
- `src/lib/components/dashboard/DayDashboard.svelte` — verse renders in the
  info band, above a new `dashboard-card-band` wrapper that holds every card.
  Still gated on `visible('verse')`.
- `src/routes/(calendar)/calendar/dashboard/+page.server.ts` — the verse fetch
  runs through `verseIsVisible`, so a hidden verse is not fetched at all.
- `src/lib/components/account/AccountCalendarSection.svelte` — one switch
  list, two headings: "Above your cards" and "Cards". Each row shows its
  `meaning`. Same form, same `module_<id>` names, same saved state.
- Prototype `prototypes/app-ui/dashboard.html` — verse leaves `.dash`, sits in
  a new `.info-band` above it; smaller type; the duplicated "Psalm 127:1"
  title/ref collapse into one. `spacing-check` and `render-check` clean.

### Tests (all red first, then green)

- `src/lib/dashboardModules.test.ts` (new, 13) — bands, id stability, and the
  saved-state pin: a persisted `userSettings` row with
  `hiddenDashboardModules: ['verse']` + `showDailyVerse: true` still hides the
  verse; a row with `['board']` does not; a row with `showDailyVerse: false`
  is hidden either way.
- `src/lib/components/dashboard/DayDashboard.svelte.test.ts` (new, 5) — verse
  in the info band, **outside** `dashboard-card-band` and above it; a saved
  `['verse']` compose leaves no band at all.
- `src/lib/components/dashboard/DashboardInfoBand.svelte.test.ts` (new, 6).
- `src/lib/components/account/AccountCalendarSection.svelte.test.ts` (+3) —
  band placement, the verse's meaning line, saved hidden state.

## Notes

- The verse is already duplicated in spirit by the calendar page's verse, so
  this also reduces the sense that the dashboard is "eight cards competing"
  — the prototype's own question.
- The module list is shared with the family settings switches (077). Change
  the meaning in one place.
- `DailyVerseCard.svelte` is untouched: the calendar page still uses it. The
  dashboard's copy is the quieter band.
- The family page needs no change — the verse is personal-scoped, so it never
  appeared in the family master switches.
