# 211 — TaskFocus: focusMinutes on tasks + device command channel (021)

Status: done

Source: owner triage spec 2026-10-27 (AI-drafted, owner-approved scope). TaskFocus (desktop) syncs tasks via the personal-API-token Bearer channel (`#083`'s `api_tokens`); the phone client joins as the third consumer (`apps/android`, separate lanes #209/#210). FamilyPlanz becomes the shared hub. Migration 021 applied to preview **and** prod 2026-10-27 (idempotent, re-run verified).

## Done

- **Change 1 — `focusMinutes` persisted on tasks.** `tasks.focus_minutes` integer (nullable, 021/) + schema field. `POST /api/tasks` accepts it at create (absent → null = no time yet); `PUT /api/tasks/:id` — **absent or null = stored value unchanged** (`undefined` never reaches the SQL SET; pinned by seam test), explicit whole-minutes ≥ 0 overwrites, anything else 400 **before any mutation** (the visibility-validation pattern). `GET /api/tasks` returns the column verbatim (omit or null for never-timed tasks — both tolerated). No edit timestamp: the desktop is the only legitimate writer.
- **Change 2 — device command channel.** `taskfocus_commands` table (user-scoped, FIFO by `issued_at`, index `user_queue_idx`). `GET /api/taskfocus/commands` → 200 `{commands:[{id,command,taskId,issuedAt ISO}]}`, empty list when none, limit 25, stale (>10 min) rows purged on read (hygiene; the desktop also checks age before acting). `POST` enqueues `{command:'start',taskId}` / `{command:'stop'}` — start REQUIRES a taskId that exists AND belongs to the token's user (400 otherwise; spec silent, this narrows the contract deliberately — a phone may only command its own queue); stop may omit. `DELETE /api/taskfocus/commands/:id` acks — **idempotent: unknown, other-user's, or already-acked id all return 204, never 404-only**. Multiple phones enqueue; each command acked once, individually.
- **Auth**: same `requireUserJson(locals)` contract as every `/api` route — hooks.server.ts resolves `Authorization: Bearer` (personal token) before the cookie path; unauthenticated = 401 JSON.
- Bundled in `src/lib/server/db/migrations/scripts.ts` (parity gate).
- Tests: route-seam suites — `src/routes/api/taskfocus/commands/server.test.ts` (11: FIFO mapping, empty-list 200, POST validation incl. start-without-taskId + someone-else's-task + 401) and `commands/[id]/server.test.ts` (4: ack 204, idempotent 204, no-params 204, 401) plus focusMinutes pins at both tasks routes' existing suites (PUT no-wipe/overwrite/bad-value ×5, POST create/bad-value ×4). 32 new, all green; API sweep green except the pre-existing parse-event real-DB failures (unrelated, stash-verified).

## Notes (from the two-axis review, folded in)

- FIFO tiebreaker: `orderBy(issuedAt, id)` — `generateId` is random, so same-microsecond inserts resolve arbitrarily; separate HTTP enqueues make a true µs collision unobservable. Left as-is, on record here.
- `taskId: null` on every GET row matches the spec's own shape example (`"<familyplanz task id or null>"`).
- `ON DELETE CASCADE` on `task_id`: a deleted task leaves no orphan commands.
- The duplicated focusMinutes guard POST vs PUT is deliberate: create has no stored value (null→null), PUT preserves (null→undefined). Inline per-field validation is the house baseline.

## External contract doc

`docs/guides/task-api-spec.md` documents both changes for the TaskFocus clients (same commit).
