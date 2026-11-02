# 280 — Task categories synced with TaskFocus

Status: open

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

(none yet)

## Needs doing

- FamilyPlanz server + spec (lane 1), web editor (lane 2), Android (lane 3); TaskFocus side messaged to its session.
