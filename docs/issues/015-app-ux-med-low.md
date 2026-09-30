# 015 — Audit findings: app-wide UX MED/LOW

Status: done

**Re-triaged 2026-09-29.** This was filed as ~15 independent items and read as
a 4-5 ticket rollup. It is not. Fourteen of the fifteen are already shipped —
verified against the code, not the ticket text — and the four that remain are
small, disjoint, and each a single session. **Do not split this into a fleet
lane; just do the four.**

## Needs doing

_Nothing. All four shipped 2026-09-29._

## Done (2026-09-29)

- [x] **Touch targets under 44px in the hour grids.** Measured with
      `src/lib/utils/touchTarget.ts`, which derives the border box from the
      Tailwind class chain (jsdom has no layout, so the numbers have to come
      from somewhere). Range-popover steppers `px-1.5 py-1 text-[11px]`
      **23.2px → 44px** (`min-h-11`; the ✕ also gets `min-w-11`).
      `TopPrioritiesCard` priority chips `px-2.5 py-1.5 text-[11px]`
      **25.2px → 44px**. Grid geometry untouched — `PX_PER_HOUR`, `GRID_HEIGHT`
      and the chip's inline `%` box are unchanged, pinned by a test.
      Navbar hamburger and notification bell measured at **44×44 already** —
      no change. **Not fixed:** the day-grid event chip itself (see Notes).
- [x] **Delete has no pending state.** `EventModal.performDelete` now carries a
      `deleting` guard (early return + `finally`), threaded to both confirm
      bars — `EventModalBar` (detail popover) and `EventDeleteConfirm` (edit
      form). Delete / This occurrence / Whole series / Cancel / the bar's
      Delete trigger all go `disabled` and the primary reads "Deleting…".
      Pinned by a double-tap test asserting exactly one DELETE.
- [x] **Edit-task dialog not scrollable on a short screen.** The card is now
      `flex max-h-[90dvh] flex-col` and the form is the scroll body
      (`min-h-0 flex-1 overflow-y-auto overscroll-contain`), so Save is always
      reachable on a landscape phone.
- [x] **Event modal attendee/checklist region had no skeleton.** `EventModal`
      renders an `attendee-skeleton` block and `ChecklistSection` a
      `checklist-skeleton` row set while their client fetches are in flight.
      Both are gated on "nothing to show yet", so a skeleton never flashes
      over server-passed attendees.

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

- **"Clear completed" was already guarded** — the re-triage note claiming it
  had no busy state was stale. `+page.svelte` already had
  `if (clearBusy) return;` and `TasksMainList` already had
  `disabled={clearBusy}` + a "Deleting…" label. No code change; added the
  missing double-tap test (page level, asserts one DELETE) so the guard stops
  being folklore. Worth knowing before anyone re-files it as a bug.
- **The day-grid event chip is still 26px, deliberately.** Its box is set
  inline as a percentage of `GRID_HEIGHT` with a 26px floor
  (`Math.max(slot.heightPct, (26 / GRID_HEIGHT) * 100)`), so a 30-minute event
  renders 26–28px tall. Raising it to 44px would make packed events overlap and
  would move the boundary that drag-to-create / range-select hit-testing reads
  — the ticket that owns that geometry should do it in `dayViewLayout.ts`,
  not here. Widening the *hit* area without moving the box is also blocked:
  the chip is `overflow-hidden` (it truncates the title), so a pseudo-element
  hit pad would be clipped.
- The "silent mutation failures (~15 handlers)" bullet was the widest claim in
  the ticket and could not be verified as a count — the pattern is genuinely
  fixed in every region checked, but a repo-wide sweep was not done. If a
  mutation still fails silently somewhere, file it as its own bug rather than
  reopening this.
