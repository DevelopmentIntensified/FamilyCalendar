# 015 — Audit findings: app-wide UX MED/LOW

Status: open

## Needs doing

- Toast system wired app-wide but only bills uses it — route success/error
  confirmations through `pushToast` on every mutation (tasks, events, bulk,
  meals, family settings, member ops).
- 7 `window.confirm()` sites for destructive actions — replace with the
  existing inline-confirm popover pattern (tasks page ×2, family tasks,
  TaskDetailModal, calendar bulk delete, smart-plan-to-past, WeekView/DayView
  selection-mode drag).
- Silent mutation failures as a pattern (~15 handlers check only success) —
  every fetch mutation gets a failure branch (inline error or toast).
- Family-action failures render nowhere — pages never declare `form` and
  never show `form.error` (family settings, member ops, event detail delete).
- Skeletons for client-fetched regions (EventModal checklist, NotificationBell
  dropdown, member search).
- `?edit=<id>` deep link dead-end → "Event not found" inline; edit modal
  opens only after RSVP fetch (open immediately).
- EventModal delete-confirm buttons lack pending state (double-tap = double
  DELETE); "Clear completed" no busy state.
- TaskDetailModal + edit-task dialog not scrollable on small screens —
  `max-h` + `overflow-y-auto`.
- Touch targets under 44px: WeekView/DayView time steppers, priority chips,
  navbar hamburger + bell.
- Auth forms missing `autocomplete` (`email`, `current-password`,
  `new-password`, `one-time-code` + `inputmode="numeric"`); resend-code has
  no confirmation; login/signup `location.reload()` after success — replace
  with `goto(..., { invalidateAll: true })`.
- Copy-link buttons give no feedback / no fallback.
- DayActionSheet lacks focus trap; DayEventsModal lacks role="dialog",
  focus trap, and Escape handler.
- `?` NotificationBell load failure silent — add retry row.
- Meals input missing accessible label.

## Done

- (nothing yet)
