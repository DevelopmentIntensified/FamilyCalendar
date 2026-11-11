# 103 — The member strip comes off the dashboard

Status: done

Source: `app-ui/dashboard.html` review, member strip marked **bad** twice —
"Why is this needed?" and then "This is uneeded".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] ~~The member strip is no longer a Dashboard Module: the entry leaves the
      canonical module list, its component and its test go, and nothing
      imports them.~~ **Done** — `dashboardModules.ts` entry gone;
      `MemberStrip.svelte` + its test deleted; only `DayDashboard.svelte`
      imported it.
- [ ] ~~**The Family Task Board survives.**~~ **Done** — the shared
      `md:grid-cols-2` wrapper is gone; the board renders on its own at full
      width. Pinned by a test that walks the board's ancestors for the grid
      class and counts the band's grids (1 — the glance row, which is intact).
- [ ] ~~The family page's module switch row loses the strip's row.~~ **Done** —
      verified, not assumed: the family's `{#each FAMILY_DASHBOARD_MODULES}`
      is the only source of those rows, and
      `FAMILY_DASHBOARD_MODULES` no longer contains the id (asserted).
- [ ] ~~The dashboard loader stops fetching what only the strip needed.~~ **Done
      with the slice** — `memberStatus` (the per-member open-task count) and the
      whole `memberStatus` path (loader → page → prop) are deleted, and so is
      `getFamilyAttendanceForEvents`, the attendance SELECT that fed only the
      strip's "in an event today" dot, plus its two db tests. Nothing called it
      after that. The kids leg keeps its own `getKidsScheduleAttendance`.
      `attachAttendanceSummaries` stays — the glance card reads it.
- [ ] ~~A user who had already hidden the strip keeps a coherent state.~~ **Done
      and tested** — see the decision below.
- [ ] ~~Any family that had the strip master-switched off gets that switch row
      cleaned up.~~ **Done** — `sql/015-drop-member-strip-switches.sql`, one
      idempotent DELETE. **Not yet run** — someone with DB access should run it.
- [ ] ~~Tests updated where they pin the module list.~~ **Done** — five suites.

## Done

**The decision on the stale saved id: no data migration, and the stale id is
inert rather than repaired.**

`userSettings.hiddenDashboardModules` is a `string[]` with no FK and no
constraint, so a user who hid the strip is already carrying `'memberStrip'` in
the wild. Three facts make that safe, and all three are now pinned by tests in
`src/lib/server/db/actions/dashboardModules.test.ts` and
`src/lib/dashboardModules.test.ts`:

1. **It cannot error.** `composeModuleVisibility` filters the saved list through
   `isDashboardModule`, so a non-canonical id is dropped on the way in. The
   composed map is built by iterating the canonical list, so the retired key
   cannot even appear in the result — asserted with `Object.keys(v)`.
2. **It cannot reappear.** Nothing iterates the raw persisted list: the account
   page and the family page both read it per-canonical-module, so a key nothing
   matches is invisible. The strip's own branch is gone from `DayDashboard.svelte`,
   so there is no code path left that could render it even if it could.
3. **It cannot block a future save.** `/account`'s `saveCalendarSettings`
   rebuilds `hiddenDashboardModules` from `DASHBOARD_MODULES` minus the posted
   checkboxes — it never reads the stored array. So the stale id clears itself
   on the next save, and no save can fail because of it.

The family side is the one place a stale row really exists, and it is inert for
a different reason: `setFamilyModuleSwitch` throws on an unknown module id, so a
`dashboardModuleSwitches` row naming the strip can neither be acted on nor
written back. `sql/015` deletes those rows anyway — a row for a module that no
longer exists is the same lie as a switch for it.

## Notes

- **A stale family row is the only thing in the DB that needed touching, and
  `sql/015-drop-member-strip-switches.sql` is the SQL to run manually.** The
  table holds a row only while a module is switched OFF, so it is exactly the
  set of families that had the strip turned off family-wide.
- **A dead `SELECT` is the same lie as a dead switch**, so
  `getFamilyAttendanceForEvents` went with the card rather than waiting as a
  follow-up. Same for the `memberStatus` prop: it threaded loader → page →
  component and was read by nothing else.
- This is the same shape as 080, which moved the verse out of the module band.
  Same test files, same canonical-list edit, same "the id is the saved state"
  rule — with one difference: 080 kept the id, 103 retired it.
- **Follow-up for whoever owns `CONTEXT.md`:** the Day Dashboard entry and the
  Dashboard Module entry both still list Member Strip among the modules. That
  is now a stale domain claim. Left alone here on purpose — `CONTEXT.md` is
  shared and this lane was scoped to `docs/issues/103-*.md`.
- `prototypes/app-ui/dashboard.html` and `prototypes/app-ui/app-data.js` still
  name the strip; that is the proposal page, deliberately not part of the app.
- Unrelated breakage in the shared tree while this ran, not from this slice:
  `src/routes/(family)/family/create/+page.svelte.test.ts` (untracked, another
  lane) breaks `svelte-kit sync` with "Files prefixed with + are reserved", so
  `npm run build` and `npm run check` cannot complete until it is renamed out of
  `src/routes/`. Same lane's 096/100 vitest suites were red too.

