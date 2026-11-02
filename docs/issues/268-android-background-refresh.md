# 268 — Android: background refresh of the offline cache (WorkManager)

Status: open

Source: #210 finish pass 2026-11-02.

## Evidence

#210 slice 6 shipped a file cache filled only while the app is open. Sync contract stays full refresh (no `tasks.updated_at`; delta sync deferred).

## Done

(none yet)

## Needs doing

- Periodic WorkManager job (unmetered-agnostic, battery-not-low, ~every few hours) refreshes tasks + current month events into the existing cache; skips without a token; 401 clears nothing. Unit tests for the worker logic via a fake repository.
- `./gradlew :app:mobileGate` green at the end.
