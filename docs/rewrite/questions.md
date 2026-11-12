# Questions for the owner

The executing agent appends a question here when it is blocked ([when-stuck.md](playbooks/when-stuck.md)). The owner answers inline under **Answer:**. Each answered question stays here as the record.

Template:

```markdown
## Q-NNN <title> (<task id>, <date>)
Context: …
Options:
A. … cost: …
B. … cost: …
Recommendation: …
Answer:
```

## Q-001 Changes on `test` while the rewrite runs (plan, 2026-11-11)

Context: `test` keeps receiving fixes and Android work while `rewrite/v2` ports modules. Every change to an already-ported module has to be re-applied, test-first, to the v2 module.

Options:
A. Keep `test` live; the rewrite merges it before each module ([sync-with-test.md](playbooks/sync-with-test.md)). Cost: re-applying ported-module changes.
B. Freeze web/server changes on `test` except urgent fixes. Cost: no web features until cutover.

Default applied before the answer: **A**.

Answer (owner, 2026-11-11): **B.** Website and server code on `test` is frozen until cutover, except urgent fixes. Android work continues on `test`. The rewrite still merges `origin/test` before each module, which now brings in mostly Android changes and the odd urgent fix.

## Q-002 Parked modules: port or delete (plan, 2026-11-11)

Context: `meals` (owner-parked) and `bills` (archived to `_attic/money`) still have code, tables and one endpoint (`/api/meals`). `MealsCard` is mounted nowhere (only its own test imports it), Android never calls `/api/meals`, and `parseBillQuickAdd` has no caller outside its tests.

Options asked:
A. Delete the unused code: the meals endpoint, card and queries, plus the bill parser and category list. Keep both tables (no database changes), and keep `meals` in the Dashboard Module list so the API the phone sees is unchanged.
B. Port everything as it is.
C. Delete the bill code; port meals as it is.

Default applied before the answer: port as-is (option B above).

Answer (owner, 2026-11-11): **A.** M-bills and M-meals become delete-only tasks. Removing `/api/meals` (GET/POST/DELETE) is an owner-approved wire change; no client calls it.

## Q-003 Blob store (#180) before the `sponsored` port (plan, 2026-11-11)

Context: `blobService` uploads to a public, unmetered Vercel Blob prefix (`family-master/ads`). The security audit asked for "harden or delete" before anything wires it further. Nothing calls it: the upload, list and delete helpers in `adService.ts` have no callers, so sponsored events serve without blob assets today.

Options asked:
A. Delete it: `blobService.ts`, the unwired helpers in `adService.ts`, and the `@vercel/blob` dependency. Users see no change; it can be restored from git.
B. Keep it behind a `blob` port in the rebuilt sponsored module: private, size- and type-capped, admin-only upload.

Answer (owner, 2026-11-11): **A.** M-sponsored deletes the blob code and the dependency in its S8; it is no longer blocked.

## Q-004 Vercel previews fail for every branch except `test` and `main` (plan, 2026-11-11)

Context: the `rewrite/v2` preview (`dpl_FPqyYz6vEc8XT1UA8c4rDiSXYjBb`) failed with `BUILD_FAILED: Resource provisioning failed` before any build step ran. Yesterday's `prototype/desktop-theme` preview failed the same way. The Vercel storage `familyplanz` (Neon, Vercel-managed) is linked to `family-calendar` with a deployment action on `preview` and `production` and `required: true`, so every preview must first provision a Neon branch. `test` and `main` deploy normally. The likeliest cause is the Neon side refusing a new branch, for example the plan's branch limit [INFERENCE: the Vercel-managed Neon org is not visible through our Neon API key]. Local proof meanwhile: `npm run build:safe` passes.

Options:
A. In Vercel → Storage → `familyplanz` → Projects → `family-calendar`, make the preview deployment action not required, or turn off preview branching. Cost: previews share the preview database env instead of getting their own branch.
B. Delete stale Neon preview branches in the Neon console, if the limit is the cause. Cost: the problem returns when the limit refills.
C. Leave it; the rewrite relies on `build:safe` and local runs. Cost: no deployed preview of `rewrite/v2` until cutover.

Default applied: **C**. K-05's preview check waits for this answer.

Answer:

## Q-005 Private Tasks reach the whole family (plan, 2026-11-11)

Context (verified in code, live on `test` and `main`):

- The phone leaves `familyId` out for personal Tasks: `ApiFactory.json` has `explicitNulls = false` and `encodeDefaults = false`, and `CreateTaskRequest.familyId` defaults to null (`apps/android/app/src/main/kotlin/com/familyplanz/app/data/TaskApi.kt:79-93`).
- `POST /api/tasks` reads an absent `familyId` as the caller's family (`src/routes/api/tasks/+server.ts:142-150`). So every Task a family member creates on the phone is a Family Task, `#private` ones included.
- The web sends `familyId: null` on purpose (`src/lib/client/taskSubmit.ts:57-59`). The event checklist and the event form send only `{title, eventId}` (`ChecklistSection.svelte:76-79`, `EventFormModal.svelte:455-458`), so those Tasks are Family Tasks too.
- Neither reader of family rows checks visibility: the phone list `GET /api/tasks` (`src/lib/server/db/actions/tasks/queries.ts:27-30,66`) and the web Family Task Board (`getTasksForFamily`, `queries.ts:118`). Only the `?eventId=` branch drops other people's private rows (`+server.ts:72`).

### Q-005a Stop the leak: how and when

Options asked:
A. Now on `test`: both readers hide other members' private Tasks.
B. Now on `test`: the full CONTEXT list rules.
C. In the rewrite's tasks module.

Answer (owner, 2026-11-11): **C.** M-tasks fixes it with the read-side rule only (option A's content, not B's). Both readers hide a private Task from everyone except its owner and, while it is assigned, its assignee (CONTEXT "Private Task"). The S2 goldens pin today's wire first. The fix lands after S6 as an owner-approved wire change ([port-a-module.md › S6](playbooks/port-a-module.md#s6-http-and-route-wiring)). The leak stays open on `test` and `main` until cutover.

### Q-005b Which side fixes the filing (outside the rewrite)

Answer (owner, 2026-11-11): **both.** The phone sends `familyId: null` for personal Tasks, and the server reads a missing `familyId` as personal.

- Both are ordinary fixes outside the rewrite, scheduled by the owner. The Android part can land on `test` at any time. Under the Q-001 freeze, the server part lands on `test` only if the owner treats it as an urgent fix.
- The rewrite does not make the server change on its own. If the change reaches `test` before M-tasks S2, the goldens pin it like any other wire.
- `docs/guides/task-api-spec.md` wrongly said `null` also means "your family". It was corrected on this branch on 2026-11-11.

### Q-005c Repair rows already filed wrongly (outside the rewrite)

Parked with Q-005b. It is an owner decision about production data, not rewrite work.
## Q-006 `POST /api/report-phrase` caps the raw phrase before normalizing it (M-feedback S2, 2026-11-11)

Context: the route trims the phrase and refuses `phrase.length > 280` (`src/routes/api/report-phrase/+server.ts:42,48`); the action then normalizes it — lowercase, collapse whitespace runs, trim, cap at 280 (`src/lib/server/db/actions/unmatchedPhrases.ts:33-39`). A phrase that normalizes down to a few characters (for example `a` + 280 spaces + `b`) is refused with `400 {"error":"phrase (string) and source (event_parse | bulk_edit) are required"}`, even though the value that would be stored is `a b`. One field, two different caps.

Options:
A. Keep today's wire: the 400 stays. Cost: an occasional lost parser signal, and the two caps stay in two files.
B. Move the cap after normalization (accept the report, store `a b`). Cost: an owner-approved wire change after S6 (`fix(feedback): Q-006 …`), and the golden changes with it.

Recommendation: B — normalization, not the raw text, is the field's contract. Applied default until answered: A, pinned by `feedback.http.db.test.ts › refuses a whitespace-heavy phrase over 280 chars before normalizing it (Q-006)`.

Answer:

## Q-007 A second resolve moves the closed-at stamp — for bug reports and for phrases (M-feedback S2, 2026-11-11)

Context (verified in code, 2026-11-11): a second `POST …/resolve` answers `200` for both registers, and each kind re-stamps a field.

- Bug reports: `resolveBugReport` always writes `{ status: 'resolved', resolvedAt: new Date() }` (`src/lib/server/db/actions/bugReports.ts:79-86`), so a second `POST /api/admin/bugs/{id}/resolve` replaces `resolvedAt` — the register then claims the report was closed later than it was, and the retention anchor moves: `pruneResolvedBugReports` deletes closed rows whose `coalesce(resolvedAt, createdAt)` is before the cutoff (`bugReports.ts:102-112`). Pinned by `feedback.http.db.test.ts › answers 200 for an already-resolved report and re-stamps resolvedAt (Q-007)`.
- Unmatched phrases: `resolveUnmatchedPhrase` only sets `{ resolved: true }` (`src/lib/server/db/actions/unmatchedPhrases.ts:93-100`), which reads like a no-op — it is not. `unmatchedPhrases.updatedAt` carries `.$onUpdate(() => new Date())` (`src/lib/server/db/schema.ts:1033-1036`), and Drizzle puts every `$onUpdate` column in the `UPDATE` set even when it is absent from `.set(…)`, so the same second resolve re-stamps `updatedAt`: the `200` body's `phrase.updatedAt` moves, and so does the retention anchor, because `pruneResolvedUnmatchedPhrases` keeps resolved rows by `lt(updatedAt, cutoff)` (`unmatchedPhrases.ts:116-124`). Pinned by `feedback.http.db.test.ts › re-stamps updatedAt when an already-resolved phrase is resolved again (Q-007)`.
- Both tables carry `.$onUpdate` on `updatedAt` (`schema.ts:1063-1066` for `bugReports`), so no resolve of either kind leaves the row untouched. The stamp the register and the retention read is `resolvedAt` for a bug report and `updatedAt` for a phrase.

Options:
A. Keep both as they are (the goldens pin them). Cost: neither stamp means "when this was closed": each reports the last click, and a repeat resolve restarts the 180-day retention window for both kinds.
B. One rule, both kinds: keep the first closed-at stamp. When the row is already resolved, write nothing and answer `200` with the unchanged row — a skipped write also stops the `$onUpdate` on `updatedAt`. Cost: one owner-approved wire change after S6 (`fix(feedback): Q-007 …`), and both goldens named above change with it.
C. Fix one kind only (say phrases, whose `updatedAt` also tracks later sample refreshes). Cost: one gesture, two rules; an admin has to remember which register keeps its stamp, and the retention anchor stays wrong for the other kind.

Recommendation: B, as one rule. "Resolve" means the first close: a repeat click answers `200` and changes nothing, which is what the registers, the export and the 180-day retention all assume. "A second resolve answers 200" stays under every option. Applied default until answered: A, pinned by the two goldens named above.

Answer:

## Q-008 Singular weekday abbreviations read as plurals (M-parsing S2, 2026-11-12)

Context: the weekly scan treats any raw weekday token ending in "s" as plural (`src/lib/server/services/naturalLanguageService.ts:1120,1126`), so "lunch tues" comes back as `recurring:"weekly"` + `recurringByDay:["TU"]` with the date anchored on the next Tuesday, while "mon"/"wed" stay one-off. Wire-visible: the phone reads `recurring`/`recurringByDay` (`QuickParseDto.kt`). Pinned by `parsing.http.db.test.ts › "reads the singular abbreviation \"tues\" as a plural weekday…"`.

Options:
A. Keep: a stated abbreviation means a series. Cost: a one-off "lunch tues" silently becomes a weekly prefill on both clients.
B. Treat only full names and the canonical plurals ("tuesdays", "thursdays", …) as plural; "tues"/"thurs" stay singular. Cost: an owner-approved wire change after S6 (`fix(parsing): Q-008 …`), the golden changes with it, and the Android parse vectors must land in the same commit.

Recommendation: B — the "s" suffix is a poor plural signal for these abbreviations. Applied default until answered: A, pinned by the golden named above.

Answer:

## Q-009 `MM/DD` with an impossible month writes `"Invalid DateTime"` into `date` (M-parsing S2, 2026-11-12)

Context: the primary `MM/DD` rule does not check validity (`src/lib/server/services/naturalLanguageService.ts:765-771`): `withRolloverYear` returns `DateTime.invalid` and `.toFormat` stringifies it, so "party 31/12" answers `date:"Invalid DateTime"`. Every other impossible date is skipped because the explicit sweep guards `isValid`. Pinned by `parsing.http.db.test.ts › "writes the literal \"Invalid DateTime\"…"`.

Options:
A. Keep (Android may already ship the string). Cost: a calendar client gets a date it cannot parse.
B. Treat it as unmatched, so the date falls back to today (the sweep's behaviour). Cost: an owner-approved wire change after S6, approved with Android; not folded into the port.

Recommendation: B, as its own wire-change ticket. Applied default until answered: A, pinned by the golden named above.

Answer:

## Q-010 Time rules scan the raw input, URLs included (M-parsing S2, 2026-11-12)

Context: URLs are captured whole and removed from the title and date scans (`src/lib/server/services/naturalLanguageService.ts:483-487`), but the time rules read the raw `input` (`:948-1608`), so a clock-like substring inside a link can set `startTime` (for example `https://meet.example.com/standup-5:30pm` yields `17:30`). Pinned by `parsing.http.db.test.ts › "reads a clock-like time inside a URL…"`.

Options:
A. Keep: a pasted meeting link sometimes carries the real time. Cost: a link can invent a start time the phrase never stated.
B. Run the time rules on `nonUrlText`, like the date rules. Cost: fix-in-port after S6 (golden first) and an Android parser change.

Recommendation: B, after S6, golden first. Applied default until answered: A, pinned by the golden named above.

Answer:

## Q-011 A throw after a successful parse answers 200 `regex-fallback` (M-parsing S2, 2026-11-12)

Context: the catch-all (`src/routes/api/parse-event/+server.ts:135-137`) answers `200 {…, method:"regex-fallback"}` only when the throw happens AFTER the parse succeeded — a `canUseAiFeature` throw (before the vendor call) or a `recordAiUsage` throw (after it: the vendor call was billed, the usage record is lost) — and the cloud result, if any, is discarded. A thrown parse is different: the catch re-runs `parseEventInput`, which throws again, so the request fails (500) and the client gets no prefill. The 200 case is pinned in S5 (`parsing.service.db.test.ts`).

Options:
A. Keep the 200 wire (the client always gets a prefill when the parse itself succeeded) and report the failure through `ctx.faults` so it is visible in logs. Cost: the usage record can still be lost after a billed vendor call.
B. Answer 500 with the standard error shape for every throw. Cost: a parse bug becomes a hard failure with no prefill; an owner-approved wire change after S6.

Recommendation: A — keep the wire, make the failure visible through `ctx.faults`. Applied default until answered: A, pinned in S5.

Answer:

## Q-012 Malformed JSON and a JSON `null` body escape the error boundary (M-parsing S2, 2026-11-12)

Context: `await request.json()` and the destructure sit before the `try` (`src/routes/api/parse-event/+server.ts:66-67`), so malformed JSON and a JSON `null` body reject the request instead of answering `400 {"error":"Input required"}`. The `getUserZone`/`getUserSubscription` reads are outside the `try` too, so a settings or billing failure also escapes as a 500. Pinned by `parsing.http.db.test.ts › "lets malformed JSON escape…"` and `"lets a JSON null body throw…"`.

Options:
A. Keep. Cost: a client sending a bad body gets an opaque 500 instead of the documented 400 shape.
B. Move body parsing and the zone/subscription reads inside the boundary so bad bodies answer the 400 shape and infrastructure failures the standard error JSON. Cost: an owner-approved wire change after S6; Android sign-off because a 500 becomes a 400.

Recommendation: B, fix-in-port. Applied default until answered: A, pinned by the goldens named above.

Answer:

## Q-013 Multi-event phrases bypass the cloud path for signed-in callers (M-parsing S2, 2026-11-12)

Context: the local multi-event shortcut runs before the cloud branch (`src/routes/api/parse-event/+server.ts:99-104`), so a signed-in caller's "dinner Friday and movie Saturday" never reaches the model — segmenting locally is instant and free. The golden pins the list answer (`parsing.http.db.test.ts › "answers the list for a signed-in caller"`); the ordering itself is pinned in S5, because `llmConfigured()` is false in the db project.

Options:
A. Keep the shortcut first. Cost: a signed-in caller's multi-event phrase never gets the model's parse.
B. Cloud-first when the caller is allowed. Cost: every multi-event phrase spends a vendor call, and the free tier's 20/5 min budget starts applying.

Recommendation: A, and keep the golden. Applied default until answered: A, pinned by the golden named above.

Answer:
