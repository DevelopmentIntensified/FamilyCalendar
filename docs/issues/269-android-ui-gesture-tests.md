# 269 — Android: Compose UI tests for toggle / focus / month nav / day view / assignment

Status: done

Source: #210 finish pass 2026-11-02.

## Evidence

Gestures were never driven live (emulator taps unreliable, #210 slice 2/3); only wire tests cover them.

## Done

- Robolectric 4.17 (SDK 36 — highest it runs; `src/test/resources/robolectric.properties`, phone qualifiers `w411dp-h891dp`) + Compose BOM `ui-test-junit4` / `ui-test-manifest`; `isIncludeAndroidResources = true`; `--add-opens java.base/jdk.internal.access` for SDK 36 on JDK 17+.
- Tests drive the real `FamilyPlanzHost` + real `AppViewModel`/`CalendarViewModel`/`QuickAddViewModel` over `FakeRepository` (records calls, settable answers; production DataStore token store seeded per test). `app/src/test/kotlin/com/familyplanz/app/ui/gesture/`:
  - `TaskGestureUiTest` (3): checkbox → toggle called + row flips (checked, Focus hidden); Focus → start queued for that task + snack; Stop focus → stop queued + snack.
  - `AssignmentUiTest` (3): Accept → `accepted` + buttons gone + snack; Decline → `declined`; pending for someone else → no buttons.
  - `CalendarGestureUiTest` (3): Next/Prev → heading changes + that month requested; Day view → only that day's events + day heading, All days restores.
  - `QuickAddUiTest` (3): phrase → parse called → draft card → Create event → createEvent(title, start) + panel idle + month refetch; Cancel creates nothing; unreadable phrase fails inline.
  - `ErrorStatesUiTest` (6): no token → token screen; tasks 401 → token screen with reason; calendar 401 → token screen; network + cache → cached rows + offline snack; network no cache → inline reason + Retry refetches; calendar network → inline error + Retry.
  - `AddTaskUiTest` (2, #270): blank title → inline "Title is required", nothing sent; Add → pending "saving…" row (checkbox disabled) → server row + snack.
- Sanity: breaking toggle / respond / next-month / quick-add confirm wiring in `FamilyPlanzHost` made exactly those 4 tests fail; restored.
- Gate: `./gradlew :app:mobileGate` BUILD SUCCESSFUL (detekt clean, 88 unit tests, 0 failures, assembleDebug; after rebase onto #267/#268/#270). Uses the non-deprecated `junit4.v2.createComposeRule`.

## Needs doing

(none)
