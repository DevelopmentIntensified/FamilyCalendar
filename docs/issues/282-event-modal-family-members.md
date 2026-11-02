# 282 — Event edit from calendar views can't add uninvited family members; task tab lacks category

Status: done

Source: 2026-11-02 leftovers pass.

## Evidence

#274 follow-up: `EventModal` callers (MonthDays, WeekView, DayView, ListView, Day Dashboard) pass no `familyMembers`, so the edit form's AttendantPicker can only show already-invited members. Also the event modal's task tab creates tasks without `category` (#280).

## Done

- One source: the `(calendar)/calendar` group layout's `getFamilyRoster`.
  `/calendar` (`+page.server.ts`) re-maps it and now keeps
  `firstName`/`lastName` (it carried only `name`, so even the page's own
  create/edit form had nothing to name members by); the dashboard loader
  already passed the full roster. No per-view fetch.
- Wiring: `Calendar` → `toEventRoster` (`src/lib/utils/eventRoster.ts`, shared
  `EventRosterMember`) → `familyMembers` on MonthView → MonthDays (×3),
  WeekView, DayView, ListView → `EventModal` → `EventFormModal`. DayDashboard
  passes `toEventRoster(familyMembers)` to its `EventModal`. All one-way props.
- Task tab: `/calendar` loader serves `taskCategories`
  (`listCategoryOptions`, never throws); the page passes the names to the
  create `EventFormModal`; `EventTaskFields` renders the shared
  `tasks/CategoryField.svelte`; `submitTaskQuickAdd` gets `category` (blank
  is dropped, so it is sent only when set). Reset with the other task fields.
- Red → green: `src/lib/components/calendar/eventModalRoster.svelte.test.ts`
  — per caller (MonthView, WeekView, DayView, ListView, Calendar, Day
  Dashboard) open the event → Edit → picker lists uninvited `Bob Jones`: 6
  failed before, pass after; EventModal save after picking him PUTs
  `{ value: 'u-bob', isUser: true }`. `EventFormModal.svelte.test.ts` "#282"
  (datalist offers the caller's categories, POST carries `category`; none set
  → no `category` key) — failed before (no Category field). `page.server.test.ts`
  "#282" (roster keeps names, `taskCategories` served) — failed before.
- Full vitest: all pass except `*.real.test.ts` (no Postgres) and
  `auth.test.ts` placeholder-secret test (fails only because the test env sets
  `BETTER_AUTH_SECRET`). `npm run build` passes. svelte-check: no new errors
  in touched files (EventFormModal 638/657 and EventModal `bind:attachedCount`
  are pre-existing on `test`).

## Needs doing

- Thread the family member list to EventModal from every caller (one shared source, e.g. the calendar page/layout data — no per-view refetch); edit form can add any family member; event task tab gets the shared CategoryField. Tests per caller wiring + picker shows uninvited members.
