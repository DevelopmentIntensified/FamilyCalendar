# 055 — Task add shows instantly (optimistic insert)

Status: done

## Done

- Root cause: both add-forms POST then rely solely on `invalidateAll()` round-trip — no optimistic insert, list lags till refresh.

## Needs doing

- `AddTaskCard`: `onAdded(task)` callback on quick-add + smart-template paths (keep `invalidateAll` as reconcile).
- `FamilyTaskAddForm`: `onAdded(task)` passes created task.
- `/calendar/tasks` page: merge `addedTasks` ahead of streamed server list, dedupe by id.
- Family tasks page: same merge ahead of `data.tasks`.
- Tests: `onAdded` carries created task (both forms); targeted vitest green.
