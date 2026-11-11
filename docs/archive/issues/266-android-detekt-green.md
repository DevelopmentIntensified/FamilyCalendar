# 266 — Android: make :app:mobileGate green (11 detekt issues)

Status: done

Source: #210 finish pass 2026-11-02.

## Evidence

`./gradlew :app:mobileGate` fails at detekt: LongParameterList (CalendarScreen, QuickAddViewModel.updateDraft, TaskListScreen, AppHost.TaskSlot), LongMethod (DraftCard 75, FamilyPlanzHost 67), ComplexCondition (TaskListScreen:150), TooManyFunctions (AppViewModel, TaskRepository, NetworkTaskRepository), MatchingDeclarationName (AppHost.kt). testDebugUnitTest 42/42 and assembleDebug already green (aedee17).

## Done

- Refactor only; `app/config/detekt.yml` untouched, no `@Suppress`.
- Repository split by concern: `TaskSource` (tasks/focus/assignment/cachedTasks), `EventSource` (month events/quick-parse/create/cachedEvents), `AccountSource` (me). `TaskRepository` = composite of the three; `NetworkTaskRepository(api, cache)` delegates (`by`) to `NetworkTaskSource` / `NetworkEventSource` / `NetworkAccountSource` - method names + constructor unchanged, MainActivity + contract tests untouched. Calendar/QuickAdd VMs now take `EventSource`.
- `AppViewModel`: `loadMe` inlined, `replaceTask` -> pure `AppUiState.withTask(dto)`.
- `QuickAddViewModel.updateDraft(edit: DraftEdit)` (sealed one-field edit; `Draft.applying` re-derives `needsTitle` on every edit, as before). New `DraftEditTest` (3 tests).
- Callback holders: `TaskActions`, `CalendarActions`, `QuickAddActions` (own files). `TaskSlot` removed. `DraftCard` split into `DraftDateRow` / `DraftTimeRow` / `DraftButtons`. Assignment condition -> `awaitsMyReply(meId, task)`.
- `AppHost.kt` -> `FamilyPlanzHost.kt` (+ `PhoneTab.kt`); host split into `HostEffects` + `PhoneTabBar` + `CalendarSlot`; duplicate `Icon` import dropped.
- Gate 2026-11-02: `./gradlew :app:mobileGate` -> `BUILD SUCCESSFUL in 24s`; detekt 0 issues; testDebugUnitTest 45/45 (42 prior + 3 new); assembleDebug green.

## Needs doing

(none)
