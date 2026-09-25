# 058 — Task deletions from external todo app (Todoos/TaskFocus) not syncing

Status: done

## Done

- **Bug**: `DELETE /api/tasks/[id]` called the owner-only `deleteTask(id, userId)`
  (`WHERE id = ? AND userId = ?`) and always returned `{success:true}` — deleting a
  family task from the token-authenticated external app silently no-opped, and the
  next `GET /api/tasks` re-downloaded it. Only tasks the API user personally
  created could be deleted.
- **Fix** (`src/lib/server/db/actions/tasks.ts`): `deleteTask` now loads the row by
  id alone and enforces the same issue-019 `canMutateTask` rules as PUT (family
  owner / live assignee / any family member); completed tasks still archive instead
  of hard delete (stats backing preserved); returns boolean.
- **Handler** (`src/routes/api/tasks/[id]/+server.ts`): `false` → `404` (missing or
  unauthorized), so the external app sees the failure instead of a fake success.
- Tests: DELETE suite appended to `src/routes/api/tasks/[id]/server.test.ts`
  (authorized family-member delete → hard delete; unauthorized → 404 + no write;
  unknown id → 404; unauthenticated → 401), exercising the real `canMutateTask`
  path with a scripted familyMembers lookup. 13/13 in file; 331 green across
  tasks/actions suites; `npm run build` clean.
- Note: completed-task deletions archive (`archivedAt`) — the external app sees
  them disappear from GET lists, but stats history is preserved by design.
