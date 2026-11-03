# Tasks JSON API — spec for external todo apps (Todoos / TaskFocus)

Sync contract for third-party todo apps talking to FamilyCalendar over the
`/api/tasks` endpoints. A Bearer token authenticates as one user; every response
below is what a client MUST be able to handle.

## Auth

- Mint a personal token in-app (Settings → API tokens): server returns the
  plaintext once, format `fp_<43 chars>`, stored hashed per user. Revocable;
  revocation invalidates the old token at the next request. The Android app
  instead signs in natively and receives one — see "Mobile sign-in" below.
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
  "focusMinutes": "integer|null (TaskFocus: whole focus minutes, desktop-written)",
  "focusStartedAt": "ISO datetime string|null (TaskFocus: current focus began; null = idle)",
  "category": "text|null (#280: category NAME shared with TaskFocus; null = uncategorized)",
  "phoneFocusMinutes": "integer ≥ 0 (#293: whole minutes of the CALLER's closed, unabsorbed phone sessions on this task; 0 when none)",
  "phoneFocusStartedAt": "ISO datetime string|null (#293: start of the caller's open phone session on this task; null = none)",
  "eventCalendarId": "calendar id|null (#292 G5, GET only: the parent event's calendar; null = standalone task, which belongs to your personal calendar)",
  "tags": ["text", …]
}
```

Unknown/extra fields may appear; read fields optionally.

## POST /api/tasks

JSON body (examples of accepted values): `title` (required, non-empty),
`notes`, `dueDate`, `recurrenceFrequency`/`recurrenceInterval`,
`priority`, `visibility` (`public` default), `tags` (array, normalized),
`eventId`, `familyId` (omit/null → your own family; explicit id → must be
a family you belong to), `assignedTo` (defaults you),
`focusMinutes` (TaskFocus only: whole focus minutes, ≥ 0; omit → `null`),
`focusStartedAt` (TaskFocus only: ISO datetime; omit/null → `null` = idle),
`category` (#280: name string, trimmed, ≤ 80 chars; omit/null/blank → `null`.
A name not in your category list is auto-added to it; a case variant of a
listed name is stored in the list's spelling, e.g. `"work"` → `"Work"`).

- `201 {"success":true,"task":<Task + tags>}`
- `400 {"error":"Title is required"}` — empty/missing title.
- `400 {"error":"Invalid focusMinutes"}` — not an integer ≥ 0.
- `400 {"error":"Invalid focusStartedAt"}` — not null and not a parseable ISO datetime.
- `400 {"error":"Invalid dueDate"}` — present (not null/empty) but not an ISO
  date or datetime string.
- `400 {"error":"category is too long"}` — over 80 chars after trimming.
- `400 {"error":"category must be a string"}` — present, not null, not a string.
- `400 {"error":"Invalid eventId"}` — present but not a string.
- `400 {"error":"Event not found"}` — `eventId` names no event.
- `403 {"error":"No access to this event"}` — the event exists but you cannot
  read it (not its owner, no access to its calendar).
- `400 {"error":"Invalid visibility"}` — visibility not in the enum.
- `400 {"error":"Assignee is not a member of this family"}` — assignedTo is
  neither you nor a member of the target family.
- `403 {"error":"Not a member of this family"}` — explicit familyId you are
  not a member of.
- 401 / 500.

## PUT /api/tasks/[id]

Partial update; send only the fields you change. Mutations:

- Plain fields: `title`, `notes`, `dueDate` (null clears), `priority`, `tags`.
  Anyone allowed to mutate the task (owner, live assignee, any member of a
  family task) may edit these, plus recurrence and focus fields; visibility
  and reassignment stay owner-only (see below).
- `focusMinutes` (TaskFocus only): **absent or null leaves the stored minutes
  untouched — never send a guessed value** (the desktop is the only writer of
  focus time; wiping on phone edits would erase accrued time). An explicit
  integer ≥ 0 overwrites. `400 {"error":"Invalid focusMinutes"}` for negative
  or fractional values, rejected before any mutation.
- `focusStartedAt` (TaskFocus only, 265): **field present → overwrite, explicit
  `null` included** (null = "stopped"); field absent → unchanged. Unlike
  `focusMinutes`, null is a value here. `400 {"error":"Invalid focusStartedAt"}`
  for non-string or unparseable values, rejected before any mutation. Live
  minutes for a running task = `focusMinutes + (now − focusStartedAt)`.
- `category` (#280): **absent → unchanged; `null` or blank → cleared; string
  → set** (trimmed, ≤ 80 chars). Any permitted editor may set it (owner,
  live assignee, family member); an unknown name is auto-added to the
  EDITOR's category list, and a case variant of a listed name is stored in
  the list's spelling. `400 {"error":"category is too long"}` /
  `400 {"error":"category must be a string"}`, rejected before any mutation.
- `toggleComplete: true` — check off / uncheck. Server-side logic; don't send
  `completedAt` directly alongside it.
- `advanceToNext: true` — skip the current occurrence of a recurring task.
- `undoComplete: true` — reverse a recurring-task check-off; pass
  `previousDueDate` (ISO string you captured from the task before completing).
- Recurrence: `recurrenceFrequency` (enum or null; null clears both fields),
  `recurrenceInterval` (number, floored, min 1). The interval may be sent
  alone to change a task that is already recurring (ignored on a
  non-recurring task); with a new frequency and no interval it defaults to 1.
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
- `400 {"error":"Invalid recurrenceFrequency"}` — not one of the enum values
  (and not null); rejected before any mutation.
- `400 {"error":"Invalid recurrenceInterval"}` — not a finite number.
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

## Task categories (`/api/task-categories`, #280)

Per-user list of category NAMES, synced with TaskFocus (its rule-sets stay
desktop-side; FamilyPlanz only carries names). Same auth (Bearer `fp_…` or
session). Names are unique per user **case-insensitively**; ≤ 80 chars,
trimmed. Category wire shape:
`{"id":"text","name":"text","createdAt":"ISO","updatedAt":"ISO"}`.

- `GET /api/task-categories` → `200 {"categories":[<Category>, …]}` — the
  caller's list, sorted by name (case-insensitive).
- `POST /api/task-categories` body `{"name":"Work"}` → `200 {"category":<Category>}`.
  **Idempotent:** an existing name (any case) returns the existing row, never
  a duplicate — safe to replay on every sync.
- `PATCH /api/task-categories/[id]` body `{"name":"Deep Work"}` →
  `200 {"category":<Category>}` (updatedAt bumped). Every task **owned by
  or assigned to the caller** whose category equals the old name
  (case-insensitive) is renamed in the same transaction. A case-only rename
  of the same row is allowed.
  - `409 {"error":"A category with that name already exists"}` — another of
    your categories has that name (case-insensitive).
- `DELETE /api/task-categories/[id]` → `200 {"success":true}`; the caller's
  tasks (owned or assigned) carrying that name get `category: null`.
- `400 {"error":"name is required"}` — missing / blank / non-string name
  (POST, PATCH); also malformed JSON.
- `400 {"error":"name is too long"}` — over 80 chars after trimming.
- `404 {"error":"Category not found"}` — PATCH/DELETE on an id that is not
  yours (or unknown). Treat as "already gone": drop the local remote id.
- 401 / 500 as universal.

Notes for sync clients:
- Setting a task's `category` (POST/PUT `/api/tasks`) to a name not in the
  list auto-adds it, so the list never drifts behind the tasks.
- The list is per user; family members do not share lists. A family task
  may carry a name that is not in YOUR list (another member set it) — map it
  by name; do not treat that as an error.
- Rename/delete propagate only to tasks owned by or assigned to the caller;
  another member's tasks keep their stored name.
- Create the table/column (also bundled for the cold-start runner):
  `npx dotenv -e .env.preview -- node scripts/db-exec.mjs sql/migrations/024-task-categories.sql`
  then the same with `.env.prod`. Idempotent.

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

## TaskFocus device command channel

Phone → desktop start/stop, one FIFO queue per token owner. Same Bearer auth.

- `GET /api/taskfocus/commands` — the queue, oldest first:
  `200 {"commands":[{"id","command":"start"|"stop","taskId" (string or null),"issuedAt" ISO}]}`.
  Empty list when nothing is pending. Commands older than ~10 minutes are
  dropped server-side on read (hygiene; check `issuedAt` age before acting
  anyway). A `stop` may carry `taskId: null` (stop whatever is running).
- `POST /api/taskfocus/commands` — enqueue one:
  `{"command":"start","taskId":"<your task id>"}` or `{"command":"stop"}`.
  `start` requires a `taskId` that exists and is yours — `400` otherwise.
  → `201 {id,command,taskId,issuedAt}`.
- `DELETE /api/taskfocus/commands/:id` — ack after the desktop acted.
  **Idempotent: unknown / already-acked / another-user's id all return
  `204`, never `404`-only.** Each command is acked once, individually; with
  several phones enqueuing, the desktop consumes strictly in FIFO order.

## TaskFocus phone focus sessions (`/api/taskfocus/sessions`, #293)

The phone's own focus log (TaskFocus #124). One writer per field: the phone
never writes `focusMinutes`; it writes sessions here. The desktop pulls
closed sessions, imports them, PUTs the new `focusMinutes`, then **absorbs**
(acks) them. Until absorbed, `GET /api/tasks` reports them as
`phoneFocusMinutes` / `phoneFocusStartedAt` (`focusMinutes` /
`focusStartedAt` stay desktop-owned and unchanged). Same Bearer `fp_…` /
session auth as `/api/tasks`; everything is scoped to the caller — another
user's session id behaves exactly like an unknown one (`404`).

Session shape (`{session}` responses):
`{"id","taskId","startedAt" ISO,"endedAt" ISO|null (null = running),"source":"phone","absorbedAt" ISO|null,"createdAt" ISO}`.

Time rules (400 `{"error"}`): `startedAt` may be at most **5 min** ahead
of the server clock; when ended, `endedAt > startedAt` and
`endedAt − startedAt ≤ 12 h` (both bounds inclusive: exactly 5 min / 12 h
pass). Timestamps are ISO strings.

- `POST /api/taskfocus/sessions` `{"taskId","startedAt","endedAt"?}` →
  `201 {session}`. No `endedAt` (absent or null) = start a running session;
  with `endedAt` = a finished session recorded offline.
  - The task must be one the caller can see — the same check as
    `PUT /api/tasks/[id]`: owner, live (pending/accepted) assignee, or for a
    family task any member of its family. Unknown / archived / not yours →
    `404 {"error":"Task not found"}` (an offline queue can drop it).
  - **One open phone session per user.** A start (no `endedAt`) while
    another session is open → `409 {"error","openSessionId":"<id>"}`;
    the phone PATCHes (or DELETEs) that one, then retries. A finished
    (`endedAt`) POST is never refused for an open session. Enforced by a
    partial unique index, so concurrent starts cannot both win.
- `PATCH /api/taskfocus/sessions/:id` `{"endedAt"}` → `200 {session}`.
  Closes an open session (rules above, measured from the stored
  `startedAt`). A repeat PATCH on a closed, unabsorbed session overwrites
  `endedAt` (a retried stop succeeds). `404` unknown / not yours; `409`
  already absorbed. A session that ran past 12 h cannot be closed as-is:
  PATCH `startedAt + 12h` or DELETE it.
- `DELETE /api/taskfocus/sessions/:id` → `200 {"success":true}`. Discards an
  unabsorbed session (open or closed; the user cancelled). `404` = unknown /
  not yours / already deleted — **treat as done**. `409` = already absorbed
  (it is desktop history now; nothing to discard).
- `GET /api/taskfocus/sessions?unabsorbed=1` →
  `200 {"sessions":[{"id","taskId","startedAt","endedAt","source"}]}`:
  the caller's **closed and unabsorbed** sessions only, oldest `startedAt`
  first, max 200 (page by absorbing). Without `?unabsorbed=1` → `400`. A
  `404` means the server predates #293 — desktop skips quietly.
- `POST /api/taskfocus/sessions/:id/absorb` → `200 {session}` with
  `absorbedAt` set. Idempotent: already absorbed → `200` (original
  `absorbedAt`); unknown / not yours → `404` (treat as done). An open session
  cannot be absorbed → `409`. Absorb only **after** the `focusMinutes` PUT
  that includes the session succeeded.

`phoneFocusMinutes` on `GET /api/tasks` (list and `?eventId=`) =
`floor(Σ(endedAt − startedAt) / 60 s)` over the caller's closed, unabsorbed
sessions on that task — summed first, then floored (two 90 s sessions = 3).
Display rule (phone, web):
`live = focusMinutes + phoneFocusMinutes + (focusStartedAt ? now − focusStartedAt : 0) + (phoneFocusStartedAt ? now − phoneFocusStartedAt : 0)`.

## Android push devices (`/api/devices`, #272)

Registers the Android app's FCM registration token so the server can push to
it. Same auth as everything above: `Authorization: Bearer fp_…` (or a session
cookie). The token owner is the user who receives the pushes.

- `POST /api/devices` — body `{"token":"<FCM registration token>","platform":"android"}`
  (`platform` optional, defaults to `"android"`; any other value → 400).
  Upsert: refreshes `last_seen_at`; a token already registered by another
  account is re-owned to the caller (one phone, one account).
  → `200 {"success":true}`. Call on every `onNewToken` and after the user
  enters/changes their API token; repeat calls are harmless.
- `DELETE /api/devices` — body `{"token":"<FCM registration token>"}`.
  Removes only the caller's row (another user's token is silently untouched).
  → `200 {"success":true}`. Call on sign-out / API-token clear.
- `400 {"error":"token is required"}` — missing, empty or non-string token.
- `400 {"error":"token is too long"}` — over 4096 chars.
- `400 {"error":"platform must be 'android'"}`.
- `401 {"error":"Unauthorized"}` — as everywhere.

What the device receives (FCM HTTP v1; every `data` value is a string):

| Kind | `notification` | `data` | `android` |
|---|---|---|---|
| Activity notification (same fan-out as Web Push: every `createNotification`) | `{title, body}` | `{"type":"notification","link":"/path"}` (`link` omitted when none) | `priority: high` |
| Sync nudge, silent | none | `{"type":"events_changed","actorId":"<user id>"}` | `priority: high`, `collapse_key: events_changed`, `ttl: 600s` |

`events_changed` is sent once per mutating request (create / update / move /
delete / occurrence edit or cancel / bulk edit / .ics import + undo) to every
user who can see an affected calendar (actor, calendar owners, family
members). Its only field is `actorId` (#281): the id of the user whose edit
caused it (same id as `GET /api/me` → `user.id`). Every recipient refetches
the events it caches and reschedules local reminders; a device signed in as
`actorId` does so silently (no "Event updates" notice — it was your own
edit). Missing `actorId` (older server) → treat as someone else's edit. RSVPs do not send it. Dead tokens (FCM 404 / `UNREGISTERED`
/ invalid token) are pruned server-side; the app just re-POSTs on
`onNewToken`.

### Owner setup (one-time)

1. Firebase console → create/choose the project, add the Android app
   (package id `com.familyplanz.app`) and copy its four client values into
   `apps/android/firebase.properties` (#273, see `docs/guides/android-push.md`).
2. Project settings → Service accounts → Generate new private key.
3. Vercel → Project → Settings → Environment Variables:
   `FCM_SERVICE_ACCOUNT_JSON` = the JSON, ideally base64
   (`base64 -w0 key.json`), for Preview and Production; redeploy.
   Unset = Android push silently skipped (Web Push unaffected).
4. Create the table (also bundled for the cold-start runner):
   `npx dotenv -e .env.preview -- node scripts/db-exec.mjs sql/migrations/023-device-tokens.sql`
   then the same with `.env.prod`. Idempotent.

## Mobile sign-in (`/api/mobile/auth/*`, #288)

How the Android app gets its `fp_` token without the user pasting one. All
endpoints are `POST`, JSON in / JSON out, **never set cookies, never need a
session**, and mint the same personal API token as Settings → API tokens
(named `Android — <deviceName>`, listed/revocable on /account; one row per
sign-in). Store the returned `token` where a pasted token lived and use it as
`Authorization: Bearer` everywhere above.

Client rules:

- Send `Content-Type: application/json` (SvelteKit's CSRF check rejects
  Origin-less `text/plain` / form-encoded POSTs). Send no `Origin` header (a
  cross-site browser `Origin` is 403'd by the API origin check).
- Send **no** `Authorization` header on `email` / `verify` / `password` /
  `guest`: a stale Bearer on any `/api/*` path is 401'd by the hook before
  the route runs.
- `deviceName`: optional everywhere; trimmed, cut to 60 chars, default
  `"Android"`.
- `user` (every 200 below): `{"id","firstName","lastName","email"}`.
  `email` is `null` for an **Anonymous Account** (guest) — the placeholder
  address is never returned.
- Every 4xx/5xx body is `{"error":"<message>"}`; the message is user-facing.
  Malformed / non-object JSON → `400 {"error":"Request body must be JSON"}`.
  Unexpected faults → `500 {"error":"Something went wrong — try again"}`.
- Rate limits are the web's (per client IP, keyed with the email where there
  is one) and share the web's buckets: email 5 / 15 min, verify 10 / 15 min,
  password 10 / 5 min, guest 10 / hour (per IP). Over the limit →
  `429 {"error":"Too many attempts — try again in a few minutes"}`.

### POST /api/mobile/auth/email

Body `{"email","intent":"login"|"signup","firstName"?,"lastName"?}` —
`firstName` + `lastName` are **required for `signup`** (stored with the code;
the account is created from them at verify), ignored for `login`.

- `200 {"sent":true}` for every well-formed email — including unknown emails
  on `login` and already-registered emails on `signup`, where nothing is sent
  (no account enumeration). Sends the web's verification email: an
  **8-digit** numeric code (plus a web sign-in link), valid 15 minutes.
- `400 {"error":"Enter a valid email"}`.
- `400 {"error":"intent must be \"login\" or \"signup\""}`.
- `400 {"error":"First and last name are required"}` — `signup` only.
- `429`; `500 {"error":"Couldn't send the email — try again"}`.

### POST /api/mobile/auth/verify

Body `{"email","code","intent","deviceName"?}` (`intent` must match the one
used at `/email`; whitespace around `code` is ignored).

- `200 {"token":"fp_…","user":{…}}`. `login` signs into the existing
  account; `signup` creates it (same as web code signup: email verified,
  settings + personal calendar). The code is single-use.
- `400 {"error":"That code is wrong or expired"}` — wrong, expired, already
  used, or issued for the other intent. Missing `code` reads the same.
- `400 {"error":"Enter a valid email"}`, `400` bad `intent`.
- `409 {"error":"An account with this email already exists — sign in instead"}`
  — `signup` race (email registered after the code was sent).
- `429`.

### POST /api/mobile/auth/password

Body `{"email","password","deviceName"?}`.

- `200 {"token":"fp_…","user":{…}}`. Never creates an account.
- `401 {"error":"Email or password is incorrect"}` — wrong password, unknown
  email, or an email-code-only account (no password set) all read the same.
- `400 {"error":"Email and password are required"}`; `429`.

### POST /api/mobile/auth/guest

Body `{"deviceName"?}` (empty body allowed). Creates an **Anonymous Account**
(same as the web's guest) and a token for it.

- `200 {"token":"fp_…","user":{"id","firstName":"Guest","lastName":"","email":null}}`.
- `429`.

The guest keeps its data under that token; to keep it across devices the user
Claims it on the web (no native claim flow yet).

### POST /api/mobile/auth/logout

Header `Authorization: Bearer fp_…`, no body.

- `200 {"success":true}` — revokes **exactly the presented token** (the
  user's other tokens and web sessions are untouched). Then run the local
  sign-out (FCM `DELETE /api/devices` first, while the token still works).
- `401 {"error":"Unauthorized"}` — missing / unknown / already-revoked token.

## App screen endpoints (#292, Lane L0)

JSON twins of the website's page loads, so the Android app (Bearer `fp_`)
reads the same data as the web's mobile view. Each one calls the **same
server function** as its web page (no second query dialect). All take a
Bearer token or a web session cookie; 401 / 500 as universal. A family
another user belongs to is never readable: `403 {"error":"Not a member of this family"}`
unless stated otherwise.

### GET /api/me (G1)

- `200 {"id","firstName","lastName","email","emailVerified","isAnonymous","roles","lastActiveAt","familyId"}`
  - `email`: string, or `null` for an Anonymous Account (the placeholder
    address is never sent).
  - `emailVerified`: boolean. `isAnonymous`: boolean (guest banner).
  - `roles`: string[] (`"admin"` shows the admin menu).
  - `lastActiveAt`: ISO datetime | null.
  - `familyId`: your family's id | null (no family → groceries "join a family" state).
- Only your own row. No other fields (no hash, no phone).

### GET /api/tasks/sections (G9)

The Tasks screen's three tabs, exactly as `/calendar/tasks` loads them
(`loadTaskSections`, `src/lib/server/services/tasksData.ts`). Runs the
Recurring Task cursor pin first, in your stored zone.

- `200 {"myTasks":[<Task+tags>],"pendingAssignments":[<Task+tags>],"requestedByMe":[<Task+tags>],"warnings":["myTasks"|"pending"|"requested"|"tasks+cursor", …]}`
  - `myTasks`: your personal tasks + accepted assignments.
  - `pendingAssignments`: assigned to you, waiting for accept/decline ("To accept").
  - `requestedByMe`: tasks you assigned to someone else ("Requested").
  - `warnings`: a list that failed to load comes back `[]` and its label is
    listed here (show a soft "couldn't load" note, never an error screen).

### GET /api/dashboard?date=YYYY-MM-DD (G8)

The Day Dashboard, exactly as `/calendar/dashboard` loads it
(`loadDashboard`, `src/lib/server/services/dashboardData.ts`), with the
page's streamed part resolved. `date` is read in your stored zone; omitted
= today.

- `200` body:

  ```json
  {
    "zone": "IANA zone (UTC when unset)",
    "dayISO": "start of the viewed day, ISO with offset",
    "isToday": true,
    "meId": "your user id",
    "familyId": "id|null",
    "modules": { "<moduleId>": true },
    "dailyVerse": { "reference", "text", "attribution" } | null,
    "taskCategories": [{ "id", "name" }],
    "data": {
      "userTasks": [<Task+tags>], "familyTasks": [<Task+tags, open only>],
      "familyMembers": [{ "userId", "firstName", "lastName", "email", "role", "memberType" }],
      "dayEvents": [<Event + color, source:"own"|"family", rsvp + attendance summary>],
      "top3": [<Task>],
      "glance": { "doneToday": 0, "openToday": 0, "weekStreak": 0 },
      "completedToday": [{ "id", "title", "completedAt" }],
      "kidsSchedule": [{ "id", "title", "start", "end", "allDay", "location", "kids": [{ "id", "name" }] }],
      "familyGroceries": [{ "name", "stores": [] }], "mineGroceries": [{ "name", "stores": [] }]
    },
    "warnings": ["tasks"|"events"|"family"|"task-wins"|"streak"|"settings"|"today's verse", …]
  }
  ```

  `modules` is the effective visibility (family switch AND your hidden list);
  a module that is off has empty data. `warnings` names legs that failed and
  came back empty.
- `400 {"error":"Invalid date"}` — `date` present but not `YYYY-MM-DD`.

### GET /api/calendars (G2)

The calendars you see, named and coloured as `/calendar` shows them
(`listCalendarsForUser`, `src/lib/server/services/calendarData.ts`).

- `200 {"calendars":[{"id","name","color","kind":"personal"|"family"}]}`
  - Personal first: `name` `"Personal Calendar"`, `color` = your settings
    colour, else `#fa8072`. Created on first read if missing.
  - Then your family's calendar (when you have a family and it has one):
    `name` = family name, `color` = family colour, else `#e0ffff`.
  - A task's `eventCalendarId` (G5) and an event's `calendarId` match these ids.

### GET /api/sponsored-events?month=YYYY-MM (G6)

The month's sponsored (ad) events the calendar shows. `month` omitted =
the current month in your zone.

- `200 {"events":[<Event> & {"isAd":true,"color":"#f59e0b"}]}` — all-day
  rows; `title` starts with `📢 `.
- `200 {"events":[]}` — you have not opted in (`showAdsAsEvents` off).
- `400 {"error":"Invalid month"}` — `month` present but not `YYYY-MM` (01–12).

### GET /api/daily-verse?date=YYYY-MM-DD (G7)

- `200 {"verse":{"reference","text","attribution"}}` — that day's verse
  (omitted `date` = today).
- `200 {"verse":null}` — hidden: `showDailyVerse` is off, or `verse` is in
  your hidden dashboard modules.
- `400 {"error":"Invalid date"}` — not a real `YYYY-MM-DD` date.

### GET /api/me/settings, PATCH /api/me/settings (G3)

The `/account` calendar-settings card (`loadAccountSettings` /
`saveCalendarSettings`, `src/lib/server/services/accountData.ts`).

- `GET` → `200 {"settings":{…},"verseTranslations":[{"id","label","attribution"}],"consentHistory":[{"decision","recordedAt"}]}`
  - `settings` fields: `weekStart` (`sunday|monday`), `timeZone` (IANA),
    `color` (`#rrggbb`), `defaultView`
    (`dayView|weekView|monthView|listView|dashboard` — the app opens on
    the Dashboard tab when it is `dashboard`), `defaultCalendarId` (id|null),
    `syncEventsToFamilyCalendar`, `autoParseEventDetails`, `showDailyVerse`,
    `showAdsAsEvents`, `verseTranslation`, `hiddenDashboardModules`
    (string[]|null). No row yet → the page defaults (`defaultView:"dayView"`, ads off).
- `PATCH` body: any subset of `weekStart, timeZone, color, defaultView,
  defaultCalendarId, syncEventsToFamilyCalendar, autoParseEventDetails,
  showDailyVerse, showAdsAsEvents, verseTranslation`. Unsent fields keep
  their stored value. `{"timeZone":"…"}` alone is the device-timezone
  auto-set. Turning `showAdsAsEvents` on/off writes the consent trail.
  - `200` → the same body as `GET` (after the save).
  - `400 {"error":"Invalid <field>"}` — wrong type/value;
    `400 {"error":"Unknown field: <name>"}`; `400 {"error":"Invalid JSON"}`;
    `400 {"error":"Invalid body"}` (not an object).
  - `400 {"error":"Selected default calendar is not available"}` — a
    `defaultCalendarId` you sent that you cannot see (a stored one is not
    re-checked on other changes).
  - `500 {"error":"Failed to save calendar settings"}`.
