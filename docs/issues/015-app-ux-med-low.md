# 015 — Audit findings: app-wide UX MED/LOW

Status: in-progress

**Re-triaged 2026-09-29.** This was filed as ~15 independent items and read as
a 4-5 ticket rollup. It is not. Fourteen of the fifteen are already shipped —
verified against the code, not the ticket text — and the four that remain are
small, disjoint, and each a single session. **Do not split this into a fleet
lane; just do the four.**

## Needs doing

- [ ] **Touch targets under 44px in the hour grids.** `DayHourGrid` stepper and
      chip buttons are `px-1.5 py-1 text-[11px]` — roughly 24px tall, well
      under the 44px target. These are the drag/step controls in the day view,
      so they are hit constantly and by thumb. Also check the priority chips and
      the navbar hamburger + bell. Measure, don't eyeball: the fix is a
      `min-h-11 min-w-11` (or a computed minimum) that does not change the grid
      geometry.
- [ ] **Event delete has no pending state — double-tap deletes twice.**
      `performDelete` in the event modal has no busy flag, and the confirm bar's
      Delete / This occurrence / Whole series buttons are never disabled, so a
      double tap fires two DELETEs. The second is a 404 the user never sees.
      Same class: **"Clear completed"** on the tasks page has no busy state
      either, so a double tap can clear twice.
- [ ] **The edit-task dialog is not scrollable on a short screen.** The task
      detail modal got `max-h-[80dvh] overflow-y-auto`; the edit dialog did not
      — its card is `max-w-md` with no height cap, so on a landscape phone the
      Save button is below the fold with no way to reach it.
- [ ] **The event modal's attendee/checklist region has no skeleton.** It
      client-fetches attendees and tasks and renders an empty region until they
      land. Skeleton, not a blank card.

## Done (verified 2026-09-29)

- **Toasts wired app-wide.** `pushToast` has real callers across the tasks page
  (5), family detail (4), family tasks (9), the import preview (4),
  TopPrioritiesCard (6) and MealsCard (7) — success *and* failure branches.
- **All 7 `window.confirm()` sites replaced.** Zero remaining. The inline
  pattern exists and is used: `ExitSelectionAsk` for the drag-to-exit case, an
  inline confirm in the calendar bulk bar.
- **Family-action failures render.** The family detail page declares `form` and
  renders `form.error` in a banner; member operations take an `onError` callback
  that reaches a toast; the invitations page has its own error region.
- **Auth forms are complete.** `autocomplete` on email / current-password /
  new-password / one-time-code, `inputmode="numeric"` on both code fields, and
  login/signup navigate with `goto(..., { invalidateAll: true })` — zero
  `location.reload()` left in the app. Resend-code confirms with a 3s `resent`
  state.
- **Copy-link buttons give feedback and a fallback.** Four sites, all with a
  copied state and a "Copy failed — select the link manually" escape.
- **DayActionSheet and DayEventsModal are accessible.** Both have
  `role="dialog"`, a focus trap (`trapFocusAction`), and an Escape handler.
- **NotificationBell has a retry row** for a failed load, plus a push-toggle
  feedback state.
- **The `?edit=<id>` deep link dead-end is fixed** — it renders "Event not found
  — it may have been deleted, or you don't have access to it."
- **The meals input has an accessible label** (`aria-label="Meal name"`).
- **The notification dropdown and member search both have loading states.**

## Notes

- The "silent mutation failures (~15 handlers)" bullet was the widest claim in
  the ticket and could not be verified as a count — the pattern is genuinely
  fixed in every region checked, but a repo-wide sweep was not done. If a
  mutation still fails silently somewhere, file it as its own bug rather than
  reopening this.
