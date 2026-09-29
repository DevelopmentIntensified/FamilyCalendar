# Tasks JSON API — spec for external todo apps (Todoos / TaskFocus)

Sync contract for third-party todo apps talking to FamilyCalendar over the
`/api/tasks` endpoints. A Bearer token authenticates as one user; every response
below is what a client MUST be able to handle.

## Auth

- Mint a personal token in-app (Settings → API tokens): server returns the
  plaintext once, format `fp_<43 chars>`, stored hashed per user. Revocable;
  revocation invalidates the old token at the next request.
- Send on every request: `Authorization: Bearer <token>` on any `/api/*` path.
  The header must be exactly `Bearer ` + token; whitespace after `Bearer` is
  trimmed, token compared by SHA-256 — one lone token works, re-use is fine.
- The API user is the token owner: they see their personal tasks plus their
  family's tasks. Permission rules: a family task may be mutated by its owner,
  its live assignee, or any family member; another member's personal task
  cannot be touched, ever.

## Universal responses

Every endpoint can return these; treat them before endpoint-specific cases:

| Status | Body | Meaning |
|---|---|---|
| 401 | `{"error":"Unauthorized"}` | Bearer header missing/invalid/revoked. Stop retrying; surface re-auth to the user. |
| 500 | `{"error":"<message>"}` | Server fault. Message is developer-facing prose; safe to display raw, never parse fields from it beyond `error`. |

Malformed JSON bodies also surface as a framework 500 (`{"error":<html?>}`-shaped
failure, not the JSON contract) — send valid JSON only.

## GET /api/tasks

Optional query: `?eventId=<id>` — tasks attached to one event.

- `200 {"tasks":[<Task>, …]}` — full current task list for the auth user
  (personal + family). Ordered by creation, newest first.
- `200 {"tasks":[]}` — eventId given but the event does not exist.
- `403 {"error":"No access to this event"}` — eventId exists but the
  auth user cannot read the owning calendar.
- 401 / 500 as universal.

Task shape (`Task`; `tags` present on the list endpoint only):

```json
{
  "id": "text",
  "title": "text",
  "notes": "text | null",
  "dueDate": "ISO datetime string | null",
  "completedAt": "ISO datetime string | null",
  "archivedAt": "ISO datetime string | null",  // always null in responses
  "recurrenceFrequency": "null | daily | weekly | monthly | yearly (null = non-recurring)",
  "recurrenceInterval": "number|null",
  "completionCount": "number|null",
  "assignedTo": "user id | null",
  "assignmentStatus": "none|pending|accepted|declined|null",
  "priority": "`low` | `normal` | `high` — unknown values normalize to `normal`",
  "visibility": "public|private",
  "assigneeFirstName": "text|null", "assigneeLastName": "text|null",
  "creatorFirstName": "text|null (family listing fields)",
  "userId": "creator id",
  "familyId": "family id | null (null = personal task)",
  "eventId": "text|null", "eventTitle": "text|null", "eventStart": "text|null",
  "createdAt": "ISO string",
  "tags": ["text", …]
}
```

Unknown/extra fields may appear; read fields optionally.

## POST /api/tasks

JSON body (examples of accepted values): `title` (required, non-empty),
`notes`, `dueDate`, `recurrenceFrequency`/`recurrenceInterval`,
`priority`, `visibility` (`public` default), `tags` (array, normalized),
`eventId`, `familyId` (omit/null → your own family; explicit id → must be
a family you belong to), `assignedTo` (defaults you).

- `201 {"success":true,"task":<Task + tags>}`
- `400 {"error":"Title is required"}` — empty/missing title.
- `400 {"error":"Invalid visibility"}` — visibility not in the enum.
- `400 {"error":"Assignee is not a member of this family"}` — assignedTo is
  neither you nor a member of the target family.
- `403 {"error":"Not a member of this family"}` — explicit familyId you are
  not a member of.
- 401 / 500.

## PUT /api/tasks/[id]

Partial update; send only the fields you change. Mutations:

- Plain fields: `title`, `notes`, `dueDate` (null clears), `priority`, `tags`.
- `toggleComplete: true` — check off / uncheck. Server-side logic; don't send
  `completedAt` directly alongside it.
- `advanceToNext: true` — skip the current occurrence of a recurring task.
- `undoComplete: true` — reverse a recurring-task check-off; pass
  `previousDueDate` (ISO string you captured from the task before completing).
- Recurrence: `recurrenceFrequency` (enum or null), `recurrenceInterval`.
- Assignment: `assignedTo` (string target, or null to clear) and/or
  `assignmentStatus` (`accepted` / `declined`). Non-owner rules: only the
  current assignee may accept/decline; reassignment is owner-only.
- Visibility: `visibility` — owner-only; a non-owner sending it is 403 even
  if other fields would be legal.

- `200 {"success":true,"task":<Task>}` — the updated task.
- `404 {"error":"Task not found"}` — id unknown, or the task exists but is
  not yours to mutate, or a recurring cursor is out of sync on undo.
- `404 {"error":"Nothing to undo"}` — `undoComplete` with nothing to reverse.
- `400 {"error":"Invalid visibility"}`
- `400 {"error":"Assignee is not a member of this family"}`
- `403 {"error":"Only the task owner can change visibility"}`
- `403 {"error":"You can only respond to your own assignments"}`
- 401 / 500.

## DELETE /api/tasks/[id]

No request body. Deletes an open task; a COMPLETED task is archived (stats are
kept server-side) — either way it disappears from every `GET /api/tasks` list.

- `200 {"success":true}` — hard-deleted (open task) or archived (completed).
- `404 {"error":"Task not found"}` — id unknown, OR the task exists but you
  lack mutation rights (someone else's personal task). Both mean "the list
  state and your local copy no longer agree"; healing is to re-GET.
- 401 / 500.

## Sync guidance (deletion handling)

1. **Never treat 200 as a whole-list refresh.** Deletion is per-id; after a
   `DELETE 200` drop the local copy immediately — do not wait for the next GET.
2. **`DELETE 404` is normal in bad-network or family scenarios.** A row may
   already be gone (double delete, another member deleted it), or the task may
   be one you cannot delete (someone's personal task). Both heal on the next
   full GET: reconcile by dropping local ids absent from the response. On 404,
   drop the local copy optimistically — but if the LOCAL copy was one you
   could not have deleted (task `familyId === null && userId !== your id`),
   keep it locally hidden only after a re-GET confirms absence.
3. **A deleted completed task vanishes from GET lists but its stats survive
   server-side.** Do not read that as data loss.
4. Ids are server-generated text; POST echoes them via `task.id`. Use that id
   for PUT/DELETE paths; never send your own ids.
