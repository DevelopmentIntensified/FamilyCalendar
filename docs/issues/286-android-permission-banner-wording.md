# 286 — Android: notification permission banner wording covers push, not just reminders

Status: done

Source: 2026-11-02 leftovers pass.

## Evidence

#273 hand-back: the POST_NOTIFICATIONS banner still says 'Get event reminders' though it now gates Family activity + Event updates too.

## Done

- Banner now reads "Get reminders and family updates" / "Notifications are off", body names reminders + family plan changes + handed tasks (`ui/NotificationAccess.kt`). `ReminderPermissionUiTest` updated first (red), green after; `:app:mobileGate` green.

## Needs doing

(none)
