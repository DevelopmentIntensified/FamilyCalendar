# 270 — Android: create a task from the phone

Status: open

Source: #210 finish pass 2026-11-02.

## Evidence

Phone can read/complete/accept tasks and create events, but not create tasks; `POST /api/tasks` exists (spec: docs/guides/task-api-spec.md).

## Done

(none yet)

## Needs doing

- Add-task affordance on the Tasks tab (title required, optional due date/priority), POST via repository, optimistic insert + error inline, wire-contract test.
- `./gradlew :app:mobileGate` green at the end.
