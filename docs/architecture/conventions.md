# Conventions

How v2 code is written. The rules in [rules.md](rules.md) are machine-checked. The conventions here are the patterns those rules assume. When in doubt, copy the [kernel](../../src/lib/kernel/README.md) or a module that is already ported.

## File roles

A file in `src/lib/domains/<m>/` or `src/lib/screens/<m>/` is named `<m>.<topic>.<role>[.server].ts`. The topic is optional, for example `tasks.repo.server.ts` or `tasks.cursor.rules.ts`.

| role | contains | may import | `.server`? | tested by |
|---|---|---|---|---|
| `rules` | Pure domain logic: predicates (`canEditTask`), ranking, date math, closed vocabularies. Inputs in, outputs out; "now" and zone are parameters. | kernel isomorphic files, zod, luxon, same-module rules/contracts, lower modules' `index.ts` | no | `*.rules.test.ts`, table-driven |
| `contract` | zod schemas for request/response bodies, plus their inferred types. These are the wire format: the HTTP builders parse with them, `*.api.ts` uses them in the browser, and http tests validate responses against them. | same as rules | no | through http tests |
| `repo` | Every SQL query for the module's own tables. Functions take `db: Db` first. No authorization, no business rules. | kernel/db, `$lib/kernel/db/tables.server`, drizzle | yes | `*.repo.db.test.ts` |
| `service` | Use-cases: `(ctx, actor, input) → result`. Authorization, orchestration, transactions (`withTx`), calls into lower modules' services. Throws `AppError` for expected failures. | kernel, own repo/rules/contract, lower modules' `index.server.ts`/`index.ts` | yes | `*.service.db.test.ts` |
| `http` | `endpoint()` / `pageLoad()` / `formAction()` definitions that parse input and call services. No SQL, no rules. | kernel/http, own service/contract | yes | `*.http.db.test.ts` (golden contract) |
| `api` | Browser client for the module's endpoints. Returns typed results; no UI state. | kernel/client (task K-07), own contract | no | via state tests |
| `state` | `*.state.svelte.ts`: a runes class (`$state`/`$derived` plus methods, no `$effect`) holding one screen's or widget's client state. It takes an api client and toasts in its constructor. | own api/rules/contract, kernel/client | no | `*.state.test.ts`, in node with no DOM |
| `fixtures` | `*.fixtures.server.ts`: row builders for this module's db tests. | kernel/testing, tables | yes | n/a |
| `ui/*.svelte` | Components. Data and callbacks in, events out. Never `fetch`. | own state/api/rules/contract, kernel/ui, lower modules' `ui/index.ts` | no | `ui/*.svelte.test.ts` |

Entry files: `index.ts` (isomorphic public interface), `index.server.ts` (server public interface), `ui/index.ts` (public components). Everything a module exports publicly is re-exported from one of them and listed in its README.

## Signatures

```ts
// services: ctx first, actor second (omit actor for system jobs), one input object last
export async function completeTask(ctx: Ctx, actor: Actor, input: TaskCompleteInput): Promise<Task>
// repos: db first, plain arguments
export async function findTaskById(db: Db, taskId: string): Promise<TaskRow | null>
// rules: plain values, "now" passed in
export function nextCursorDue(due: string, schedule: Schedule, now: Date): string
```

- Return values; do not mutate arguments.
- Name exports with the module noun (`createTask`, `listGroceryItems`). R11 requires exported names to be unique.
- Reads are named `get…` (one row or throw notFound), `find…` (one or null) and `list…` (many). Writes use a verb: `create…`, `update…`, `delete…`, `complete…`, `assign…`. Predicates are named `can…` / `is…`.
- Types are PascalCase singular. A zod schema and its inferred type share one name in the contract file: `export const TaskCreateBody = z.object(…); export type TaskCreateBody = z.infer<typeof TaskCreateBody>;`

## Errors

- Expected failures throw kernel `AppError` (`invalid`, `unauthorized`, `forbidden`, `notFound`, `conflict(msg, { field })`, `tooMany`, `unavailable`). The message is user-facing copy and part of the contract. When porting, keep the legacy wording; the golden tests pin it.
- Anything else is a fault. Let it throw. The builders log it, file it as a bug report and answer 500 `{ error: failMessage }`.
- Never `catch` just to return `null`. If a caller can recover, return a typed result such as `{ ok: false, reason }`.

## Validation

- Parse once, at the boundary, through the `query` / `body` / `params` / `form` schemas of the HTTP builders. Services receive typed input and never re-check types.
- Reuse kernel `validators` (`requiredText`, `isoDate`, `emailAddress`, `oneOf`, …) instead of writing regexes.
- Optional/nullable rules from the Android contract matter: absent and `null` can mean different things (the `focusMinutes` never-wipe rule and `focusStartedAt: null` clears). Model them explicitly with `.optional()` and `.nullable()` and pin them with a test.

## Time and dates

- "Now" comes from `ctx.clock.now()` (rule R5). Rules take `now: Date` and the user's IANA zone as parameters.
- Instants are stored and sent as ISO strings in UTC. Date-only values are `YYYY-MM-DD` strings in the user's zone.
- Date formatting, day grouping and month arithmetic get one home in `kernel/time` (task K-06). Do not write another formatter.

## UI

- Svelte 5 runes only (`$props`, `$state`, `$derived`, `$effect`). No `export let`, no `$:`, no stores for new state.
- Components get data and callbacks. Page-level orchestration (load, optimistic update, rollback, toast) lives in a `*.state.svelte.ts` class that takes the module's api client, so tests drive it with a fake api and no DOM.
- Every interaction is acknowledged within 100 ms: an optimistic update or a pending state. Confirm with a toast or inline status that says what happened and what comes next. Never use bare `alert()` or a silent reload. Loading states are skeletons, not blank cards.
- Do not put `bind:` on components (SSR settle-loop 500, issue 200). Bind only on plain DOM elements.
- Give interactive elements a `data-testid`.
- When writing Svelte, follow the Svelte MCP workflow in [docs/guides/svelte-mcp.md](../guides/svelte-mcp.md) and run the autofixer until it is clean.
- Content rule (owner directive, also in [AGENTS.md](../../AGENTS.md)): family imagery is man + woman + children only (👪, 👨‍👩‍👧‍👦).

## Comments

- Explain *why*: the domain rule, the incident, the ticket (`#214`; old tickets are in [docs/archive/issues/](../archive/issues/)). Do not restate the code.
- Every file starts with a short header comment saying what it is and pointing at its module README.

## One home per concept

Before writing a helper, find its concept below and use (or build) the one home. The "legacy copies" column lists what the rewrite folds into that home. Fold them when porting the module that uses them, and delete the copies.

| concept | the one home | legacy copies to fold |
|---|---|---|
| auth guard for JSON / pages / actions | `endpoint` / `pageLoad` / `formAction` auth modes (kernel/http) | `requireUser`, `requireUserAction`, `requireUserJson`, `requireAdminJson`, ~16 hand-rolled `if (!locals.user)` in api routes, ~20 `redirect(302,'/login')` in loaders |
| error JSON + 5xx auto-filing | `AppError` + endpoint error mapping (kernel) | `server/utils/apiError.ts`, `hooks.server.ts` handleError copy, `utils/actionError.ts`, `components/family/responseError.ts` |
| request body / form parsing | builder `body`/`form` schemas + kernel `validators` | `readJsonObject`, `isString`/`isNonEmptyString` (10+ files), `clampCount`, `pickWritableFields`, `typeGuards.ts`, `focusStartedAt.ts` |
| email address rule | `validators.emailAddress` / `isEmailAddress` | `EMAIL_REGEX` in magicLink.ts, mobileAuth.ts; contact/waitlist regex |
| YYYY-MM(-DD) params | `validators.isoDate` / `yearMonth` | sponsored-events, daily-verse, dashboard, meals regexes |
| "now", ids, hashing | `ctx.clock`, `ctx.ids`, `sha256Hex` (kernel) | `Date.now()` in ~20 modules, `generateId`, `hashApiToken`, `hashEmailCode`, claim-token hash |
| rate limiting | endpoint `rateLimit` / `ctx.limiter` + `clientKeyOf` | `rateLimit()` + `clientKey()` triple-call idioms in claimRequest, passwordSignup, mobileAuth |
| date formatting / day keys / month math | `kernel/time` (task K-06) | `dateUtils.formatDate`, `eventTime.formatEventTime`, `taskDisplay.formatDue*`, `taskFeedback.shortDate`, `admin/export` humanDate/isoDate, `TopPrioritiesCard.dueLabel`, `EditTaskDialog.toInputDate`, `groupByDateKey` ×2 (`eventDisplay`, `listGroup`), `addMonthsClamped` (taskQuickAdd) |
| timestamp shape normalization | `kernel/time` (K-06) | `eventTimes.toDateTime`, `recurrenceService.parseTimestamp`, `icsImportPreview.isoOrNull`, `toIsoTimestamp`, `familyActivity.toIso` |
| recurrence stepping (frequency + interval) | calendar rules `scheduleStep` (tasks cursor and parsers call it, or use kernel/time month math) | `recurrenceService.scheduleStep`, `taskQuickAdd.shiftDate`, NLP month stepping, `bulkAiService` |
| recurrence label ("every 2 weeks") | calendar rules `describeRecurrence` | `taskDisplay.freqNoun`, `taskFeedback` private copy, `TaskQuickAddPreview` FREQ_NOUN, `EventModalHeader`, `EventRecurrenceCard` UNITS |
| task shape | tasks `contract` types | ~8 ad-hoc `TaskLike` types (familyTaskActions, familyTaskList, taskUrgency, taskSort, taskEditPayload, taskFeedback, …) |
| task grouping / filtering | tasks rules (board grouping, filters) | `familyTaskList`, `familyTaskGroups`, `familyTaskActions.matchesTagFilter` |
| browser fetch + error copy | module `*.api.ts` on kernel api client (K-07) | 43 `fetch('/api/…')` calls in components, `client/task*.ts`, "That didn't work. Try again." ×5 |
| toasts | kernel client toasts (K-07) | `client/toasts.ts` store |
| device-local preferences | kernel client `localPref` (K-07) | `calendarVisibility.ts` + `calendarAssignees.ts` KeyValueStorage boilerplate |
| debounced search + stale guard | kernel client `createSearch` (K-07) | CreateFamilyMemberPicker, MemberSearchTab, LocationSearch |
| ticking "now" in UI | kernel client `ticker` (K-07) | TaskRow + TaskLoggedTimeBand `setInterval` copies |
| modal / sheet shell | kernel ui `Sheet` (K-08) | TaskDetailModal, EditTaskDialog, DayEventsModal, EventModal hand-rolled shells |
| delete / confirm two-step | kernel ui `ConfirmAction` (K-08) | 8 copies (TaskRow, TaskCompletedRow, FamilyOpenTaskRow, TaskDetailBar, EventModalBar, EventDeleteConfirm, AccountDangerSection, MemberChildTab) |
| chips / pills | kernel ui `Pill` + calendar `chipVocabulary` | TaskRow slot pills, CategoryChip, CategorySelect, TaskDetailModal spans |
| skeleton rows | kernel ui `Skeleton` (K-08) | AccountNotificationsSection, ChecklistSection, EventModal |
| colour from a name / id | kernel ui `colorHash` (K-08): `nameColor` (the #115 single name hash) and `idColor` (avatar, deliberately different) | `hashName`, `contactColors`, `avatarColor` |
| person display name | identity rules `displayName` | `${firstName} ${lastName}`.trim() fallbacks in 5+ components |
| SQL statement splitting for migrations | kernel/db migrations (task K-05) | `runner.ts splitStatements`, `scripts/db-apply.mjs`, `scripts/db-exec.mjs` |
| retention prune | each module's `prune…OlderThan(ctx, cutoff)` service, called by `app` cron | 4 copies of delete-where-older-than |
| test row builders | kernel `seedUser` + `<module>.fixtures.server.ts` | `seedUser` re-implemented per real test, e2e factory |
| `$app/navigation` / toast mocks in UI tests | callbacks and api props (no mocks); global stubs in the ui test setup if unavoidable | ~15 per-file `vi.mock('$app/navigation')` |
