# 022 — Default calendar setting not respected

Status: done

## Done

- Root cause (prod): `src/routes/(calendar)/calendar/+page.svelte:841`
  passed `defaultCalendarId={(data.calendarIds || [])[0]?.id ?? null}` to
  EventFormModal — always non-null (personal calendar is pushed first by
  the load), so it always overrode the user's setting. Modal chain
  (`EventFormModal.svelte:95`: prop ?? userSettings.defaultCalendarId)
  never got the real setting.
- Verified NOT broken: saving works (`account/+page.server.ts:135,161,174`
  persists `defaultCalendarId` via saveCalendarSettings); load returns
  `userSettings.defaultCalendarId` (`calendar/+page.server.ts:242`); the
  modal/model fallback chain itself was correct.
- Fix 1: `+page.svelte:841` now passes
  `data.userSettings?.defaultCalendarId ?? null`.
- Fix 2: `EventFormModel.svelte.ts` `initializeCalendar` edit-mode now
  keeps the event's calendar only if it's still in the visible list;
  stale/hidden calendar falls back to `calendars[0]` (was passing any
  truthy `initialEvent.calendarId` unchecked).
- Edit-mode keeping the event's own calendar (when visible) is expected
  behavior — default applies to new events only.
- Tests: 6-case chain pinned in `EventFormModel.svelte.test.ts`
  (default used; stale default → calendars[0]; unset → calendars[0];
  no calendars → ''; edit keeps event calendar; edit stale calendar →
  calendars[0]). Red → green.
- Gates: vitest touched file 22/22; full suite 1223 passed, 1 flake in
  other lane's `events.creatorNames.test.ts` (passes in isolation);
  oxlint + prettier clean; svelte-autofixer clean on the edited line
  (pre-existing legacy `export let` in that page, not from this change);
  build green. `npm run check` reports 9 errors in `calendar/+page.svelte`
  lines 219-542 — lane #026 creator-badge in-flight work, unrelated.
