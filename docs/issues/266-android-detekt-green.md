# 266 — Android: make :app:mobileGate green (11 detekt issues)

Status: open

Source: #210 finish pass 2026-11-02.

## Evidence

`./gradlew :app:mobileGate` fails at detekt: LongParameterList (CalendarScreen, QuickAddViewModel.updateDraft, TaskListScreen, AppHost.TaskSlot), LongMethod (DraftCard 75, FamilyPlanzHost 67), ComplexCondition (TaskListScreen:150), TooManyFunctions (AppViewModel, TaskRepository, NetworkTaskRepository), MatchingDeclarationName (AppHost.kt). testDebugUnitTest 42/42 and assembleDebug already green (aedee17).

## Done

(none yet)

## Needs doing

- Refactor (callback/param holder types, extract composables, split repository by concern), not suppress; keep behaviour; gate green.
- `./gradlew :app:mobileGate` green at the end.
