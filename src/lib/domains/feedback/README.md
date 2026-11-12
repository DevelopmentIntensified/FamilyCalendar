# feedback

**domain** — Bug reports (user-filed and auto-filed faults), unmatched NLP phrases, the admin registers and their export.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns: **Bug reports** (what a person filed from `/report-bug`, plus the ones the server files itself when something truly unexpected fails) and the two **admin registers** over them (`/admin/bugs`, `/admin/nlp`), with their plain-text "Export for agent" text.
- Owns: **Unmatched phrases** — the natural-language phrases a parser could not handle, deduplicated and counted so a parser rule can be written from the register.
- Does not own: deciding that a phrase is unmatched (the parser that called `/api/report-phrase` owns that rule), who may see the admin pages (`admin` screen), capturing a failure (`app`'s `Ctx.faults` port calls in here; the skip and throttle rules below it are ours), or any notification (nothing is sent).

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: contract types, the area/source vocabularies and labels, phrase normalization, the reported-path rule (issue 257) and the two register exporters. | `feedback.rules.test.ts`, `feedback.export.rules.test.ts` |
| [index.server.ts](index.server.ts) | entry | Public server interface: the services (`fileBugReport`, `fileAutoBugReport`, `reportUnmatchedPhrase`, `listFeedback`, `resolveFeedback`, `countOpenFeedback`, `pruneResolvedFeedback`), the six `/api` endpoint handlers and the `/report-bug` page handlers. | `feedback.service.db.test.ts`, [feedback.http.db.test.ts](feedback.http.db.test.ts) |
| [ui/index.ts](ui/index.ts) | entry | Public components: the bug report form, one feedback register (open + resolved) and the export widget. | `ui/*.svelte.test.ts` |
| [feedback.http.db.test.ts](feedback.http.db.test.ts) | test | Golden `/api` contract for the six routes: status, full body, error copy, absent-vs-null, rate limits and the rows written. Runs committed, driving the legacy route modules, so it must stay unchanged after S6. | — |

Planned by the port (S3–S7; not created yet): `feedback.contract.ts`, `feedback.rules.ts`, `feedback.export.rules.ts`, `feedback.repo.server.ts`, `feedback.service.server.ts`, `feedback.http.server.ts`, `feedback.api.ts`, `feedback.register.state.svelte.ts`, `feedback.fixtures.server.ts` and their tests, plus `ui/ReportBugForm.svelte`, `ui/FeedbackRegister.svelte`, `ui/FeedbackExport.svelte`.

## Public interface

Everything other modules and routes may use, grouped by entry file. One line each: `name` — what it does.

- `index.ts`:
  - `BUG_AREAS` / `type BugArea` — the closed, ordered area list (calendar, tasks, account, payments, dashboard, other). Inlining it into the endpoint, the form and the exporter is what produced three drifting copies in legacy.
  - `BUG_AREA_LABEL` / `UNMATCHED_SOURCE_LABEL` — the one label map; the export text is wire (`GET /api/admin/**`), so the labels cannot fork.
  - `type UnmatchedSource`, `type FeedbackKind` (`'bug' | 'phrase'`) — the two closed vocabularies the services switch on.
  - `normalizePhrase(phrase)` — lowercase, collapse whitespace, trim, cap 280: the dedup key of an unmatched phrase.
  - `safeReportedPath(raw, origin?)` / `reportBugHref(currentPath)` — issue 257: the reported page must be the page the bug was on, not `/report-bug`; rejects other origins, `//`, `/\`, bare paths, `javascript:` and the form itself.
  - `matchedSummary(matched)` / `reporterName(row)` — the two display reductions used by the register pages and the exports.
  - `formatBugReportsExport(open)` / `formatUnmatchedPhrasesExport(open)` — the agent-ready text; lives here because the API and the page must produce byte-identical text.
- `index.server.ts`:
  - `fileBugReport(ctx, actor, input)` — validate, trim/cap, store a user-filed report; the one write path for both `POST /api/bug-report` and the `/report-bug` action.
  - `fileAutoBugReport(ctx, fault)` — the fault filer: skip 404/blank/abort, derive the area from the path, throttle one per failure key per 10 minutes, store. Hides the whole auto-filing policy behind one call.
  - `reportUnmatchedPhrase(ctx, actor, input)` — normalize + upsert on `(source, phrase)`; never fails the caller.
  - `listFeedback(ctx, actor, kind)` — one admin register as `{ open, resolved }`; the admin gate lives here, so the screen cannot forget it.
  - `resolveFeedback(ctx, actor, kind, id)` — close one row of either register; `kind` picks the 404 copy.
  - `countOpenFeedback(ctx)` — `{ bugs, phrases }` open counts for the admin nav badge (one call, two counts).
  - `pruneResolvedFeedback(ctx, cutoff)` — 180-day retention for both tables; called by the cleanup cron in `app`.
  - `submitBugReportEndpoint`, `reportUnmatchedPhraseEndpoint`, `listBugReportsEndpoint`, `listUnmatchedPhrasesEndpoint`, `resolveBugReportEndpoint`, `resolveUnmatchedPhraseEndpoint` — the six route handlers; one name per route keeps the routes wiring-only (R8) and the names unique (R10).
  - `reportBugPageLoad` / `submitBugReportAction` — the `/report-bug` page's load (302 to `/login` when signed out, resolves `from`) and its `fail(…)` action.
- `ui/index.ts`:
  - `ReportBugForm` — area select, description, hidden `from`, inline error, pending submit; takes data and a submit callback.
  - `FeedbackRegister` — one register: open items (cards for bugs, tables per source for phrases) plus a collapsible Resolved list and a resolve callback.
  - `FeedbackExport` — the readonly export textarea with Copy and Download, and the two toasts (copied / select-and-copy).

## How to test

- Whole module: `npm run test:mod -- feedback` (add `--legacy` while legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup.
- Database + services: `*.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: `feedback.http.db.test.ts` pins status + body of every endpoint (golden tests). Committed mode (`beforeEach(truncateAll)`, legacy handlers write outside a transaction); each test claims its own `x-real-ip` because the legacy limiter shares one bucket map per file.
- UI: `ui/*.svelte.test.ts` render with props; state classes are tested without a DOM.
- Fixtures: `feedback.fixtures.server.ts` (planned: `bugReportRow`, `unmatchedPhraseRow`).

## Invariants

Behaviour that must not change, each with the test that pins it (`file › test title`):

**`/api` wire (pinned by `feedback.http.db.test.ts`, written against the legacy route modules at S2)**

- `POST /api/bug-report` checks auth → rate limit → body, so a signed-out caller gets 401 and a throttled one 429 before any parsing — `src/routes/api/bug-report/+server.ts:24-30` — `feedback.http.db.test.ts › checks the session before the rate limit and throttles the sixth report per IP`.
- The bug report area is one of the six (case-sensitive); description is trimmed and must be 1..5000; anything else — including a non-JSON or array body — is `400 {"error":"area (one of calendar, tasks, account, payments, dashboard, other) and description (<=5000 chars) are required"}` — `src/routes/api/bug-report/+server.ts:32-52` — `feedback.http.db.test.ts › answers 400 for an unknown or differently-cased area`, `› … blank description`, `› … description over 5000 chars`, `› … a body that is not a JSON object`.
- Success is `200 {"success":true,"id":<row id>}`; the stored description is trimmed and capped at 5000, the url is trimmed, capped at 2000, and absent / `null` / blank all store `NULL` — `src/lib/server/db/actions/bugReports.ts:29-41` — `feedback.http.db.test.ts › files a report for a signed-in user and answers {success, id}`, `› trims the description and caps the stored url at 2000 chars`, `› stores an absent, null or blank url as null`.
- Bug reports are throttled to 5 per 5 minutes per IP: `429 {"error":"Too many reports. Try again shortly."}`, and nothing is written — `src/routes/api/bug-report/+server.ts:28-30` — `feedback.http.db.test.ts › checks the session before the rate limit and throttles the sixth report per IP`.
- `POST /api/report-phrase` orders the same way (401 → 20 per 5 minutes per IP → validation) and answers `200 {"success":true}` — `src/routes/api/report-phrase/+server.ts:27-33,55-56` — `feedback.http.db.test.ts › throttles to 20 reports per IP per 5 minutes with 429`, `› answers 401 {"error":"Unauthorized"} when signed out`.
- A phrase report needs a non-blank phrase of at most 280 characters and a source of `event_parse` or `bulk_edit`, else `400 {"error":"phrase (string) and source (event_parse | bulk_edit) are required"}` — `src/routes/api/report-phrase/+server.ts:42-52` — `feedback.http.db.test.ts › answers 400 for an unknown source`, `› … a blank phrase`, `› accepts 280 chars and answers 400 at 281`.
- The stored phrase is trimmed by the route and then normalized (lowercase, whitespace collapsed, capped at 280); the sample starts as the normalized phrase and `matched` holds the posted JSON — `src/lib/server/db/actions/unmatchedPhrases.ts:33-57` — `feedback.http.db.test.ts › stores the normalized phrase and the match sample`.
- A repeat report upserts on `(source, phrase)`: `count` + 1, `sample`/`updatedAt` refreshed, and `matched` replaced only when a payload is supplied (absent and `null` store `NULL`) — `src/lib/server/db/actions/unmatchedPhrases.ts:42-82` — `feedback.http.db.test.ts › increments the count and refreshes the sample for a repeat, keeping sources apart`, `› stores no sample when matched is absent or null`.
- The 280 cap runs on the raw (trimmed) phrase before normalization, so a whitespace-heavy phrase that would normalize short is refused with 400 — `src/routes/api/report-phrase/+server.ts:48` vs `src/lib/server/db/actions/unmatchedPhrases.ts:34` — `feedback.http.db.test.ts › refuses a whitespace-heavy phrase over 280 chars before normalizing it (Q-006)`; question [Q-006](../../../../docs/rewrite/questions.md).
- Admin endpoints answer `401 {"error":"Unauthorized"}` with no user and `403 {"error":"Forbidden"}` for a signed-in non-admin — `src/lib/server/services/adminData.ts:24-31` — `feedback.http.db.test.ts` › the 401/403 tests of `GET /api/admin/bugs`, `POST /api/admin/bugs/[id]/resolve`, `GET /api/admin/nlp`, `POST /api/admin/nlp/[id]/resolve`.
- `GET /api/admin/bugs` answers `{open, resolved, exportText}`: open = `resolvedAt IS NULL`, resolved = `NOT NULL`, both newest first, with the reporter's first/last name from a left join (both `null` when the reporter is gone) — `src/lib/server/db/actions/bugReports.ts:55-77` — `feedback.http.db.test.ts › lists open and resolved reports with reporter names and an open-only export`.
- `GET /api/admin/nlp` answers `{phrases, resolved, exportText}`: open by `resolved` false ordered `count` desc then `createdAt` desc, resolved likewise — `src/lib/server/db/actions/unmatchedPhrases.ts:85-91` — `feedback.http.db.test.ts › lists open and resolved phrases with an open-only export`.
- Both exports cover **open items only** and the empty register still prints the header and `Open: 0`: bug reports render `[Area] description  (page: <url or n/a> · <YYYY-MM-DD HH:MM>)` with newlines collapsed and never a reporter name; phrases group by source as `## <Source> (N)` with `"phrase" — Nx, first seen YYYY-MM-DD` (+ ` matched: <json>`) and a `Open: N unique (M occurrences)` header — `src/lib/admin/export.ts:136-193` — `feedback.http.db.test.ts › lists open and resolved reports …`, `› lists open and resolved phrases …`, `› answers an empty register and an empty export` (both registers).
- `POST /api/admin/bugs/[id]/resolve` answers `200 {success, report}` with `status:"resolved"` and `resolvedAt` now, `404 {"error":"Bug report not found"}` for an unknown id — `src/routes/api/admin/bugs/[id]/resolve/+server.ts:7-12`, `src/lib/server/db/actions/bugReports.ts:79-86` — `feedback.http.db.test.ts › marks the report resolved and returns the updated row`, `› answers 404 {"error":"Bug report not found"} for an unknown id`.
- Resolving an already-resolved report answers 200 again and moves `resolvedAt` forward — `src/lib/server/db/actions/bugReports.ts:82` — `feedback.http.db.test.ts › answers 200 for an already-resolved report and re-stamps resolvedAt (Q-007)`; question [Q-007](../../../../docs/rewrite/questions.md).
- `POST /api/admin/nlp/[id]/resolve` answers `200 {success, phrase}` with `resolved:true`, `404 {"error":"Phrase not found"}`, and a second resolve is a 200 no-op — `src/routes/api/admin/nlp/[id]/resolve/+server.ts:7-12`, `src/lib/server/db/actions/unmatchedPhrases.ts:93-100` — `feedback.http.db.test.ts › marks the phrase resolved and returns the updated row`, `› answers 404 {"error":"Phrase not found"} for an unknown id`, `› answers 200 again for an already-resolved phrase`.

**Domain rules (pinned by the S3/S5 tests named here)**

- The six areas are a closed ordered vocabulary; the writer maps anything else to `other` as a second line of defence (both callers validate first) — `src/lib/server/db/actions/bugReports.ts:6-13,30` — `feedback.rules.test.ts › maps an unknown area to other`.
- Auto-filing skips 404s, blank messages and abort errors; otherwise the description is `[auto-filed <status>] <message>` capped at 5000 and the url is the path capped at 2000 — `src/lib/server/services/autoBugReport.ts:13-32` — `feedback.rules.test.ts › buildAutoBugReport …`.
- The auto-filed area comes from the path: `/dashboard` → dashboard; `/calendar` or `/api/events` → calendar; `/tasks` or `/api/tasks` → tasks; `/account`, `/claim`, `/login` → account; else other — `src/lib/server/services/autoBugReport.ts:34-41` — `feedback.rules.test.ts › maps paths to areas`.
- Auto-filing is throttled to one report per failure key per 10 minutes, key `` `${area}:${path}:${message.slice(0, 120)}` `` — `src/lib/server/services/autoBugReport.ts:10,44-49` — `feedback.service.db.test.ts › files one auto report per failure key per ten minutes`.
- Unauthenticated callers are never auto-filed (#153); API 5xx responses file fire-and-forget while 4xx never do; filing never throws and never delays the response — `src/hooks.server.ts:201,209-211`, `src/lib/server/utils/apiError.ts:27-37` — `feedback.service.db.test.ts › files a fault for a signed-in caller`, `› never files for an anonymous caller`.
- A blank description stores nothing (the page/action copy below is what the person sees) — `src/lib/server/db/actions/bugReports.ts:31-32` — `feedback.rules.test.ts › refuses a blank description`.
- `/report-bug` load redirects an anonymous visitor `302 /login`; the reported page is `?from` then the GET referer, and the action reuses the hidden `from` then the POST referer, falling back to the path — `src/routes/report-bug/+page.server.ts:11-19,29-33,52` — `feedback.page.db.test.ts › resolves the reported page from ?from, then the referer`.
- Submit copy: no user → `Please log in to report a bug.` (401); bad area → `Please choose a category.` (400); blank description → `Please describe the bug.` (400); over 5000 → `Description is too long (max 5000 characters).` (400); write failure → `Could not save your report. Please try again.` (500) — `src/routes/report-bug/+page.server.ts:22-58` — `feedback.page.db.test.ts › reports the form errors with the legacy copy`.
- `matchedSummary` returns `null` for absent or invalid JSON, drops `null`/`''`/`false`/empty arrays and stringifies nested values; `reporterName` falls back to `Anonymous / deleted` — `src/lib/admin/export.ts:100-129` — `feedback.export.rules.test.ts › matchedSummary …`, `› reporterName …`.
- Retention is 180 days and never touches open items: closed reports (`status <> 'open'`) whose `coalesce(resolvedAt, createdAt)` is before the cutoff, and resolved phrases whose `updatedAt` is — `src/lib/server/db/actions/bugReports.ts:102-112`, `src/lib/server/db/actions/unmatchedPhrases.ts:116-124`, `src/routes/api/cron/cleanup/+server.ts:16,37-45` — `feedback.service.db.test.ts › prunes only closed rows older than the cutoff`.
- The cleanup cron accepts `Authorization: Bearer $CRON_SECRET` or `x-cron-secret` and answers `401 {"error":"Unauthorized"}` otherwise; that route stays in `app`, which calls `pruneResolvedFeedback` — `src/routes/api/cron/cleanup/+server.ts:62-79` — `app`'s cron http test.
- `safeReportedPath` accepts a rooted same-origin path or an absolute URL on the given origin and rejects other origins, `//`, `/\`, bare paths, `javascript:` and `/report-bug` itself; the result is capped at 500 chars — `src/lib/utils/reportBug.ts:17-41` — `feedback.rules.test.ts › safeReportedPath (issue 257)`.

**UI (pinned by S7: `ui/*.svelte.test.ts` + the K-10 visual check)**

- `/report-bug`: friendly-labelled area select, description textarea capped at 5000, hidden `from`, a Back link to the origin (fallback `/calendar`), inline error banner, "Submitting…" while sending, then "Thanks — report submitted".
- `/admin/bugs` and `/admin/nlp`: the register plus "Export for agent" (readonly textarea, Copy toast, Download `<base>-YYYY-MM-DD.txt`); the export text is recomputed after a resolve, so closed rows leave it.

## Depends on

- May import: kernel + identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse, sponsored, meals (public entries only).
- Owns tables: `bugReports`, `unmatchedPhrases`.
- Reads (join only): `users` — the reporter's first/last name on the bug register.
- Calls: kernel only — `clock`, `ids`, `limiter`, the http builders, `AppError`, and (after K-06) the `kernel/time` date helpers the exports need. No other module's services.
- Called by: `app` (`Ctx.faults` → `fileAutoBugReport`, cleanup cron → `pruneResolvedFeedback`), `admin` screen (`listFeedback`, `countOpenFeedback`, `resolveFeedback`, export rules, the register/export components), `shell` (`Navbar`, `+error` → `reportBugHref`), `parsing` and `calendarPage` (browser → `reportUnmatchedPhrase`), and the `/api/bug-report`, `/api/report-phrase`, `/api/admin/**` and `/report-bug` route files.
