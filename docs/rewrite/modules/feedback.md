# Port sheet: feedback

**domain** · rank 14 · port #1 · home: `src/lib/domains/feedback/` · README after the port: `src/lib/domains/feedback/README.md` (written in S1)

Bug reports (user-filed and auto-filed faults), unmatched NLP phrases, the admin registers and their export.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse, sponsored, meals.
- **Owns tables:** `unmatchedPhrases`, `bugReports`.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `2ec6835`
- [ ] S3 contract + rules
- [ ] S4 repo (+ fixtures)
- [ ] S5 service
- [ ] S6 http + route wiring (goldens unchanged since S2)
- [ ] S7 UI rebuild (rules, api, state, components, screen) + visual check
- [ ] S8 rewire importers, delete legacy code and legacy tests
- [ ] S9 README final, census --write, gate:push, ledger done

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- `POST /api/bug-report`: auth → rate limit 5 per 5 min per IP (`429 {"error":"Too many reports. Try again shortly."}`) → validation (`400` with `area (one of calendar, tasks, account, payments, dashboard, other) and description (<=5000 chars) are required`) → `200 {success:true,id}`; failure → `500 {"error":"Could not save report. Please try again."}`.
- Auto-filing: 404s and abort errors never filed; unauthenticated callers never filed (#153); one filing per failure key per 10 min; description `[auto-filed <status>] <message>` capped at 5000; area derived from the path.
- `/api/admin/bugs|nlp` (+ `/[id]/resolve`): admin only (401 / `403 {"error":"Forbidden"}`).
- Retention: resolved bug reports and unmatched phrases pruned after 180 days (cron).
- `POST /api/report-phrase`: signed-in, rate-limited; phrase normalization + conflict set; never 500s the caller (report failures are swallowed).

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/bug-report` | POST | signed-in | `{area: one of calendar,tasks,account,payments,dashboard,other, description: string, url?: string}`; description trimmed, 1..5000 chars; url trimmed, absent/blank → stored null | `200 {success:true, id}` | `401 {error:'Unauthorized'}`; `429 {error:'Too many reports. Try again shortly.'}` (5 per 5 min per IP); `400 {error:'area (one of calendar, tasks, account, payments, dashboard, other) and description (<=5000 chars) are required'}`; `500 {error:'Could not save report. Please try again.'}` | `src/routes/api/bug-report/+server.ts:23-68` |
| `/api/report-phrase` | POST | signed-in | `{phrase: string (non-empty, ≤280), source: 'event_parse'\|'bulk_edit', matched?: JSON|null}`; matched absent → null | `200 {success:true}` | `401 {error:'Unauthorized'}`; `429 {error:'Too many reports. Try again shortly.'}` (20 per 5 min per IP); `400 {error:'phrase (string) and source (event_parse \| bulk_edit) are required'}` | `src/routes/api/report-phrase/+server.ts:26-56` |
| `/api/admin/bugs` | GET | admin (`admin` role) | none | `200 {open, resolved, exportText}` — reports joined with reporter first/last name; export covers open only | `401 {error:'Unauthorized'}`; `403 {error:'Forbidden'}` | `src/routes/api/admin/bugs/+server.ts:11-16`; `src/lib/server/services/adminData.ts:42-47` |
| `/api/admin/bugs/[id]/resolve` | POST | admin | none; `id` from path | `200 {success:true, report}` (status `resolved`, `resolvedAt` now) | `401 {error:'Unauthorized'}`; `403 {error:'Forbidden'}`; `404 {error:'Bug report not found'}` | `src/routes/api/admin/bugs/[id]/resolve/+server.ts:7-12` |
| `/api/admin/nlp` | GET | admin | none | `200 {phrases, resolved, exportText}` — open and resolved separately; export covers open only | `401 {error:'Unauthorized'}`; `403 {error:'Forbidden'}` | `src/routes/api/admin/nlp/+server.ts:11-16`; `src/lib/server/services/adminData.ts:49-54` |
| `/api/admin/nlp/[id]/resolve` | POST | admin | none; `id` from path | `200 {success:true, phrase}` (`resolved: true`) | `401 {error:'Unauthorized'}`; `403 {error:'Forbidden'}`; `404 {error:'Phrase not found'}` | `src/routes/api/admin/nlp/[id]/resolve/+server.ts:7-12` |

### Rules the module must keep
- The six bug areas are a closed ordered list: calendar, tasks, account, payments, dashboard, other; an area outside it is stored as `other`, description is trimmed then capped at 5000, blank → no row, url is capped at 2000 and blank → null; write failures are logged and return null, never throw — `src/lib/server/db/actions/bugReports.ts:6-49`
- `POST /api/bug-report` orders checks auth → rate limit → validation, so an anonymous caller gets 401 and a throttled caller 429 before any body parsing — `src/routes/api/bug-report/+server.ts:23-51`
- `POST /api/report-phrase` orders the same way (auth → 20/5min → phrase/source validation) and never surfaces a storage failure to the caller — `src/routes/api/report-phrase/+server.ts:26-56`; `src/lib/server/db/actions/unmatchedPhrases.ts:65-82`
- Auto-filing skips status 404, blank messages, and any message matching `/abort/i` (#049); description is `[auto-filed <status>] <message>` capped at 5000, url is the path capped at 2000 — `src/lib/server/services/autoBugReport.ts:13-32` · tests: `autoBugReport.test.ts` › "returns null for 404s", "returns null for client-abort messages (#049)", "truncates long messages with a clear prefix"
- Auto-filed area comes from the path in this order: `/dashboard` → dashboard; `/calendar` or `/api/events` → calendar; `/tasks` or `/api/tasks` → tasks; `/account`, `/claim`, `/login` → account; else other — `src/lib/server/services/autoBugReport.ts:34-41` · test: `autoBugReport.test.ts` › "maps calendar paths to calendar, unknown paths to other"
- Auto-filing is throttled to one report per failure key per 10 minutes, keyed `${area}:${path}:${message.slice(0,120)}` — `src/lib/server/services/autoBugReport.ts:10,44-49` · test: `autoBugReport.test.ts` › "throttles repeat filings for the same failure"
- Unauthenticated callers are never auto-filed (#153); API 5xx responses auto-file fire-and-forget via `apiError`, 4xx never do — `src/hooks.server.ts:198-211`; `src/lib/server/utils/apiError.ts:27-37`
- Phrase normalization: lowercase, collapse whitespace runs, trim, cap at 280; empty after normalization → nothing stored — `src/lib/server/db/actions/unmatchedPhrases.ts:33-39` · test: `unmatchedPhrases.test.ts` › "lowercases, collapses whitespace, trims, and caps length"
- Reporting a repeated phrase upserts on `(source, phrase)`, increments `count`, sets `sample`/`updatedAt`, and refreshes `matched` only when a match payload is supplied — `src/lib/server/db/actions/unmatchedPhrases.ts:42-82` · tests: `unmatchedPhrases.test.ts` › "refreshes the match sample on conflict when matches are provided", "leaves a prior sample alone when no matches are provided"
- Resolving a bug report sets `status:'resolved'` + `resolvedAt`; resolving a phrase sets `resolved:true`; neither checks current state, so a second resolve is a no-op success — `src/lib/server/db/actions/bugReports.ts:79-86`; `src/lib/server/db/actions/unmatchedPhrases.ts:93-100`
- The registers split on resolution: bug reports by `resolvedAt` null/not-null with reporter names via a left join; phrases by the `resolved` flag, ordered `count` desc then `createdAt` desc — `src/lib/server/db/actions/bugReports.ts:55-77`; `src/lib/server/db/actions/unmatchedPhrases.ts:85-91`
- Admin APIs require the `admin` role: 401 with no user, 403 `Forbidden` for a signed-in non-admin — `src/lib/server/services/adminData.ts:15-31`
- The admin pages redirect a non-admin GET 302 to `/login` and throw 403 `Forbidden` in their actions — `src/routes/(admin)/admin/bugs/+page.server.ts:12-19`; `src/routes/(admin)/admin/nlp/+page.server.ts:12-21`
- Retention is 180 days and never touches open items: closed bug reports (`status <> 'open'`) whose `coalesce(resolvedAt, createdAt)` is before the cutoff, and resolved phrases whose `updatedAt` is before it — `src/lib/server/db/actions/bugReports.ts:102-112`; `src/lib/server/db/actions/unmatchedPhrases.ts:116-124`; `src/routes/api/cron/cleanup/+server.ts:16,38-45` · tests: `bugReports.prune.test.ts` › "never deletes open reports, however old", `unmatchedPhrases.prune.test.ts` › "never deletes unresolved phrases"
- The cleanup cron accepts `Authorization: Bearer $CRON_SECRET` or `x-cron-secret` and returns 401 otherwise — `src/routes/api/cron/cleanup/+server.ts:62-79`
- `safeReportedPath` accepts a rooted same-origin path or an absolute URL on the given origin, and rejects other origins, `//`, `/\`, bare paths, `javascript:`, and `/report-bug` itself; result is capped at 500 chars — `src/lib/utils/reportBug.ts:17-41` · test: `reportBug.test.ts` › "safeReportedPath (issue 257)" table
- `/report-bug` load redirects anonymous visitors 302 to `/login`; the origin is `?from` then the GET referer; the submit action reuses the hidden `from` then the POST referer, falling back to `/report-bug` — `src/routes/report-bug/+page.server.ts:11-52` · tests: `page.server.test.ts` › "stores the submitted `from` path, not the POST referer", "load falls back to the GET referer for links without ?from="
- Submit validation messages: no user → `Please log in to report a bug.` (401); bad area → `Please choose a category.` (400); blank description → `Please describe the bug.` (400); >5000 → `Description is too long (max 5000 characters).` (400); write failure → `Could not save your report. Please try again.` (500) — `src/routes/report-bug/+page.server.ts:22-58`
- Exports cover open items only: unmatched grouped by source with `Open: N unique (M occurrences)` and `"phrase" — Nx, first seen YYYY-MM-DD` (+ `matched: <json>`); bug reports never include reporter names, collapse newlines, and print `[Area] description  (page: <url or n/a> · date)` — `src/lib/admin/export.ts:136-193` · tests: `export.test.ts` › "renders area label, page and collapsed description — never reporter names", "groups by source with a frequency tag per phrase"
- `matchedSummary` returns null for absent/invalid JSON, drops null, `''`, `false` and empty arrays, and stringifies nested objects/arrays — `src/lib/admin/export.ts:100-122` · test: `export.test.ts` › "drops empty/blank fields and keeps populated ones"
- A bug reporter with no names reads `Anonymous / deleted` — `src/lib/admin/export.ts:124-129` · test: `export.test.ts` › "falls back when both names are null"

### Page and UI behaviour worth keeping
- `/report-bug`: area select with friendly labels, description textarea (maxlength 5000), hidden `from`, a Back link to the origin (fallback `/calendar`), inline error banner, and a submit button that reads "Submitting…" and is disabled while sending — `src/routes/report-bug/+page.svelte:13-24,88-89,107,119,134,144` · tests: `page.svelte.test.ts` › "offers a Back link to the originating page before submit", "disables the submit button while the report is sending"
- After a successful submit the form is replaced by "Thanks — report submitted" with a "Back to Calendar" link — `src/routes/report-bug/+page.svelte:65-75` · test: `page.svelte.test.ts` › "shows the success confirmation after the action returns ok (bug: no feedback shown)"
- `/admin/bugs`: open reports as cards with area chip, timestamp, description, "Reported by <name>" and page link, a Resolve form; empty state "No open bug reports. 🎉"; collapsible Resolved list — `src/routes/(admin)/admin/bugs/+page.svelte:22,49-76,94-98`
- `/admin/nlp`: phrases grouped by source into tables (Phrase, Matched, Count, First seen, Resolve); "Nothing unmatched. Parsers are holding up."; collapsible Resolved list — `src/routes/(admin)/admin/nlp/+page.svelte:21,43-105,111`
- Both admin registers expose "Export for agent": a readonly textarea plus Copy (toast "Export copied to clipboard — paste it into your agent.") and Download `.txt` named `<fileBase>-YYYY-MM-DD.txt`; blocked clipboard toasts "Couldn't copy — text is selected, press Ctrl/Cmd+C." — `src/lib/admin/AdminExport.svelte:13-61` · tests: `AdminExport.svelte.test.ts` › "toasts after copying to the clipboard", "tells the admin to copy manually when the clipboard is blocked"
- The export text is recomputed reactively after a Resolve, so resolved rows leave the export — `src/routes/(admin)/admin/bugs/+page.svelte:22`; `src/routes/(admin)/admin/nlp/+page.svelte:21` · test: `page.svelte.test.ts` › "bugs: drops resolved reports from the export"

### Probably accidental (candidates to drop, owner to confirm)
- `areaForPath` tests `/calendar` before `/tasks`, so `/calendar/tasks` is filed as calendar — `src/lib/server/services/autoBugReport.ts:35-38` — why: match order, not specificity, decides
- The `/abort/i` test drops any message that merely contains "abort", including real faults that mention it — `src/lib/server/services/autoBugReport.ts:24` — why: over-broad
- The auto-file throttle is a module-scope `Map` that is unbounded and resets on every deploy — `src/lib/server/services/autoBugReport.ts:10-11` — why: not a real ceiling (same class as #186)
- Area labels exist in three independent copies (export, bugs page, report-bug page) — `src/lib/admin/export.ts:14`; `src/routes/(admin)/admin/bugs/+page.svelte:13`; `src/routes/report-bug/+page.svelte:13` — why: guaranteed drift
- `resolveBugReport`/`resolveUnmatchedPhrase` wrap the id in a redundant `and(eq(...))` and report success for an already-resolved or missing row once one exists — `src/lib/server/db/actions/bugReports.ts:83`; `src/lib/server/db/actions/unmatchedPhrases.ts:97` — why: no-op updates look like success
- The success panel on `/report-bug` links "Back to Calendar" instead of the recorded origin, unlike the pre-submit Back link — `src/routes/report-bug/+page.svelte:67-73` — why: loses the issue-257 context after submit
- `report-phrase` rejects `phrase.length > 280` before normalization, so a long phrase of repeated whitespace is refused even though normalization would have fit it — `src/routes/api/report-phrase/+server.ts:48` vs `src/lib/server/db/actions/unmatchedPhrases.ts:34` — why: two different caps for one field
- `downloadAsTxt` revokes the object URL in the same tick as `click()` — `src/lib/admin/export.ts:195-204` — why: can cancel the download in some browsers
<!-- inventory:end -->

## Carry-over tickets

None.

## Plan

Every new file lives in `src/lib/domains/feedback/`. Roles follow [conventions.md](../../architecture/conventions.md#file-roles).

| file | role | what goes in it |
|---|---|---|
| `feedback.contract.ts` | contract | zod `BugReportBody` (area enum, description trimmed 1..5000, url optional/nullable), `UnmatchedPhraseBody` (phrase, source enum, `matched` JSON optional/nullable), `FeedbackKind = 'bug' \| 'phrase'`, `FeedbackResolveParams`; inferred types + response types, with the legacy error copy. |
| `feedback.rules.ts` | rules | `BUG_AREAS`, `isBugArea`, `isUnmatchedSource`, `normalizePhrase`, `BUG_AREA_LABEL`, `UNMATCHED_SOURCE_LABEL`, `areaForPath`, `buildAutoBugReport`, `safeReportedPath`, `reportBugHref`. "Now" and the origin are parameters (R5); no map, no `Date.now()` — the throttle is `ctx.limiter`. |
| `feedback.export.rules.ts` | rules | `matchedSummary`, `reporterName`, `formatBugReportsExport`, `formatUnmatchedPhrasesExport`; dates from `kernel/time` (K-06) instead of the private `isoDate`/`humanDate`. |
| `feedback.repo.server.ts` | repo | `insertBugReport`, `listBugReportsWithReporter(db, resolved)`, `resolveBugReportRow`, `countOpenBugReports`, `pruneClosedBugReports(cutoff)`, `upsertUnmatchedPhrase`, `listUnmatchedPhrases(db, resolved)`, `resolveUnmatchedPhraseRow`, `countOpenUnmatchedPhrases`, `pruneResolvedUnmatchedPhrases(cutoff)`. Tables from `$lib/kernel/db/tables.server`; the one join reads `users`. |
| `feedback.service.server.ts` | service | `fileBugReport`, `fileAutoBugReport`, `reportUnmatchedPhrase`, `listFeedback(kind)`, `resolveFeedback(kind, id)`, `countOpenFeedback`, `pruneResolvedFeedback(ctx, cutoff)`. Authorization, the 404 copy per kind and the never-throw rule live here; `AppError` for expected failures. |
| `feedback.http.server.ts` | http | `submitBugReportEndpoint`, `reportUnmatchedPhraseEndpoint`, `listBugReportsEndpoint`, `listUnmatchedPhrasesEndpoint`, `resolveBugReportEndpoint`, `resolveUnmatchedPhraseEndpoint` (auth `user` / `admin`, `rateLimit` 5/5 min and 20/5 min with the legacy messages), plus `reportBugPageLoad` / `submitBugReportAction` for the page. No SQL, no rules. |
| `feedback.api.ts` | api | Browser client on the K-07 api client: `reportUnmatchedPhrase` (the parser buttons), `listFeedback` / `resolveFeedback` (the admin register). |
| `feedback.register.state.svelte.ts` | state | The admin register: rows, `resolve(id)`, the export text, pending/error; takes the api client and toasts in its constructor. |
| `feedback.fixtures.server.ts` | fixtures | `bugReportRow`, `unmatchedPhraseRow`, reusing `uniqueSuffix`. |
| `feedback.rules.test.ts` | test | Tables for the areas, phrase normalization, `areaForPath`, `buildAutoBugReport`, `safeReportedPath` / `reportBugHref`. |
| `feedback.export.rules.test.ts` | test | `matchedSummary`, `reporterName`, both exporters (header, grouping, order, open-only, empty register). |
| `feedback.repo.db.test.ts` | test | A `rollbackTest` per query with a filter, ordering, join or upsert; the prune cutoffs. |
| `feedback.service.db.test.ts` | test | One test per IO invariant: filing, auto-file skip/throttle rules, phrase upsert, registers + admin gate, resolve + 404 copy, retention. |
| `feedback.http.db.test.ts` | test | Done in S2: golden `/api` contract of the six routes (must not change after S2). |
| `feedback.page.db.test.ts` | test | The `/report-bug` page handlers via `invokeLoad` / `invokeAction`: the 302 to `/login`, the `from` resolution (query → GET referer, hidden field → POST referer), and the five `fail(...)` copies. Not a golden: page data is internal and is redesigned with the UI. |
| `ui/ReportBugForm.svelte` | ui | The `/report-bug` form: areas, hidden `from`, Back link, error banner, "Submitting…", success panel. Props in, submit callback out. |
| `ui/FeedbackRegister.svelte` | ui | One register for either kind: open bug cards / phrase tables, collapsible Resolved list, resolve callback. |
| `ui/FeedbackExport.svelte` | ui | The `AdminExport` replacement: readonly textarea, Copy + toast, Download `.txt`; `downloadAsTxt` dies here (one caller). |
| `ui/*.svelte.test.ts` | test | Render with props and snippets; assert copy, disabled/pending states and the export/toast behaviour. |

### Where each legacy export goes

| legacy | new home |
|---|---|
| `BUG_AREAS`, `BugArea`, `NewBugReport` (`bugReports.ts`) | contract (`BugArea`) + rules (`BUG_AREAS`); `NewBugReport` becomes the contract input type. |
| `createBugReport` | `fileBugReport` (service) → `insertBugReport` (repo). |
| `getBugReportsWithReporter` / `getUnmatchedPhrases` | `listFeedback(ctx, actor, kind)` → repo `listBugReportsWithReporter` / `listUnmatchedPhrases`. |
| `resolveBugReport` / `resolveUnmatchedPhrase` | `resolveFeedback(ctx, actor, kind, id)` → repo `resolve*Row`. |
| `countOpenBugReports` + `countOpenUnmatchedPhrases` | one `countOpenFeedback(ctx)`. |
| `pruneResolvedBugReports` + `pruneResolvedUnmatchedPhrases` | one `pruneResolvedFeedback(ctx, cutoff)`; the cleanup cron in `app` calls it. |
| `normalizePhrase`, `buildUnmatchedReport` | `normalizePhrase` (rules) + the upsert shape folded into `upsertUnmatchedPhrase`. |
| `reportUnmatchedPhrase` (action) | `reportUnmatchedPhrase` (service) → `upsertUnmatchedPhrase` (repo). |
| `autoBugReport.buildAutoBugReport`, `areaForPath` | `feedback.rules.ts`. |
| `autoBugReport.shouldFileAutoReport`, `__resetAutoReportThrottle` | Die with the module-scope `Map`; the 10-minute window becomes `ctx.limiter.allow(key, 1, 10 * 60 * 1000)`. |
| `apiError` (5xx auto-file) | Dies: `endpoint()` files faults through `Ctx.faults`, wired to `fileAutoBugReport` in `app`. |
| `adminData.isAdminUser` / `requireAdminJson` | Dies: `endpoint({ auth: 'admin' })` (401 / 403 with the same bodies). |
| `adminData.loadAdminCounts` | `countOpenFeedback(ctx)`; the admin layout (the caller) owns the degrade-to-zero guard — a failing count renders 0, as legacy `guard('admin-counts', 0, …)` did (`src/lib/server/services/adminData.ts:36-37`). |
| `adminData.loadBugReports` / `loadUnmatchedPhrases` | `listFeedback(ctx, actor, kind)`. |
| `admin/export.matchedSummary`, `reporterName`, `format*Export` | `feedback.export.rules.ts`. |
| `admin/export.isoDate`, `humanDate`, `pad`, `groupBy` | `kernel/time` (K-06) / inlined into the exporters; no second date formatter. |
| `admin/export.downloadAsTxt` | `ui/FeedbackExport.svelte` (one caller). |
| `admin/AdminExport.svelte` | `ui/FeedbackExport.svelte`. |
| `utils/reportBug.ts` | `feedback.rules.ts`; only `reportBugHref` is re-exported from `index.ts` (`shell` keeps calling it), `safeReportedPath` stays module-internal. |
| `/report-bug` `load` + `submit` action | `reportBugPageLoad` / `submitBugReportAction` in `feedback.http.server.ts`. |
| `/report-bug` page | Route file wires `ui/ReportBugForm` (S7). |
| `/admin/bugs`, `/admin/nlp` pages + actions | Move to the `admin` screen; they compose `listFeedback` / `resolveFeedback` / `countOpenFeedback`, `FeedbackRegister` and `FeedbackExport`. |
| `/api/**` routes | Wiring only: `export const POST = submitBugReportEndpoint.handler;` and so on. |

## Notes

- **S1/S2 verification (2026-11-11).** Every draft inventory line used in the README was re-read against the cited code. Two corrections to the draft: the description is trimmed by the route *and* again (and capped) by `createBugReport`; and `resolveBugReport` is not a no-op on a second call — it always re-stamps `resolvedAt` (pinned, Q-007).
- **No golden for the bug-report 500.** `POST /api/bug-report` answers `500 {"error":"Could not save report. Please try again."}` only when `createBugReport` returns `null`, which happens for a blank description (already a 400) or a database error. Neither is reachable in the db lane without breaking the schema, so the copy stays in the contract and the S5 service test; the goldens pin the 200/400/401/429 paths.
- **Probably accidental — dropped as invariants (not visible on any `/api` handler in this module):**
  - `areaForPath` match order (`/calendar` before `/tasks`, so `/calendar/tasks` → calendar) — auto-filing runs from `hooks.handleError`/`Ctx.faults`, never inside an endpoint, and the goldens seed rows, so no `/api` test can observe the order. The documented mapping stays a rule; the quirk is not pinned.
  - The over-broad `/abort/i` test — internal to the fault filer; the new rule detects the abort error itself (`name === 'AbortError'`), which no wire can see.
  - The module-scope throttle `Map` (unbounded, resets on deploy, same class as #186) — internal; replaced by `ctx.limiter`, so the window is bounded and clock-driven.
  - Area labels in three copies — duplication, not behaviour. One home in `feedback.rules.ts`; the label *text* is wire-visible through `exportText` and pinned by the admin goldens; the third copy (the `/report-bug` page) dies in S7.
  - The redundant `and(eq(...))` in both resolve queries — internal; dies with the repo rewrite.
  - `downloadAsTxt` revoking the object URL in the same tick — browser-only; dies with the component into one helper (S7).
  - The success panel linking "Back to Calendar" instead of the recorded origin — UI only, no `/api`; the visual check keeps or fixes it in S7.
- **Probably accidental — kept and raised as a question (visible on the `/api` wire):**
  - `report-phrase` checks `phrase.length > 280` before normalizing, so a whitespace-heavy phrase that would normalize short gets a 400 — pinned, Q-006.
  - Resolving an already-resolved bug report moves `resolvedAt` forward — pinned, Q-007.
- **Golden mechanics.** `feedback.http.db.test.ts` runs committed (`beforeEach(truncateAll)`) because the legacy handlers use the `db` singleton. The rate limiter is module scope, so every test claims its own `x-real-ip`. Export timestamps are generated by the real clock, so the tests mask only `Generated: YYYY-MM-DD HH:MM` and the per-row date, and derive the phrase `first seen` date from the row the query returned (the DB session and Node may disagree on timezone).
- **Legacy tests kept as reference** until S8 deletes them; the pure ones (`export.test.ts`, `unmatchedPhrases.test.ts`, `autoBugReport.test.ts`, `reportBug.test.ts`) carry cases the S3 rule tables should reuse.


## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# feedback: 0% ported

legacy source files left (6/6, 611 LOC):
  - src/lib/admin/AdminExport.svelte (68 LOC, ui) importers: 2
  - src/lib/admin/export.ts (206 LOC, client) importers: 5
  - src/lib/server/db/actions/bugReports.ts (114 LOC, server) importers: 11
  - src/lib/server/db/actions/unmatchedPhrases.ts (125 LOC, server) importers: 6
  - src/lib/server/services/autoBugReport.ts (55 LOC, model) importers: 3
      NOTE: feedback S5/S8: becomes the feedback fault-filing rules + service; then point src/lib/app/appCtx.server.ts faults and the hooks handleError at the feedback service, and delete this file.
  - src/lib/utils/reportBug.ts (43 LOC, model) importers: 3

route files not yet wiring-only (12/12):
  - src/routes/(admin)/admin/bugs/+page.server.ts  /admin/bugs
  - src/routes/(admin)/admin/bugs/+page.svelte  /admin/bugs
  - src/routes/(admin)/admin/nlp/+page.server.ts  /admin/nlp
  - src/routes/(admin)/admin/nlp/+page.svelte  /admin/nlp
  - src/routes/api/admin/bugs/+server.ts  /api/admin/bugs
  - src/routes/api/admin/bugs/[id]/resolve/+server.ts  /api/admin/bugs/[id]/resolve
  - src/routes/api/admin/nlp/+server.ts  /api/admin/nlp
  - src/routes/api/admin/nlp/[id]/resolve/+server.ts  /api/admin/nlp/[id]/resolve
  - src/routes/api/bug-report/+server.ts  /api/bug-report
  - src/routes/api/report-phrase/+server.ts  /api/report-phrase
  - src/routes/report-bug/+page.server.ts  /report-bug
  - src/routes/report-bug/+page.svelte  /report-bug

legacy test files left (10/10) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/admin/AdminExport.svelte.test.ts [component, 4 tests]
  - src/lib/admin/export.test.ts [pure, 13 tests]
  - src/lib/server/db/actions/bugReports.prune.test.ts [stub-db, 3 tests]
  - src/lib/server/db/actions/unmatchedPhrases.prune.test.ts [stub-db, 3 tests]
  - src/lib/server/db/actions/unmatchedPhrases.test.ts [pure, 5 tests]
  - src/lib/server/services/autoBugReport.test.ts [pure, 7 tests]
  - src/lib/utils/reportBug.test.ts [pure, 3 tests]
  - src/routes/(admin)/admin/bugs/page.svelte.test.ts [component, 2 tests]
  - src/routes/report-bug/page.server.test.ts [route, 4 tests]
  - src/routes/report-bug/page.svelte.test.ts [component, 7 tests]
```
<!-- census:end -->
