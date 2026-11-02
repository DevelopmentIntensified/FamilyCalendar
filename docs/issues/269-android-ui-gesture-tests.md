# 269 — Android: Compose UI tests for toggle / focus / month nav / day view / assignment

Status: open

Source: #210 finish pass 2026-11-02.

## Evidence

Gestures were never driven live (emulator taps unreliable, #210 slice 2/3); only wire tests cover them.

## Done

(none yet)

## Needs doing

- Robolectric + compose-ui-test JVM tests (run in testDebugUnitTest, so in mobileGate) driving the real screens with a fake repository.
- `./gradlew :app:mobileGate` green at the end.
