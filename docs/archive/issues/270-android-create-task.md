# 270 — Android: create a task from the phone

Status: done

Source: #210 finish pass 2026-11-02.

## Evidence

Phone can read/complete/accept tasks and create events, but not create tasks; `POST /api/tasks` exists (spec: docs/guides/task-api-spec.md).

## Done

- Wire: `FamilyPlanzApi.createTask` (`POST api/tasks`), `@Serializable CreateTaskRequest(title, dueDate?, priority?)` (nulls omitted; no focus fields constructible), `TaskSource.createTask` + `NetworkTaskSource`.
- Logic: `ui/TaskCreation.kt` — `NewTaskInput.toRequest()` (trimmed title, `YYYY-MM-DD`, lowercase priority; blank → null), `TaskCreator` optimistic flow over the shared `AppUiState`: pending row (temp id, `Task.pending`) first, server task replaces it (no duplicate if a refresh already listed it), failure removes it and sets `Ready.createError = Couldn't add "<title>": <server error>`; 401 → token entry.
- UI: `AddTaskBar.kt` at top of the Tasks tab (also on the empty state): title field + Add (IME Done), due-date `DatePickerDialog` + Clear, low/normal/high chips; inline error under the field; pending row shows `saving…` with checkbox/Focus disabled; success snack `Added "<title>" to your tasks`. Wired via `TaskActions.onCreate` (nullable, default null hides the bar).
- `AppViewModel.startFocus/stopFocus` folded into `queueFocus(task?)` to stay under detekt TooManyFunctions (TaskActions unchanged).
- Evidence: `TaskCreateContractTest` (4, MockWebServer: body shape, 201/200 parse, 400 text) + `TaskCreatorTest` (8, gated fake TaskSource: request mapping, blank title, pending→server swap, rollback + inline text, 401, refresh race). `./gradlew :app:mobileGate` BUILD SUCCESSFUL, 57 unit tests green.

## Needs doing

- Real-device drive of the add flow (owner).
