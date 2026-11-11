# 290 — Android: TaskFocus focus time + start/stop on the Tasks tab

Status: done

Source: owner 2026-11-03: "Fuse the two, but keep the FamilyPlanz UI/UX." TaskFocus focus lives inside
the existing Tasks tab, with no separate TaskFocus-styled screen. Contract: TaskFocus
`docs/issues/079-mobile-tasks-and-time.md` ("Field contract as built").

## Done

- Read: `focusStartedAt` joins `focusMinutes` on `GET /api/tasks` (tolerant: absent, null or an unparseable value means not focusing).
  The desktop is the clock. `focusMinutes` holds closed spans only and `focusStartedAt` the start of the open span.
  `liveFocusMinutes` = closed + whole minutes of the open span (never double-counted, never negative on clock skew).
  `isFocusing` = open span present (`domain/FocusTime.kt`).
- Write: `POST /api/taskfocus/commands` `{"command":"start","taskId":…}` / `{"command":"stop"}`.
  On that route only, 404/405 → `ApiError.Unsupported` ("This FamilyPlanz server can't reach TaskFocus yet").
  Task PUTs never carry `focusMinutes`/`focusStartedAt` (wire test).
- UI (Material3 theme tokens only, in `ui/FocusUi.kt` + `ui/FocusCommands.kt`; row edits are call sites only):
  - live "Nm focus" in the meta line, ticking every 30 s while a task focuses;
  - a "Focusing" chip on the running row;
  - a row action "Focus" or, on the running row, "Stop";
  - "Asking…" with every focus control disabled while a command is in flight;
  - a "Focusing now: <title>" line above the list.
  Toasts: "Asked your desktop to start focus" / "Asked your desktop to stop" / unsupported / the error text.
  A failure no longer replaces the list with the error screen; only a 401 leaves the list.
  The UI makes no optimistic focus flip. A quiet task reload runs 4 s after success.
- Tests: `FocusTimeTest` (8), `FocusCommandContractTest` (7), `TaskFocusUiTest` (7).
  `TaskGestureUiTest` copy was updated. Mutation-checked: live time, the 404 mapping and the delayed refresh each turn a test red.
  `:app:mobileGate` green: detekt, 248 tests and assembleDebug.
- Release: changelog `fdroid/.../changelogs/2002.txt` (0.2.2). The version comes from tag `android-v0.2.2`, so gradle is unchanged.

## Needs doing

- Owner: tag and publish 0.2.2 (no tag created here).
- Real-device check against a running desktop TaskFocus: start/stop acts within ~5 s and the chip follows.
