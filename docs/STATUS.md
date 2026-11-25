# Status

Short rollup of active work. The full history up to 2026-11-11 is in [archive/STATUS-2026-11-11.md](archive/STATUS-2026-11-11.md).

## Website and server

- **v2 rewrite** on branch `rewrite/v2`. Progress: [rewrite/LEDGER.md](rewrite/LEDGER.md), or run `npm run census` for the live numbers. Design: [architecture/README.md](architecture/README.md).
- Open tickets from before the rewrite are archived. The items the rewrite must honour (security, data integrity, owner decisions) are in [rewrite/carryover.md](rewrite/carryover.md).

## Performance (active tickets)

- [#325](issues/325-calendar-share-target-under-1s-mobile-repeat.md) Calendar month + share-target under 1 s on mobile repeat: server-render the grid and the Quick Add modal, then remove the ADR 0010 §6 exception.

## Android (active tickets)

- [#210](issues/210-native-android-app.md) Native Android app: delta-sync call, Play submission, real-device drive.
- [#280](issues/280-task-categories-taskfocus.md) Task categories ↔ TaskFocus: TaskFocus-side sync.
- [#293](issues/293-phone-focus-sessions.md) Phone focus sessions: Android lane L3.
- [#294](issues/294-android-shell-theme.md) Android shell/theme: owner review of screenshots.
- [#309](issues/309-android-event-form-controls.md) Android event form controls: location suggestions.
