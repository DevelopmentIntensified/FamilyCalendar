# 280 — Task categories synced with TaskFocus

Status: in-progress

Source: owner 2026-11-02 — "since TaskFocus has a task category, we need to have that"; answers: sync the category list; set it in the web task editor and the Android app; TaskFocus maps by name; ping the TaskFocus agent for its side.

## Context

TaskFocus (desktop, repo DevelopmentIntensified/taskfocus) gives every task exactly one **Category** = a named rule-set (app/site allowlist, needed flags; built-in **Unrestricted**). Its FamilyPlanz sync (`TaskFocus.Core/Sync/FamilyPlanzSync.cs`) currently drops categories: pulled tasks land in "Family", nothing is pushed. Rules stay desktop-only; FamilyPlanz carries the **names**.

## Contract (FamilyPlanz side)

- `tasks.category` text NULL (≤80 chars, trimmed, blank → null). GET `/api/tasks` (+ `[id]`, family/section lists) returns `category`. POST accepts it; PUT: absent = unchanged, `null` = clear, string = set. 400 `{"error":"category is too long"}` / non-string.
- `task_categories` per user: `id`, `user_id` FK cascade, `name`, `created_at`, `updated_at`; unique on (`user_id`, lower(`name`)).
- `GET /api/task-categories` → `200 {"categories":[{"id","name","createdAt","updatedAt"}]}` (caller's, name-sorted).
- `POST /api/task-categories {"name"}` → `200 {"category":{…}}`; case-insensitive existing name returns the existing row (idempotent). 400 blank / >80.
- `PATCH /api/task-categories/[id] {"name"}` → `200 {"category":{…}}`; renames the caller's tasks (owned or assigned to caller) carrying the old name; 409 `{"error":"A category with that name already exists"}`; 404 not caller's.
- `DELETE /api/task-categories/[id]` → `200 {"success":true}`; caller's tasks with that name → `category = null`.
- Setting a task's category to a name not in the caller's list auto-adds it to the caller's list (so web and phone never drift from tasks).
- Auth: Bearer `fp_` token or session (same as `/api/tasks`). Documented in `docs/guides/task-api-spec.md`.
- Migration `024-task-categories.sql` (idempotent, additive) bundled in `scripts.ts`; applies at cold start.

## UI

- Web: category field in the task create + edit dialogs (combobox of the caller's categories + free entry), small chip on task rows; optimistic + toast per AGENTS.md.
- Android: category chip on task rows; picker when adding a task (#270 AddTaskBar), from `GET /api/task-categories`.

## TaskFocus side (other session)

- Push each task's category name (null for Unrestricted/Family fallback — their call); pull → existing desktop category by name (case-insensitive), unknown → their policy (owner: map by name; never silently create an empty default-deny category that blocks everything).
- Sync the list both ways by name using the endpoints above; remember remote ids for rename/delete.

## Done

- **Server + API + spec (lane 1)** — 2026-11-02, branch commits `feat(280): …`.
  - Migration `sql/migrations/024-task-categories.sql` (idempotent, additive: `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category`, `CREATE TABLE IF NOT EXISTS task_categories`, `CREATE UNIQUE INDEX IF NOT EXISTS task_categories_user_name_unique (user_id, lower(name))`), bundled in `src/lib/server/db/migrations/scripts.ts` (parity gate green). Not hand-run against Neon: no `.env.preview`/`.env.prod` in the agent sandbox — applies at cold start, or run `scripts/db-exec.mjs` per the spec.
  - Schema `tasks.category`, `taskCategories` (`src/lib/server/db/schema.ts`).
  - Actions `src/lib/server/db/actions/taskCategories.ts`: `parseTaskCategory`, `parseCategoryName`, `listTaskCategories`, `ensureTaskCategory` (idempotent, race-safe), `renameTaskCategory` / `deleteTaskCategory` (one transaction each, propagate to the caller's owned + assigned tasks, case-insensitive match).
  - Routes `src/routes/api/task-categories/+server.ts` (GET, POST) and `[id]/+server.ts` (PATCH, DELETE) — contract as above.
  - `/api/tasks` POST + `/api/tasks/[id]` PUT (owner and #232 non-owner family write) accept `category`; all list reads (`getTasksForUser`, `getTasksForFamily`, `getMyTasks`, `getPublicTasksForFamily`, pending/requested assignment sections) select it, so web page loaders already carry `task.category` for the UI lane.
  - Spec: `docs/guides/task-api-spec.md` (Task shape, POST/PUT `category`, new "Task categories" section).
  - Tests: `taskCategories.test.ts` (30), `api/task-categories/server.test.ts` (20), `api/tasks/category.test.ts` (12), `api/tasks/[id]/category.test.ts` (12), `actions/tasks/queries.category.test.ts` (6); `taskCategories.real.test.ts` written for the #002 harness (not run here: no Postgres).
  - Contract clarifications (additive, no shape change): non-string task category → `400 {"error":"category must be a string"}`; list-endpoint name errors → `400 {"error":"name is required"}` / `{"error":"name is too long"}`; DELETE on a non-caller id → `404 {"error":"Category not found"}` (same as PATCH); a case variant of a listed name is stored in the list's spelling (`"work"` → `"Work"`); there is no `GET /api/tasks/[id]` endpoint — the `[id]` PUT response carries `category`.

## Needs doing

- Web editor (lane 2): category combobox in task create + edit dialogs, chip on task rows; optimistic + toast. Data already on `task.category`; list from `GET /api/task-categories` (or a loader call to `listTaskCategories`).
- Android (lane 3): chip on rows; picker in #270 AddTaskBar from `GET /api/task-categories`.
- TaskFocus side: messaged to its session (push/pull names, list sync by name, remember remote ids).
- Owner: apply 024 to Neon (`.env.preview` then `.env.prod`) if not waiting for cold start.
