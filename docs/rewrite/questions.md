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

Answer (owner, 2026-11-12): **B.** Cap after normalizing; the whitespace-heavy phrase is accepted and stored normalized. Lands after M-feedback S6 as `fix(feedback): Q-006 …`, golden first.

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

Answer (owner, 2026-11-12): **A.** Keep both: a repeat resolve keeps re-stamping, as the two goldens pin.

## Q-008 Singular weekday abbreviations read as plurals (M-parsing S2, 2026-11-12)

Context: the weekly scan treats any raw weekday token ending in "s" as plural (`src/lib/server/services/naturalLanguageService.ts:1120,1126`), so "lunch tues" comes back as `recurring:"weekly"` + `recurringByDay:["TU"]` with the date anchored on the next Tuesday, while "mon"/"wed" stay one-off. Wire-visible: the phone reads `recurring`/`recurringByDay` (`QuickParseDto.kt`). Pinned by `parsing.http.db.test.ts › "reads the singular abbreviation \"tues\" as a plural weekday…"`.

Options:
A. Keep: a stated abbreviation means a series. Cost: a one-off "lunch tues" silently becomes a weekly prefill on both clients.
B. Treat only full names and the canonical plurals ("tuesdays", "thursdays", …) as plural; "tues"/"thurs" stay singular. Cost: an owner-approved wire change after S6 (`fix(parsing): Q-008 …`), the golden changes with it, and the Android parse vectors must land in the same commit.

Recommendation: B — the "s" suffix is a poor plural signal for these abbreviations. Applied default until answered: A, pinned by the golden named above.

Answer (owner, 2026-11-12): **B.** Only full weekday names and the canonical plurals are plural; the parse vectors change in the same commit (Android lockstep).

## Q-009 `MM/DD` with an impossible month writes `"Invalid DateTime"` into `date` (M-parsing S2, 2026-11-12)

Context: the primary `MM/DD` rule does not check validity (`src/lib/server/services/naturalLanguageService.ts:765-771`): `withRolloverYear` returns `DateTime.invalid` and `.toFormat` stringifies it, so "party 31/12" answers `date:"Invalid DateTime"`. Every other impossible date is skipped because the explicit sweep guards `isValid`. Pinned by `parsing.http.db.test.ts › "writes the literal \"Invalid DateTime\"…"`.

Options:
A. Keep (Android may already ship the string). Cost: a calendar client gets a date it cannot parse.
B. Treat it as unmatched, so the date falls back to today (the sweep's behaviour). Cost: an owner-approved wire change after S6, approved with Android; not folded into the port.

Recommendation: B, as its own wire-change ticket. Applied default until answered: A, pinned by the golden named above.

Answer (owner, 2026-11-12): **B.** An impossible `MM/DD` is unmatched and the date falls back to today; its own wire-change commit, approved with Android.

## Q-010 Time rules scan the raw input, URLs included (M-parsing S2, 2026-11-12)

Context: URLs are captured whole and removed from the title and date scans (`src/lib/server/services/naturalLanguageService.ts:483-487`), but the time rules read the raw `input` (`:948-1608`), so a clock-like substring inside a link can set `startTime` (for example `https://meet.example.com/standup-5:30pm` yields `17:30`). Pinned by `parsing.http.db.test.ts › "reads a clock-like time inside a URL…"`.

Options:
A. Keep: a pasted meeting link sometimes carries the real time. Cost: a link can invent a start time the phrase never stated.
B. Run the time rules on `nonUrlText`, like the date rules. Cost: fix-in-port after S6 (golden first) and an Android parser change.

Recommendation: B, after S6, golden first. Applied default until answered: A, pinned by the golden named above.

Answer (owner, 2026-11-12): **B.** Time rules skip URLs; after S6, golden first.

## Q-011 A throw after a successful parse answers 200 `regex-fallback` (M-parsing S2, 2026-11-12)

Context: the catch-all (`src/routes/api/parse-event/+server.ts:135-137`) answers `200 {…, method:"regex-fallback"}` only when the throw happens AFTER the parse succeeded — a `canUseAiFeature` throw (before the vendor call) or a `recordAiUsage` throw (after it: the vendor call was billed, the usage record is lost) — and the cloud result, if any, is discarded. A thrown parse is different: the catch re-runs `parseEventInput`, which throws again, so the request fails (500) and the client gets no prefill. The 200 case is pinned in S5 (`parsing.service.db.test.ts`).

Options:
A. Keep the 200 wire (the client always gets a prefill when the parse itself succeeded) and report the failure through `ctx.faults` so it is visible in logs. Cost: the usage record can still be lost after a billed vendor call.
B. Answer 500 with the standard error shape for every throw. Cost: a parse bug becomes a hard failure with no prefill; an owner-approved wire change after S6.

Recommendation: A — keep the wire, make the failure visible through `ctx.faults`. Applied default until answered: A, pinned in S5.

Answer (owner, 2026-11-12): **A** (recorded default). Keep the 200 wire and report the failure through `ctx.faults`.

## Q-012 Malformed JSON and a JSON `null` body escape the error boundary (M-parsing S2, 2026-11-12)

Context: `await request.json()` and the destructure sit before the `try` (`src/routes/api/parse-event/+server.ts:66-67`), so malformed JSON and a JSON `null` body reject the request instead of answering `400 {"error":"Input required"}`. The `getUserZone`/`getUserSubscription` reads are outside the `try` too, so a settings or billing failure also escapes as a 500. Pinned by `parsing.http.db.test.ts › "lets malformed JSON escape…"` and `"lets a JSON null body throw…"`.

Options:
A. Keep. Cost: a client sending a bad body gets an opaque 500 instead of the documented 400 shape.
B. Move body parsing and the zone/subscription reads inside the boundary so bad bodies answer the 400 shape and infrastructure failures the standard error JSON. Cost: an owner-approved wire change after S6; Android sign-off because a 500 becomes a 400.

Recommendation: B, fix-in-port. Applied default until answered: A, pinned by the goldens named above.

Answer (owner, 2026-11-12): **B.** Bad bodies answer the 400 shape and infrastructure failures the standard error JSON; Android sign-off with the commit.

## Q-013 Multi-event phrases bypass the cloud path for signed-in callers (M-parsing S2, 2026-11-12)

Context: the local multi-event shortcut runs before the cloud branch (`src/routes/api/parse-event/+server.ts:99-104`), so a signed-in caller's "dinner Friday and movie Saturday" never reaches the model — segmenting locally is instant and free. The golden pins the list answer (`parsing.http.db.test.ts › "answers the list for a signed-in caller"`); the ordering itself is pinned in S5, because `llmConfigured()` is false in the db project.

Options:
A. Keep the shortcut first. Cost: a signed-in caller's multi-event phrase never gets the model's parse.
B. Cloud-first when the caller is allowed. Cost: every multi-event phrase spends a vendor call, and the free tier's 20/5 min budget starts applying.

Recommendation: A, and keep the golden. Applied default until answered: A, pinned by the golden named above.

Answer (owner, 2026-11-12): **A** (recorded default). The local multi-event shortcut stays first.

## Q-015 Delete `/calendar/setUserDefaultTimeZone` (M-identity S1+S2, 2026-11-12)

Context: the POST handler reads `timeZone` straight off `await event.request.json()` with no shape or IANA check, stores it through `updateUserSettings` and answers a bare `200` (`src/routes/(calendar)/calendar/setUserDefaultTimeZone/+server.ts:5-18`); malformed JSON throws out of the handler as a 500. It is not on the `/api` contract, and `PATCH /api/me/settings` already writes the same column with validation. One web caller exists (`src/routes/(calendar)/calendar/+layout.svelte:36`); Android never calls it (the sheet's S1 read of the app).

Options:
A. Keep it as a permanent shim. Cost: two write paths for one column, one of them unvalidated and 500-prone.
B. Delete it at S7/S8 and move the layout's fetch to `PATCH /api/me/settings` with `{timeZone}`. Cost: no golden changes (a page route, outside the `/api` golden set); the only risk is a stale cached bundle still posting to the old path.

Recommendation: B (the sheet's) — its own comment says the PATCH replaces it, and the caller lives in the same port. Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** The route goes at S7/S8 and the web caller moves to `PATCH /api/me/settings`.

## Q-017 Which count drives the 40% family-size discount (M-billing S1+S2, 2026-11-12)

Context: `calculateFamilyMemberDiscount` counts the caller's `familyMembers` rows and grants 40% at `memberCount >= 4` (`src/lib/server/services/discountService.ts:19-34`), so four memberships in four different families qualify, while the checkout line it feeds is described as "Family member discount (5+ members)" (`src/lib/server/services/checkoutService.ts:159`). Wire-visible through `/api/me/subscription`'s discount breakdown; checkout itself is a stub, so no money moves today.

Options:
A. Keep the row count and the `>= 4` threshold. Cost: the benefit rewards belonging to many families, and the description keeps disagreeing with the rule.
B. Count the members of one family, threshold 5. Cost: a `/api/me/subscription` value change for a user in several small families; the priced copy and the rule finally agree.
C. Count distinct families, threshold 4. Cost: wording has to change again ("4+ families"), and a four-person family gets nothing.

Recommendation: B (the sheet's) — the discount is described and priced as a family-size benefit, and checkout is a stub so nothing can be mis-charged. Applied default until answered: A, pinned by `billing.http.db.test.ts › reports the active tier, its overrides and the AI cap from that tier`.

Answer (owner, 2026-11-12): **B.** The discount counts members of one family, threshold 5.

## Q-018 Pricing copy says 5 family members, the free tier allows 6 (M-billing S1+S2, 2026-11-12)

Context: the free card's feature list says "Up to 5 family members" (`src/routes/(marketing)/pricing/+page.svelte:12`) while the seeded free plan carries `memberLimit: 6` (`src/lib/server/seed.ts:19`), and six is the number the live plan gate enforces. It is user-visible copy over a live rule.

Options:
A. Lower the free `memberLimit` to 5 so the copy is true. Cost: a plan-policy change that takes a member away from every family already at six.
B. Raise the copy to "Up to 6 family members". Cost: one string, plus whatever screenshot or e2e asserts the old copy.

Recommendation: B (the sheet's) — the limit is a live rule existing families already have; the copy is the stale side. Applied default until answered: A, not pinned by a golden yet (the pricing page has no golden; the plan `memberLimit` is pinned by billing's free-defaults goldens).

Answer (owner, 2026-11-12): **B.** The pricing copy says up to 6 family members.

## Q-020 `/api/push/public-key` publishes a key the server cannot use (M-alerts S1+S2, 2026-11-12)

Context: `getVapidPublicKey` returns `VAPID_PUBLIC_KEY ?? null` on its own (`src/lib/server/services/pushService.ts:29-31`) and `GET /api/push/public-key` answers it (`src/routes/api/push/public-key/+server.ts:6`), while every send is gated on both halves (`isVapidConfigured`, `:38-40`, and the web leg's early return, `:99`). A deployment with only the public half lets a client subscribe, show "Push notifications enabled.", and then never receive a push. Wire-visible.

Options:
A. Keep publishing the public half alone. Cost: a client can be told push works when the server will silently skip every send.
B. Answer `{publicKey:null}` unless both halves are configured, so the toggle hides itself. Cost: an owner-approved wire change with its own golden flip; a deployment missing the private key loses the subscription UI (which could never have sent anything).

Recommendation: B (the sheet's), as a separate owner-approved wire ticket. Applied default until answered: A, pinned by `alerts.http.db.test.ts › answers the configured key`.

Answer (owner, 2026-11-12): **B.** The route answers `null` unless both VAPID halves are configured.

## Q-021 Every Alert push deep-links to `/calendar/tasks` (M-alerts S1+S2, 2026-11-12; screens: S-shell)

Context: `createNotification` stores `link ?? null` on the row but hands the push payload `data.link ?? '/calendar/tasks'` (`src/lib/server/db/actions/notifications.ts:21-25`), so a phone notification for any of the five types — `added_to_family` included — opens the tasks page. The row's own `link` column and the bell's per-row navigation are unaffected. Wire-visible (the push payload).

Options:
A. Keep one default. Cost: `added_to_family` and `task_completed` open a page that does not answer the notification.
B. Per-type links (`/calendar/family` or the family page for `added_to_family`, `/calendar/tasks` for the rest). Cost: a push-contract change needing the Android side and a spec entry; no golden covers push payloads today.

Recommendation: B (the sheet's), later, as its own push-contract ticket. Applied default until answered: A, not pinned by a golden yet (the payload leaves through `sendPushToUser`, which the goldens stub at the notifications boundary).

Answer (owner, 2026-11-12): **B.** Per-type deep links land with the push contract.

## Q-023 Family-card avatar ids are matched by first name (M-family S1+S2, 2026-11-12; screens: S-familyHub)

Context: `loadFamiliesOverview` rebuilds each card's `members[]` from the first names it already has and recovers the id by `roster.find(r => r.familyId === … && r.firstName === firstName)`, falling back to `roster-${i}` when two people share a name (`src/lib/server/services/familyData.ts:125-131`). The payload promises a user id that the card uses to pick each avatar's colour, so two "Sam"s in one family can show the wrong person's colour — and a fallback renders a synthetic id. Wire-visible on `GET /api/families`.

Options:
A. Keep (values unchanged, wrong colour possible). Cost: a wrong-colour avatar in exactly the families large enough to care.
B. Aggregate `userId` alongside `firstName` in the memberships read and return real ids. Cost: same shape and length, values become correct; the Android side only reads it for colour (the card is the only consumer today) — sign-off needed because the value changes.

Recommendation: B (the sheet's) — two people sharing a first name is ordinary. Applied default until answered: A, pinned by `family.http.db.test.ts › orders families oldest first and builds each card from one read`.

Answer (owner, 2026-11-12): **B.** Family-card avatar ids become the real user ids.

## Q-024 Which family `GET /api/family/roster` defaults to (M-family S1+S2, 2026-11-12)

Context: without `?familyId=` the route calls `getUserFamilyId`, which returns whichever `familyMembers` row Postgres hands back first (`src/lib/server/db/actions/families.ts:250-257`; the route's branch is `src/routes/api/family/roster/+server.ts:26-28`). Every multi-family read elsewhere deliberately picks the oldest family (#098), so the default can differ between calls and between surfaces for the same person. Wire-visible.

Options:
A. Keep the unordered row. Cost: not reproducible; a calendar filter or mention list can silently start showing a different family.
B. Pick the oldest of the caller's own families (`families.createdAt`), like #098. Cost: the chosen family changes for a multi-family caller; the single-family answer is untouched.

Recommendation: B (the sheet's) — deterministic and consistent with the rest of the app. Applied default until answered: A, pinned by `family.http.db.test.ts › defaults to your family`.

Answer (owner, 2026-11-12): **B.** `GET /api/family/roster` without `?familyId=` defaults to the oldest of the caller's own families, and only ever considers the caller's memberships.

## Q-028 The invite-flow name search finds no full name (M-family S1+S2, 2026-11-12)

Context: `searchUsers` builds one exact ILIKE from the whole trimmed query (`src/lib/server/db/actions/families.ts:335`) and ANDs it across both name columns (`:344-363`), so "Ann Lee" matches nobody — only an exact email, or a person whose first name *and* last name both equal the query, is found. The add-member copy asks for "a name or an email". Wire-visible; pinned.

Options:
A. Keep (pin today; email-only lookup in practice). Cost: the documented intent of the name box is broken, and a family member cannot be found by name at all.
B. Split the query into two tokens and match `firstName`+`lastName` exactly. Cost: a wire change (a full name that returned `[]` now returns a row); exact match is kept, so no enumeration oracle is opened.

Recommendation: B (the sheet's) — the flow's own copy promises a name search. Applied default until answered: A, pinned by `family.http.db.test.ts › does not find a full name: both name columns are compared to the whole query`.

Answer (owner, 2026-11-12): **B.** The name search splits first/last and matches each exactly.

## Q-031 The bundled verse text is KJV wording labelled `esv` (M-verse S1+S2, 2026-11-12)

Context: the one translation entry is `{id:'esv', label:'ESV', attribution:'Public domain.', bundled:true}` (`src/lib/server/services/verseService.ts:23-31`), and the curated text under it is King James wording ("For God so loved the world, that he gave his only begotten Son…", `:34-42`). ESV is copyrighted, so the label and the attribution cannot both stand. Wire-visible: `/api/me/settings` answers `verseTranslations` and every saved row carries `verseTranslation: 'esv'`; Android reads `label` only.

Options:
A. Keep today's label. Cost: the app publishes a copyrighted translation name over public-domain text.
B. Relabel the entry `KJV` with the attribution "Public domain (King James Version)." Cost: a `/api/me/settings` wire change; the stored `'esv'` id needs a read-side alias, and Android's picker shows the new label.
C. Fetch real ESV text. Cost: a Crossway licence and a network dependency the module deliberately does not have.

Recommendation: B (the sheet's), as its own owner-approved change after the port. Applied default until answered: A, pinned by `verse.http.db.test.ts › answers today's verse when ?date is absent` (`verseTranslation: 'esv'`) and `› ignores the viewer's verseTranslation setting (bundled ESV text on every response)`.

Answer (owner, 2026-11-12): **REMOVE.** The verse feature is deleted everywhere: `/api/daily-verse` goes (404), `dailyVerse` leaves `/api/dashboard`, `verseTranslation`/`verseTranslations` leave `/api/me/settings`, and the card, picker and bundled text go with them. M-verse becomes delete-only; the `user_settings.verse_translation` column stays (no DDL) and the `verse` Dashboard Module id is decided like `meals` (kept — see [plan.md](plan.md)).

## Q-032 An absent `?date=` uses the server's day, not the viewer's (M-verse S1+S2, 2026-11-12)

Context: `getTodayVerse` formats `DateTime.now()` and hands that date to the bundle (`src/lib/server/services/verseService.ts:213-215`), so a viewer in another zone can be shown the previous or next day's verse until their local midnight passes. Wire-visible only when `date` is omitted.

Options:
A. Keep the server day. Cost: the verse a viewer sees depends on where the server runs, around midnight.
B. Use the viewer's stored `timeZone` for an absent `date`. Cost: changes the absent-`date` contract and can disagree with the client's own clock at the boundary.

Recommendation: B (the sheet's), as a follow-up ticket after the port. Applied default until answered: A, pinned by `verse.http.db.test.ts › answers today's verse when ?date is absent`.

Answer (owner, 2026-11-12): **REMOVE.** Superseded by Q-031: the endpoint is deleted, so the absent-`date` contract disappears with it.

## Q-036 The Store-colours card drops shops whose items are all checked off (M-groceries S1+S2, 2026-11-12)

Context: the card's shop list is built from the open items across both loaded lists (`knownStores`, `src/routes/(calendar)/calendar/groceries/+page.svelte:129-131`; `colourStores`, `:140`), so checking off the last item of a shop removes that shop from the card while its colour row survives. User-visible only.

Options:
A. Keep today's read path. Cost: a colour can be set but not changed once the shop's list empties.
B. Feed the card from the colour rows too, so a shop with a colour is always offered. Cost: a post-S7 ticket; the card can then list a shop that has no items.

Recommendation: B (the sheet's) after S7, as its own ticket — a visible improvement, not a port. Applied default until answered: A, not pinned by a golden yet (page-level UI, no S2 golden).

Answer (owner, 2026-11-12): **A** (recorded default). The card keeps hiding all-checked shops.

## Q-038 The add toast names the remembered store, not the stored one (M-groceries S1+S2, 2026-11-12)

Context: the toast appends `guessed` only when the user typed no store (`src/routes/(calendar)/calendar/groceries/+page.svelte:306-312`), so an item the server auto-filled with a different store is announced without its real shop. User-visible; the response already carries the created row.

Options:
A. Keep the remembered-store copy. Cost: the toast can name a shop the row does not have.
B. Print the store the created item actually carries, same copy shape. Cost: the toast reads the response instead of the local guess; no wire change.

Recommendation: B (the sheet's) — truthful value, same sentence. Applied default until answered: A, not pinned by a golden yet (page-level UI).

Answer (owner, 2026-11-12): **B.** The add toast names the store the created item actually has.

## Q-039 `PATCH /api/groceries/colours` `{scope:'family'}` answers 500 (#086) (M-groceries S1+S2, 2026-11-12)

Context: the personal branch of the colour upsert names the partial index it conflicts on (`targetWhere: sql\`family_id IS NULL\``, `src/lib/server/db/actions/groceries.ts:287-294`) but the family branch targets `[familyId, storeKey]` without it (`:296-302`), and no unique index covers those two columns alone — Postgres cannot infer the arbiter, so every family colour write throws and the route answers `500 {"error":"Failed to set the colour"}` for any user with a family. Wire-visible and pinned as a budgeted fault.

Options:
A. Keep the 500. Cost: the family half of a shipped feature does not work at all.
B. Fix it in its own `fix(groceries): Q-039 …` (or `fix-in-port #086`) commit and flip the one golden to `200 {ok:true}`. Cost: a golden flips and a 500 disappears; the wire intent ("Everyone" writes work) is already what the UI offers.

Recommendation: the sheet's: fix in its own commit and flip that one golden. Applied default until answered: A, pinned by `groceries.http.db.test.ts › faults with 500 on a family write — #086: partial index not inferred`.

Answer (owner, 2026-11-12): **B.** Fix the family colour write in its own commit and flip that golden.

## Q-040 A user-typed `📢` event counts as ad inventory (M-sponsored S1+S2, 2026-11-12)

Context: `getExistingAdEventsForMonth` selects every own Event in the month whose title starts with `📢` and converts it into a Sponsored Event (`src/lib/server/services/adService.ts:88-124`), and generation then tops the month up to three around those rows — so anyone who typed the emoji gets an "ad" that also suppresses generation. Wire-visible on `/api/sponsored-events`.

Options:
A. Keep it (the emoji is the marker; a user can opt out by not typing it). Cost: a user's own event is served back as ad inventory, and their month loses generated ads.
B. Drop the read: the generated month is the sole source. Cost: a real `📢` row stops appearing on the ad surface; the generated rows are unchanged. S4 also loses the `events` foreign read.

Recommendation: B (the sheet's) — "generated month" is a rule the module can hold in one place. Applied default until answered: A, pinned by `sponsored.http.db.test.ts › serves any own event whose title starts with 📢, trimmed, and nothing else`.

Answer (owner, 2026-11-12): **B.** A user-typed 📢 event is not ad inventory.

## Q-041 Generated Sponsored Events are re-randomised every request (M-sponsored S1+S2, 2026-11-12)

Context: generation draws a template and a day per ad with `Math.random()` (`src/lib/server/services/adService.ts:145-183`), and nothing persists a generated row (pinned virtual: `sponsored.http.db.test.ts › generates three Sponsored Events when the month has none` asserts no Event row is written). Two loads of the same month therefore show different ads on different days. Wire-visible.

Options:
A. Keep the per-request randomness. Cost: a calendar changes under a reader between refreshes, and a screenshot cannot be reproduced.
B. Seed the draw with `sha256(userId + 'YYYY-MM')`. Cost: same shape and count, values become stable per user and month; no DDL and no new port.

Recommendation: B (the sheet's) — deterministic without a table. Applied default until answered: A, pinned by the golden named above (the generated values themselves are unasserted).

Answer (owner, 2026-11-12): **B.** Generated Sponsored Events are deterministic per user and month.

## Q-042 A served Sponsored Event's `created_at` is invented per response (M-sponsored S1+S2, 2026-11-12)

Context: the display projection sets `created_at: new Date()` for real rows and for generated ones alike (`src/lib/server/services/adService.ts:314,332`), so the field moves on every request while `start` stays put. Wire-visible; the golden only checks the shape (`sponsored.http.db.test.ts › generates three Sponsored Events when the month has none`, `created_at` matched as a timestamp).

Options:
A. Keep `new Date()` per response. Cost: a timestamp that means nothing and changes under the reader.
B. Stored value for a real row, the month window's start for a generated one. Cost: one projection change; no client orders by the field today.

Recommendation: B (the sheet's). Applied default until answered: A, not pinned by a golden (only the shape is asserted).

Answer (owner, 2026-11-12): **B.** `created_at` carries the stored value for real rows and the month start for generated ones.

## Q-043 Which family calendar receives the `mirrorOf` copy (M-calendar S1+S2, 2026-11-12)

Context: `POST /api/events` mirrors a new Event onto `familyCals[0]` — the first row of an unordered `select … where calendars.familyId = …` (`src/routes/api/events/+server.ts:137-151`) — and does it whenever the target calendar id differs from that row, although its own comment says personal-calendar creations. With two family calendars the target is whichever Postgres returns first. Wire-visible (a second Event appears on someone's calendar).

Options:
A. Keep (`familyCals[0]`, any non-family source). Cost: nondeterministic target and possible duplicate copies.
B. Mirror only when the Event lands on the viewer's personal calendar and the family has exactly one calendar; otherwise skip. Cost: a family with two calendars stops mirroring until (C) lands.
C. Introduce a designated family calendar. Cost: schema/settings change plus a UI to choose it.

Recommendation: B (the sheet's) now, C later. Applied default until answered: A, pinned by `calendar.events.http.db.test.ts › mirrors the creation onto the family calendar when the setting is on`.

Answer (owner, 2026-11-12): **B.** Mirror only personal-calendar events, and only when exactly one family calendar exists.

## Q-045 RRULE `BYDAY` with an ordinal drops the whole day set (M-calendar S1+S2, 2026-11-12)

Context: the ICS parser strips an ordinal prefix per item, then requires the stripped join to equal the raw value before keeping it (`src/lib/server/services/icsImportService.ts:235-245`), so `BYDAY=2TU` yields `null` and the series expands on the anchor weekday instead of the second Tuesday. Import-time only; the stored value is wire-visible afterwards.

Options:
A. Keep (drop ordinals, keep the anchor weekday). Cost: an imported monthly "2nd Tuesday" series lands on the wrong days of the month.
B. Strip ordinals per item and keep the plain codes (`2TU,4TH` → `TU,TH`), the same rule writes already apply through `sanitizeRecurrenceByDay`. Cost: an own commit, golden first; the imported days change (that is the point).

Recommendation: B (the sheet's). Applied default until answered: A, not pinned by a golden yet (the legacy unit test `icsImportService.test.ts › parses RRULE BYDAY into a lowercase weekday set` covers plain codes only).

Answer (owner, 2026-11-12): **B.** Ordinals are stripped per item and the weekday codes are kept.

## Q-047 A partial `PUT` clears a recurring Event's recurrence (M-calendar S1+S2, 2026-11-12)

Context: every write runs `normalizeEventRecurrence(body)` (`src/routes/api/events/[id]/+server.ts:112`, helper at `src/lib/server/services/eventRecurrence.ts:50`), so a body that omits `recurrenceFrequency` — a title edit, a drag-move of `{start, end}` — clears the series and turns the Event into a one-off. Data loss, visible to every family member afterwards. Pinned.

Options:
A. Keep (the golden pins it). Cost: an ordinary edit silently destroys a series.
B. Give `recurrenceFrequency` the #228 absent-vs-null rule: absent = unchanged, explicit `null` = clear. Cost: a wire rule change, owner-approved, golden first (`fix(calendar): Q-047 …`); a client that relied on omission to clear must send `null`.

Recommendation: B (the sheet's) — it is data loss today. Applied default until answered: A, pinned by `calendar.events.http.db.test.ts › clears recurrence when a partial body omits it (every write goes through normalizeEventRecurrence)`.

Answer (owner, 2026-11-12): **B.** Absent means unchanged and `null` means clear, so a title edit keeps the series.

## Q-048 An exported occurrence can have DTEND before DTSTART (M-calendar S1+S2, 2026-11-12)

Context: for a `scope:'this'` Exception Override the `.ics` export takes `exception.end ?? event.end` — the master's end — so an occurrence moved earlier keeps a later end from the master and can emit `DTEND` before `DTSTART`. Wire-visible to whoever imports the file. The golden pins the stored-exception case (`calendar.events.http.db.test.ts › exports a scope-this Exception Override as one VEVENT without an RRULE`).

Options:
A. Keep. Cost: an unimportable or wrong-length occurrence.
B. Derive the end from the master's duration, as the display pipeline already does. Cost: the `.ics` content changes; owner-approved.
C. Omit `DTEND` when the exception has none (RFC allows it). Cost: importers default to the master's duration anyway, so this fixes less.

Recommendation: B (the sheet's) — one rule for display and export. Applied default until answered: A, pinned by the golden named above.

Answer (owner, 2026-11-12): **B.** Exported occurrences take their DTEND from the master's duration.

## Q-049 The print sheet expands through the legacy ±2-year window (M-calendar S1+S2, 2026-11-12)

Context: `printData` calls `expandEventsForUser(rows, undefined, zone)` (`src/lib/server/services/printData.ts:88-96`), and the default window is ±2 years (`src/lib/server/services/eventDisplayService.ts:40-45,70-75`). A dense series fills the module's occurrence cap long before the printed month, so rows can be missing from a printed sheet that every other read shows. User-visible; the print golden pins a normal month (`calendar.bulk.http.db.test.ts › lays the requested month out as a Sunday-first grid by default`).

Options:
A. Keep the wide window and pin its edge case. Cost: a clock-dependent failure no golden can hold, and rows can vanish from a print.
B. Bound it to the printed month plus a week's padding, like every other read. Cost: a fix-in-port with an S5 service test; a normal month prints identically.

Recommendation: B (the sheet's). Applied default until answered: A, pinned by the golden named above.

Answer (owner, 2026-11-12): **B.** The print sheet reads the month window plus a week of padding.

## Q-050 No cloud-AI fallback for smart bulk edits (M-calendar S1+S2, 2026-11-12; screens: S-calendarPage)

Context: an instruction the rule planner cannot match answers `422 {"error":"Could not match that instruction. Try naming a date or the events."}` (`src/routes/api/events/bulk/+server.ts:237-242`). The legacy service carries an unwired cloud branch behind it — prompt, cloud-AI opt-out and a spend gate around `chatJson` (`src/lib/server/services/bulkAiService.ts:321-390`) — with no production caller, so today's answer is deterministic-only, and the port dropped the branch entirely. Wire-visible only in what a failing instruction gets.

Options:
A. Restore the cloud fallback in v2. Cost: an `ai` port plus a consent story for sending event titles to a vendor, and a billed call per unmatched instruction.
B. Keep smart bulk edits rule-based only, with the honest 422. Cost: an instruction phrased outside the grammar is refused rather than guessed.

Recommendation: B (the sheet's) — deterministic, no vendor, and the 422 says what to fix. Applied default until answered: B (today's behaviour), pinned by `calendar.bulk.http.db.test.ts › answers 422 when the instruction matches nothing and when a posted plan names no editable id`.

Answer (owner, 2026-11-12): **B.** Smart bulk edits stay rule-based with the honest 422; no cloud-AI fallback until asked.

## Q-051 `PUT /api/tasks/{id}` accepts a raw `completedAt` (M-tasks S1+S2, 2026-11-12)

Context: the field patch takes any parseable string straight into the column (`src/routes/api/tasks/[id]/+server.ts:235-238`), so a client can complete or un-complete a Task without the cursor advance or the `taskCompletions` history row the stats and streaks read. `docs/guides/task-api-spec.md` tells clients not to send it. Wire-visible; pinned.

Options:
A. Keep the direct write. Cost: stats, streaks and the recurring cursor diverge from the row.
B. Answer `400 {"error":"completedAt cannot be set directly"}`. Cost: a client that sends it starts failing; the spec already forbids it, and the toggle route is the supported path.

Recommendation: B (the sheet's) — the column has one writer. Applied default until answered: A, pinned by `tasks.update.http.db.test.ts › writes a raw completedAt directly, bypassing the cursor and history`.

Answer (owner, 2026-11-12): **B.** PUT refuses a raw `completedAt` with a 400.

## Q-052 `PUT` never validates `dueDate` (M-tasks S1+S2, 2026-11-12)

Context: `dueDate: body.dueDate === undefined ? undefined : body.dueDate || null` (`src/routes/api/tasks/[id]/+server.ts:231`) passes any truthy value to the UPDATE, and a bad one makes the write throw, so the route answers `500 {"error":"Failed to update task"}` — while `POST` answers `400 Invalid dueDate` for the same input. Wire-visible; pinned.

Options:
A. Keep the 500. Cost: a client validation error looks like a server fault, and the golden has to keep pinning a crash.
B. Validate like `POST`, same wording, `400 Invalid dueDate`. Cost: a 500 becomes a 400 — a wire change, and one golden flips.

Recommendation: B (the sheet's) — same input, same answer, one crash fewer. Applied default until answered: A, pinned by `tasks.update.http.db.test.ts › does not validate dueDate: garbage reaches the UPDATE and answers 500`.

Answer (owner, 2026-11-12): **B.** PUT validates `dueDate` like POST and answers 400.

## Q-053 `assignmentStatus: 'declined'` is never stored (M-tasks S1+S2, 2026-11-12)

Context: a decline rewrites the patch to `{assignedTo: null, assignmentStatus: 'none'}` (`src/routes/api/tasks/[id]/+server.ts:186-188`), so the row loses its assignee, while the assignments card renders a `Declined` badge for a value the server never writes (`src/lib/components/tasks/AssignmentsCard.svelte:124-128`). Wire-visible (the row's status) and user-visible (a badge that cannot appear).

Options:
A. Store `declined` so the badge is true. Cost: a new value on the wire, and the task stops being unassigned on the board.
B. Keep release-and-`none` and fix the badge to show the status the row actually holds. Cost: the decline stays invisible as a fact; the card stops promising a state that does not exist.

Recommendation: B (the sheet's) — the released assignee is the behaviour the board relies on. Applied default until answered: A, pinned by `tasks.update.http.db.test.ts › lets the current assignee decline: assignee cleared, status none, owner alerted`.

Answer (owner, 2026-11-12): **B.** A decline keeps releasing the assignee; the "Declined" badge is fixed to match.

## Q-054 A whitespace-only `title` on PUT is silently ignored (M-tasks S1+S2, 2026-11-12)

Context: `title: isNonEmptyString(body.title) && body.title.trim() ? body.title.trim() : undefined` (`src/routes/api/tasks/[id]/+server.ts:229`) drops the field, so a `PATCH` with `{title:"   "}` answers `200` and leaves the old title — while `POST` answers `400 Title is required`. Wire-visible; pinned.

Options:
A. Keep ignoring it. Cost: a client cannot tell whether its edit applied; the two verbs disagree about one field.
B. Answer `400 {"error":"Title is required"}`, the POST message. Cost: a wire change for a client that sends blanks; one golden flips.

Recommendation: B (the sheet's). Applied default until answered: A, pinned by `tasks.update.http.db.test.ts › silently ignores a whitespace-only title instead of rejecting it`.

Answer (owner, 2026-11-12): **B.** A whitespace-only title on PUT answers 400 `Title is required`.

## Q-055 `?eventId=` returns a second Task shape (M-tasks S1+S2, 2026-11-12)

Context: that branch reads raw rows through `getTasksForEvent` (`src/lib/server/db/actions/tasks/queries.ts:72-79`) and only adds `eventCalendarId` (`src/routes/api/tasks/+server.ts:71-74`), so the answer has no `tags`, no assignee/creator names and no `eventTitle` — unlike the list branch beside it. Wire-visible; pinned.

Options:
A. Keep the two shapes. Cost: one endpoint, two contracts; a client that renders a task from `?eventId=` shows less than the same task in the list.
B. Unify on the list shape (additive fields; installed clients ignore extras). Cost: a bigger payload on the event checklist; no field removed.

Recommendation: B (the sheet's). Applied default until answered: A, pinned by `tasks.http.db.test.ts › lists an accessible event's tasks, hides another member's private one (#164)`.

Answer (owner, 2026-11-12): **B.** `?eventId=` returns the list shape.

## Q-056 Command `stop` validates `taskId` ownership it ignores (M-tasks S1+S2, 2026-11-12)

Context: `POST /api/taskfocus/commands` looks the task up whenever `taskId` is present and answers `400 Task not found` for a foreign or unknown id (`src/routes/api/taskfocus/commands/+server.ts:72-85`), though `stop` never uses the id and the spec says it may carry none. Wire-visible; pinned as today's behaviour.

Options:
A. Keep the check for both commands. Cost: a stop carrying a stale id is refused although the command would have worked.
B. Skip the ownership check for `stop` (still validate the id's type/length). Cost: a wire change: a 400 becomes a 201; one golden flips.

Recommendation: B (the sheet's). Applied default until answered: A, pinned by `tasks.focus.http.db.test.ts › validates taskId ownership even for stop (probably accidental)`.

Answer (owner, 2026-11-12): **B.** `stop` skips the task-ownership check.

## Q-058 Skip writes `completedAt: null` (M-tasks S1+S2, 2026-11-12)

Context: the recurring advance sets `{dueDate, completedAt: null}` (`src/lib/server/db/actions/tasks/cursor.ts:143-145`), so skipping a series reopens a row that was already completed — skip is not complete, but the write says it is. Wire-visible; pinned.

Options:
A. Keep it. Cost: an advance changes completion state nobody asked it to change.
B. Stop writing `completedAt` on skip. Cost: a completed row keeps its stamp as the cursor moves; one golden flips.

Recommendation: B (the sheet's). Applied default until answered: A, pinned by `tasks.update.http.db.test.ts › skips without counting or recording history, and reopens a completed row`.

Answer (owner, 2026-11-12): **B.** Skip stops clearing `completedAt`.

## Q-059 "Clear completed" archives only rows the caller owns (M-tasks S1+S2, 2026-11-12)

Context: `deleteCompletedTasks` archives `where(and(eq(tasks.userId, userId), isNotNull(completedAt), isNull(archivedAt)))` (`src/lib/server/db/actions/tasks/mutations.ts:196-200`), while the board also shows completed rows the caller accepted as an assignee — so the button leaves rows on screen it claims to have cleared. User-visible; the golden pins the narrower scope.

Options:
A. Keep the owner-only archive. Cost: the button does not clear what the page shows.
B. Also archive the caller's accepted assignments. Cost: an accepted handoff disappears from the caller's list (it stays for its owner); one golden flips to a wider set.

Recommendation: B (the sheet's). Applied default until answered: A, pinned by `tasks.http.db.test.ts › archives only the caller's completed rows and keeps every other row`.

Answer (owner, 2026-11-12): **B.** "Clear completed" includes the caller's accepted assignments.

## Q-060 Focus is offered only to the Task's owner (M-tasks S1+S2, 2026-11-12)

Context: the row computes `canFocus = task.userId === currentUserId && !task.completedAt` (`src/lib/components/tasks/TaskRow.svelte:109-113`) while completion is offered to every `canMutateTask` viewer — because the device-channel `start` command only accepts the caller's own tasks. So an accepted assignee can complete a Task but cannot focus on it. User-visible only.

Options:
A. Keep the owner-only affordance. Cost: the person doing the work cannot time it.
B. Offer focus to every `canMutateTask` viewer. Cost: the command channel's ownership rule has to widen with it (a tasks-contract change), otherwise the control 400s.

Recommendation: B (the sheet's) — offer to every mutator, and widen the command rule with it. Applied default until answered: A, not pinned by a golden yet (a component-level rule; the command contract's owner check is pinned in `tasks.focus.http.db.test.ts`).

Answer (owner, 2026-11-12): **B.** Everyone who can edit a Task can focus on it.

## Q-061 `POST /api/tasks` has no type check on `notes` (M-tasks S1+S2, 2026-11-12)

Context: `notes: body.notes || null` (`src/routes/api/tasks/+server.ts:205`) hands any truthy non-string to the text column; whether it lands as JSON, a stringified value or a driver error depends on the driver. Wire-visible but unpinned.

Options:
A. Keep (unpinned). Cost: an observably undefined contract for one field.
B. Answer `400` for a non-string `notes`. Cost: a wire change for a malformed body that today may be stored; no golden covers it, so one is written with the change.

Recommendation: B (the sheet's) in S3. Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** POST refuses a non-string `notes` with a 400.

## Q-062 Forgot/reset answer 500 for a malformed body (M-access S1+S2, 2026-11-12)

Context: both web handlers read `await event.request.json()` inside their `try` (`src/routes/(marketing)/forgot-password/+server.ts:47-48,89-92`; `forgot-password/reset/+server.ts:68-69,132-135`), so malformed JSON is caught by the generic failure branch and answered `500 {"error":"Failed to send reset email"}` / `500 {"error":"Failed to reset password"}` instead of the house `400 {"error":"Invalid JSON"}` the `/api` twins answer. Wire-visible; both pinned.

Options:
A. Keep the 500. Cost: a client body error looks like an outage, on two of the app's most sensitive forms.
B. Answer the house `400 Invalid JSON` for a malformed or non-object body. Cost: a wire change on page routes; Android already treats `{"error"}` uniformly, so only the status moves.

Recommendation: B (the sheet's). Applied default until answered: A, pinned by `access.http.db.test.ts › answers 500 {"error":"Failed to send reset email"} for a malformed body` and `› answers 500 {"error":"Failed to reset password"} for a malformed body`.

Answer (owner, 2026-11-12): **B.** Both answer 400 `Invalid JSON` on malformed bodies.

## Q-064 Two page-code routes leak membership through their 500s (M-access S1+S2, 2026-11-12)

Context: redeeming a signup code for an address that already has an account answers `500 {"success":false,"error":"Account with this email already Exists"}` (`src/routes/(marketing)/signup/email/code/+server.ts:89-93`) and the login twin answers `500 …"error":"No Account found"` (`src/routes/(marketing)/login/email/code/+server.ts:96-99`), so either page tells an anonymous visitor whether an address is registered — the enumeration oracle the rest of the auth surface works to avoid. User-visible copy, no golden (page routes).

Options:
A. Keep the two messages. Cost: an account oracle on two public pages.
B. Answer the generic `Unexpected error, please try again` in both places. Cost: a signed-in-edge user loses the one sentence that explained their trouble; no wire change for Android (page routes).

Recommendation: B (the sheet's). Applied default until answered: A, not pinned by a golden yet (both are page routes outside the `/api` golden set).

Answer (owner, 2026-11-12): **B.** Both page-code routes answer the generic "Unexpected error, please try again".

## Q-065 Email-change codes are stored in plaintext (M-access S1+S2, 2026-11-12)

Context: `requestEmailChange` writes the freshly generated code to `codes.code` as typed (`src/lib/server/services/accountData.ts:375-383`), while every other code kind is stored as a hash and looked up by digest (#162). The value is burned on use and never leaves the server, so this is internal — until the table is read.

Options:
A. Keep plaintext for the email-change kind. Cost: one code kind is readable by anyone with a database snapshot.
B. Hash it at rest now, look it up by digest, keep the same single-use semantics. Cost: no wire change; an in-flight code minted before the deploy stops matching (they expire in fifteen minutes anyway).

Recommendation: B (the sheet's) — one code kind is not a reason to keep a second storage rule. Applied default until answered: A, not pinned by a golden yet (the code row is written by a page action; the redemption route's goldens assert the answer shape).

Answer (owner, 2026-11-12): **B.** Email-change codes are hashed at rest now.

## Q-066 The reset throttle lives in the mobile wrapper only (M-access S1+S2, 2026-11-12)

Context: `POST /api/mobile/auth/reset` wraps the web handler in a ten-per-fifteen-minutes IP limit and says in its own comment that the web handler has no throttle (`src/routes/api/mobile/auth/reset/+server.ts:5-11,20-31`); the web reset route it calls has no limiter at all (`src/routes/(marketing)/forgot-password/reset/+server.ts:68-135`). Forgot-password itself throttles per address in the handler. Wire-visible only through the 429 on one path.

Options:
A. Keep the limiter in the wrapper. Cost: the web form can be used to grind reset attempts from any IP, and each deployment must remember where the rule lives.
B. Move the limiter into the shared handler so both doors are capped. Cost: the web form gains a 429 it never had; the mobile 429 golden must keep passing (same limit, same message).

Recommendation: B (the sheet's). Applied default until answered: A, pinned by `access.http.db.test.ts › throttles reset attempts at 10 per 15 minutes per IP`.

Answer (owner, 2026-11-12): **B.** The reset throttle moves into the shared service, so the web form gains the IP cap.

## Q-068 Two contact implementations with different budgets and 500s (M-marketing S1+S2, 2026-11-12)

Context: `POST /api/contact` is an action under the `api` route tree that throttles 3 per 15 minutes and answers its failure through `apiError` (`src/routes/api/contact/+page.server.ts:26-78`), while the `/contact` page action throttles 5 per 10 minutes and answers `fail(500, …)` (`src/routes/(marketing)/contact/+page.server.ts:12,43-93`). Same recipient, two copies of one form, two behaviours. Wire-visible: the `/api` action's golden pins the 3-per-15 budget (`marketing.http.db.test.ts › answers {success:true} to a complete form from a signed-out visitor`).

Options:
A. Keep `/contact` and delete the `/api` route in S8. Cost: an installed client that calls `/api/contact` loses its path.
B. Keep `/api/contact` and retire the `/contact` form action. Cost: the page posts to the `/api` action; no client path disappears.
C. Keep both over one service. Cost: two throttles for one mailbox, forever.

Recommendation: B (the sheet's) — the `/api` route is the module's only wire, and a golden already pins it. Applied default until answered: A, pinned by the golden named above.

Answer (owner, 2026-11-12): **B.** Keep `/api/contact`; retire the `/contact` form action.

## Q-069 The home page's `<title>` disagrees with its SEO row (M-marketing S1+S2, 2026-11-12)

Context: the SEO row for `/` says `Family Planz — the shared family calendar` (`src/lib/marketing/seo.ts:51-56`) while the page sets `Family Planz - The Family Calendar That Brings Everyone Together` (`src/routes/(marketing)/+page.svelte:4-6`), so the share card advertises copy the page never shows. The test that would catch it walks the `(marketing)` directory's children, so the root page itself is never compared (`src/lib/marketing/seo.test.ts:27-36,47-65`). User-visible (og:title) and internal (the blind spot).

Options:
A. Change the SEO row to the page's copy. Cost: the share card keeps the long marketing line, and the blind spot stays.
B. Make the page title match the SEO row and extend the test to `/`. Cost: the visible tab title changes; the test gains the root.
C. Leave both. Cost: two titles for the home page, and nothing catches the next drift.

Recommendation: B (the sheet's) — the row is the copy written for search. Applied default until answered: A, pinned by `seo.test.ts › the seo table matches the routes › /%s has a row, and the row says what the page says` (whose route list never includes `/`).

Answer (owner, 2026-11-12): **B.** The home `<title>` matches the SEO row, and the SEO test covers `/`.

## Q-070 The waitlist action accepts a consent flag no surface collects (M-marketing S1+S2, 2026-11-12)

Context: the `/waitlist` action reads `consent` (`on`/`true`/`yes`), stamps `consentedAt`/`optedInAt` when it is present, and stores `preferences: {marketing:false, updates:false}` (`src/routes/(marketing)/waitlist/+page.server.ts:60-77`), but neither the page nor anything else posts the field, so both columns are permanently null. The table is `waitlist` with its own dedupe index.

Options:
A. Add the checkbox at S7 and keep the stamps. Cost: a consent record nobody asked to collect, on a form being removed.
B. Drop `consent` from the contract in S3. Cost: the columns stay null; no reader exists either way.

Recommendation: A only if the owner needs a consent record; otherwise B (the sheet's). Applied default until answered: A, not pinned by a golden yet (the page action has no S2 golden).

Answer (owner, 2026-11-12): **REMOVE.** The waitlist leaves the website: the `/waitlist` page, its form action and the pricing page's links go. The `waitlist` table stays (no DDL), and Android's "Join Waitlist" still opens `/pricing`, relabelled app-side later.

## Q-071 The waitlist success card promises a flow that does not exist (M-marketing S1+S2, 2026-11-12)

Context: the success card says "We sent a verification link to your inbox." and "This completes your double opt-in and adds you to the waitlist." (`src/routes/(marketing)/waitlist/+page.svelte:35-42`), while the confirmation email carries neither a link nor a code and no double opt-in exists. User-visible false copy.

Options:
A. Rewrite the card to "we'll email you when a place opens". Cost: one string, and the card stops describing a flow outside this rebuild.
B. Build the double opt-in flow. Cost: a link, a redemption route and a state machine for a page being deleted.

Recommendation: A (the sheet's) — the flow is outside the rebuild, and today's copy is false. Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **REMOVE.** Superseded by Q-070: the page and its card are deleted, so the copy question disappears with them.

## Q-079 The export card says "everything your account stores" (S-account S1+S2, 2026-11-12; screens: S-account)

Context: the card promises "a copy of everything your account stores: profile, settings, families, calendars and events, tasks, bills and receipt lines, grocery lists and notifications" (`src/lib/components/account/AccountDangerSection.svelte:42-46`), while the builder deliberately omits `adConsentRecords` and `aiUsageTracking` (plus the auth-mechanical tables) and documents why (`src/lib/server/db/actions/export.ts:22-34`). The document itself is pinned (`account.http.db.test.ts › downloads the requester document and no other member private rows`). User-visible copy.

Options:
A. Keep the copy as it is. Cost: the card claims a completeness the file does not have.
B. Reword it to name what is included and what is left out. Cost: one paragraph; no wire change.

Recommendation: B (the sheet's) — an honest sentence is cheaper than widening a fixed wire. Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** The export card names what is included and omitted.

## Q-080 The account rail's Report-a-Bug link drops the page context (S-account S1+S2, 2026-11-12; screens: S-account)

Context: the navbar builds its link through `reportBugHref`, which appends `?from=<path>` (`src/lib/utils/reportBug.ts:6-10`), while the rail's link is a bare `/report-bug` (`src/lib/components/account/AccountSidebar.svelte:94-107`), so a report filed from a section loses which section it was on. User-visible in the bug report the owner receives.

Options:
A. Keep the bare link. Cost: every rail-filed report says `/report-bug` instead of the section.
B. Share the helper and append `?from=/account#<section>`. Cost: none on the wire; the form's `from` validation already accepts a same-origin path with a search.

Recommendation: B (the sheet's). Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** The rail link carries `?from=/account#<section>`.

## Q-081 One section, two names: rail "Plan & usage", heading "Subscription" (S-account S1+S2, 2026-11-12; screens: S-account)

Context: the section list labels the id `subscription` as "Plan & usage" (`src/lib/components/account/accountSections.ts:21`) while the section's own heading says "Subscription" (`src/lib/components/account/AccountSubscriptionSection.svelte:63`). User-visible.

Options:
A. Keep both names. Cost: a reader has to learn that two words mean one section.
B. Make both "Plan & usage". Cost: one heading string; no wire change.

Recommendation: B (the sheet's) — the section shows a limits table, not a bare plan name. Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** The rail and the heading both say "Plan & usage".

## Q-082 The default-calendar picker lists every row as "Personal Calendar" (S-account S1+S2, 2026-11-12; screens: S-account)

Context: the load maps every owned calendar to `{ id, name: 'Personal Calendar', color: userSettings?.color }` (`src/routes/(calendar)/account/+page.server.ts:66-71`), so two personal calendars are indistinguishable in the select and both wear the settings colour. User-visible; the wire (`/api/me/settings`) only carries the chosen id.

Options:
A. Keep the placeholder. Cost: a user with two personal calendars cannot tell which one is the default.
B. Show each calendar's real name and colour. Cost: the page load reads the rows it already has; no wire change.

Recommendation: B (the sheet's) — calendar's model already carries both. Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** The default-calendar picker shows real calendar names.

## Q-086 A colourless family falls back to the retired blue (S-familyHub S1+S2, 2026-11-12; screens: S-familyHub)

Context: the detail page falls back to `#3b82f6` in its edit state and its hero glow (`src/routes/(family)/family/[familyId]/+page.svelte:77,295`), while the palette retired that blue in favour of `DEFAULT_FAMILY_COLOR` (`src/lib/utils/familyPalette.ts:23-36`). User-visible for a family whose colour is null.

Options:
A. Keep the blue. Cost: an unapproved colour renders until a data migration fills the column.
B. Fall back to `DEFAULT_FAMILY_COLOR` (terracotta). Cost: one visual difference for null-colour families; families created since #099 always carry a palette colour.

Recommendation: B (the sheet's) — the retired blue is not an approved colour. Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** A colourless family uses the palette default.

## Q-091 The board renders every completed Task (S-familyHub S1+S2, 2026-11-12; screens: S-familyHub)

Context: the completed list takes whatever the board read returns and renders all of it, with the heading counting the full set (`src/lib/components/tasks/FamilyCompletedTaskList.svelte:20-25`); the read is `getTasksForFamily`, which skips archived rows but not completion age (`src/lib/server/db/actions/tasks/queries.ts:60-70`, reached via `loadFamilyTasks`, `src/lib/server/services/familyData.ts:406-417`). A long-lived family accumulates thousands of rows and ships them all. User-visible and payload-visible.

Options:
A. Keep it unbounded. Cost: a family's board payload grows without limit.
B. Show the newest 50 completed plus the true count, endpoint unchanged. Cost: the heading's number and the list's length stop matching, which is the intended change; ADR 0010 already requires bounded lists.

Recommendation: B (the sheet's). Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** The board shows the newest 50 completed plus the true count.

## Q-092 A write runs inside the board's read path (S-familyHub S1+S2, 2026-11-12; screens: S-familyHub)

Context: `getTasksForFamily` calls `syncRecurringCursors` before selecting (`src/lib/server/db/actions/tasks/queries.ts:80-84`) and `getPublicTasksForFamily` does the same with the member-personal leg (`:206-210`), so every board read mutates the cursor rows first — a read that can fail or block on a write, and a screen that cannot be cached. Not wire-visible; timing is.

Options:
A. Keep write-before-read. Cost: a page read carries a write's failure modes.
B. Move the pin to the write path (complete/advance) plus a scheduled sweep. Cost: M-tasks work; the cursor can lag until the next write or sweep.

Recommendation: B (the sheet's), flagged for M-tasks. Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** The recurring-cursor pin moves out of the board read into writes and a scheduled sweep (M-tasks).

## Q-093 `glance.openToday` counts the whole backlog (S-dayDashboard S1+S2, 2026-11-12; screens: S-dayDashboard)

Context: `openToday` counts every open Task whose due date is before the viewed day's end, with no lower bound (`src/lib/server/services/dashboardData.ts:373-375`), so a past day counts everything still open and long-overdue work inflates a card that says "today". Wire-visible (G8 field), pinned by `dayDashboard.http.db.test.ts › returns the full contract for a family day, resolved, in the viewer zone`.

Options:
A. Keep the count and fix only the label. Cost: the number keeps disagreeing with the word beside it.
B. Bound it to `[dayStart, dayEnd)`. Cost: a G8 field's value changes; needs the owner (this question) and a spec bump.

Recommendation: B (the sheet's). Applied default until answered: A, pinned by the golden named above.

Answer (owner, 2026-11-12): **B.** Glance `openToday` counts only the viewed day.

## Q-094 Family events are always `#e0ffff` (S-dayDashboard S1+S2, 2026-11-12; screens: S-dayDashboard)

Context: the day's own events take the settings colour (else `#fa8072`) while every family event is hard-coded `#e0ffff` (`src/lib/server/services/dashboardData.ts:186-196`), although `GET /api/calendars` already returns the family calendar's configured colour. Same field, wrong value. Wire-visible; pinned by the same `:344` golden.

Options:
A. Keep the constant. Cost: a family's chosen colour never reaches the dashboard.
B. Send the family calendar's configured colour, falling back to `#e0ffff`. Cost: a colour value changes; clients already render whatever arrives.

Recommendation: B (the sheet's). Applied default until answered: A, pinned by `dayDashboard.http.db.test.ts › returns the full contract for a family day, resolved, in the viewer zone`.

Answer (owner, 2026-11-12): **B.** Family events use the family calendar's colour, falling back to `#e0ffff`.

## Q-097 A Sponsored Event suppresses the "Blank calendar!" card (S-calendarPage S1+S2, 2026-11-12; screens: S-calendarPage)

Context: `allEvents` merges `data.adEvents` into the event list (`src/routes/(calendar)/calendar/+page.svelte:320-326`) and the first-run card is shown only when `allEvents.length === 0` (`:394-397`), so a viewer who opted into ads and created nothing never sees it. User-visible only for ad-opted-in users.

Options:
A. Keep counting ads as content. Cost: the first-run card is unreachable for exactly the users who have nothing yet.
B. Exclude Sponsored Events from the emptiness test. Cost: one predicate; the card then appears beside the ads.

Recommendation: B (the sheet's) — an ad is not the family's content. Applied default until answered: A, not pinned by a golden yet (the planned `calendarPage.state.test.ts` case is not written).

Answer (owner, 2026-11-12): **B.** Sponsored Events do not count for the "Blank calendar!" test.

## Q-098 The banner can name a `family` failure of its own (S-calendarPage S1+S2, 2026-11-12; screens: S-calendarPage)

Context: each section load is wrapped in `guard(label, …)` which pushes its label onto `loadWarnings` (`src/routes/(calendar)/calendar/+page.server.ts:42-44`), and the family leg's label is `'family'` (`:129-133`), so a family-read failure shows a distinct label beside `calendar`. The client surfaces the list verbatim.

Options:
A. Keep a separate `family` label and the split read that produces it. Cost: one degrade path owns a label of its own though the new read is one calendar read.
B. Fold `family` into `calendar`. Cost: the banner's copy changes only when a section fails.

Recommendation: B (the sheet's) — the split existed only to serve an old degrade path. Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** The `family` warning label folds into `calendar`.

## Q-099 Event colour is derived from list position, not the event's calendar (S-calendarPage S1+S2, 2026-11-12; screens: S-calendarPage)

Context: both colour paths build a set from `data.calendarIds.slice(1)` and treat membership as "family, use the family colour" (`src/routes/(calendar)/calendar/+page.svelte:50-54` for fetched ranges, `:446-449` for a newly created event), so a user with no personal calendar has the family calendar at index 0 and every family event tinted with the personal colour. User-visible.

Options:
A. Keep the positional rule and file a ticket. Cost: a wrong tint for a whole class of users.
B. Resolve colour from each event's own `calendarId`. Cost: no wire change; the invariant then holds by construction.

Recommendation: B (the sheet's). Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** Colour comes from each event's own `calendarId`.

## Q-101 Task categories load on every calendar page visit (S-calendarPage S1+S2, 2026-11-12; screens: S-calendarPage)

Context: the load starts `listCategoryOptions(userId)` unconditionally (`src/routes/(calendar)/calendar/+page.server.ts:97-99`) and awaits it into the payload (`:307`), so the read is paid on every visit for a create modal that may never be opened. Not wire-visible; the modal is already a lazy chunk with a pending state.

Options:
A. Keep them in the page payload. Cost: one read per visit for a rare path, plus a few hundred bytes.
B. Fetch them when the create modal's task tab first opens. Cost: one roundtrip on that path; the modal needs the pending state it already has.

Recommendation: B (the sheet's). Applied default until answered: A, not pinned by a golden yet.

Answer (owner, 2026-11-12): **B.** Task categories load on the task tab's first open.

## Recorded defaults (the sheets recommend keeping legacy)

Every row below is a question the module sheets raised and answered themselves: keep today's behaviour. The owner has not overridden any of them, so each stands as `A (recorded default)` and the sheet may cite its id. Each is filed with its own id so a later sheet or ticket can point at it, and the owner may reverse any of them.

| id | module | question | today | why keep | answer | pinned by |
|---|---|---|---|---|---|---|
| Q-014 | identity | Do the dead `useCloudAI`/`useLocalAI` columns stay, become writable, or drop? | Two booleans echoed read-only by `GET /api/me/settings` | Schema frozen; nothing honours them | A (recorded default) | `identity.http.db.test.ts › timeZone alone keeps every other stored field (and skips the stale default-calendar check)` |
| Q-016 | identity | Do #169 (token expiry/scopes, idle timeout, PII scrub) and #174 (email normalization + backfill) stay separate tickets? | Tokens live until revoked; emails stored as typed | #169 changes the Android contract; #174 needs a data backfill (owner decision) | A (recorded default) | `identity.http.db.test.ts › mints an fp_ token, answers 201 with the plaintext once and stores only its SHA-256` |
| Q-019 | alerts | Should `DELETE /api/devices` keep validating a `platform` it ignores? | `{token, platform:'ios'}` on DELETE → 400 | No client break; the change buys nothing | A (recorded default) | `alerts.http.db.test.ts › validates the platform even though DELETE ignores it` |
| Q-022 | alerts | Add an unread-count endpoint, or keep the bell polling the 50-row feed? | Full feed read per mount plus a 60 s poll | No wire change in the port; a count path is an Android-contract ticket | A (recorded default) | not pinned by a golden yet |
| Q-025 | family | Keep the two colour rules (create palette-only, PATCH any `#rrggbb`)? | Two rules over one column | Tightening a 200 into a 400 breaks stored custom colours | A (recorded default) | `family.http.db.test.ts › accepts a hex colour outside the palette (create offers six)` |
| Q-026 | family | Keep `200 {users:[]}` when `q`/`familyId` is missing? | Silent empty list | An empty type-ahead box is a normal state, not a client error | A (recorded default) | `family.http.db.test.ts › answers an empty list when q or familyId is missing` |
| Q-027 | family | Keep DELETE-of-a-non-member answering success? | `{success:true}`, no write | Idempotent delete, like the rest of the app; the UI only offers it on roster rows | A (recorded default) | `family.http.db.test.ts › answers a no-op success for a target who is not a member` |
| Q-029 | dashboardModules | Should `/api/me/dashboard-modules` reject unknown ids like the family switch route? | Unknown ids silently dropped, 200 | Covers a retired id after an app update; junk never persists either way | A (recorded default) | `dashboardModules.http.db.test.ts › drops every unknown id and answers 200, unlike the family switch route` |
| Q-030 | dashboardModules | How does `GET /api/families/{id}` keep returning `moduleSwitches` across the rank boundary? | The families payload carries the master-switch map | A fixed wire; the exception is declared in the registry, so the rule stays in one home | A (recorded default) | `family.http.db.test.ts › answers the whole detail payload for a member` |
| Q-033 | groceries | Keep the trailing-slash `400 Item ID required`? | `POST /api/groceries/<id>/` → 400 | One line keeps today's answer | A (recorded default) | `groceries.http.db.test.ts › answers 400 "Item ID required" for a trailing slash` |
| Q-034 | groceries | Keep scope travelling per verb (PATCH body, GET/DELETE `?scope`)? | Asymmetric, and Android sends exactly that | The installed client is the contract | A (recorded default) | `groceries.http.db.test.ts › answers 400 "scope must be mine or family" when body scope is absent or junk` |
| Q-035 | groceries | Keep writing the actor's `userId` on family colour rows? | Every flip rewrites it to the last writer | The family tier never reads it, and the column is NOT NULL | A (recorded default) | `groceries.http.db.test.ts › answers the viewer's own colour rows plus the palette` |
| Q-037 | groceries | Keep `stores: []` clearing every store on a row? | The row loses all its stores | An empty field honestly means "no store"; the UI already treats it so | A (recorded default) | `groceries.http.db.test.ts › accepts an empty store list and so clears every store on the row` |
| Q-044 | calendar | Add the `event_exceptions` unique index now, or keep the duplicate risk until #014? | Select-then-write, no unique index | The index is DDL and #014's ticket | A (recorded default) | `calendar.events.http.db.test.ts › scope 'this' writes an Exception Override and answers the series note` |
| Q-046 | calendar | Keep `rsvpStatus` carrying attendance rows? | The field holds rows, not the caller's status | Clients have only ever seen rows; adding a field cannot break a reader | A (recorded default) | `calendar.events.http.db.test.ts › upserts the viewer RSVP and answers the attendance (rsvpStatus carries the same rows)` |
| Q-057 | tasks | Keep the 25-command read cap with no paging? | FIFO slice of 25; a backlog waits for acks | The spec asks for a small FIFO list | A (recorded default) | `tasks.focus.http.db.test.ts › caps one read at 25 commands` |
| Q-063 | access | Keep mobile signup answering 200 while the web answers 201? | Two statuses for one event | The installed app may assert 200 | A (recorded default) | `access.http.db.test.ts › answers the same 200 pending shape for a taken email — empty token, nothing created` |
| Q-067 | access | Add the kernel `ctx.mail` port in this module's S5 so the spec-goldens unskip? | Eight success-path spec-goldens skipped | The port lands with S5 as planned, and the goldens unskip there | A (recorded default) | not pinned by a golden yet (`access.http.db.test.ts:1380` is the skip) |
| Q-072 | shell | Unread-count source: keep `GET /api/notifications` once per chrome mount? | The 50-row feed is read per mount and polled every 60 s | No wire change; revisit only if `perf:check` complains | A (recorded default) | not pinned by a golden yet |
| Q-073 | shell | Confirm chrome lives in the root layout, app-only for now, and screens never render a second navbar? | Chrome per group layout, remounting on group jumps | R1 leaves no alternative that avoids duplication | A (recorded default) | not pinned by a golden yet |
| Q-074 | shell | Confirm marketing's port owns the guest public header and `marketingNavItems`? | One shared nav module serves both | A domain cannot import a screen (R1) | A (recorded default) | not pinned by a golden yet |
| Q-075 | shell | Move Breadcrumbs to kernel/ui (K-08 scope addition)? | A 30-line component with 7 importers across account and familyHub | Screens cannot share a component; the alternative is one copy each | A (recorded default) | not pinned by a golden yet |
| Q-076 | shell | Approve the seven internal fixes and load-plan changes inside shell's commits? | Focus trap missing, banner overlap, a probe that never retries, a tab-bar fetch while hidden, … | None touches the schema, the `/api` wire, or a Must-keep rule | A (recorded default) | not pinned by a golden yet |
| Q-077 | account | Lazy section loading: a new internal `GET /account/section/[section]`? | Hash never reaches the server; every section loads on every visit | Keeps `/api` untouched and the first paint to one section | A (recorded default) | not pinned by a golden yet |
| Q-078 | account | Export composition: per-domain slice services composed by the screen? | One fixed document spanning eight domains | A screen owns no tables; an app-level exporter breaks that | A (recorded default) | `account.http.db.test.ts › downloads the requester document and no other member private rows` |
| Q-083 | account | Who owns the `/account` login guard? | The group layout and the page both redirect | The shell layout takes it; the page keeps a defensive check | A (recorded default) | not pinned by a golden yet |
| Q-084 | admin | Should `/api/admin` distinguish "counts failed" from "nothing open"? | Both legs degrade to 0 with a 200; the failure is logged | The badges are chrome and no client reads the field | A (recorded default) | `admin.http.db.test.ts › degrades a failing count leg to 0 instead of 500ing the badges` |
| Q-085 | admin | Rename the global `admin` role (e.g. "Instance Admin") in CONTEXT.md? | One spelling for two concepts (global role, membership role) | Docs-only at the next CONTEXT.md pass; no code change | A (recorded default) | not pinned by a golden yet |
| Q-087 | familyHub | Keep Recent Activity crediting the assignee (else creator)? | The assignee (else creator) is named, not whoever completed | No `completedBy` column; adding one is DDL, not rewrite work | A (recorded default) | not pinned by a golden yet |
| Q-088 | familyHub | Keep pending handoffs out of Recent Activity? | Only `accepted` handoffs are read | Adding a third kind is wire-visible on `GET /api/families/{id}` and needs Android | A (recorded default) | not pinned by a golden yet |
| Q-089 | familyHub | Keep a missing plan limit rendering as `0`? | `?? 0` for every limit, so the rail can read "3 of 0" | `null`/"—" is a wire change on the same payload | A (recorded default) | not pinned by a golden yet |
| Q-090 | familyHub | Keep both doors to `/family/invitations`? | Admin card plus rail link | The approved page has both | A (recorded default) | not pinned by a golden yet |
| Q-095 | dayDashboard | Keep the full `userTasks` rows that no card renders? | Every own and family Task with all columns | Phone parity; shrinking a documented field is a wire change | A (recorded default) | `dayDashboard.http.db.test.ts › returns the full contract for a family day, resolved, in the viewer zone` |
| Q-096 | dayDashboard | Add a `groceries` warning label, or keep the failed read invisible? | The leg degrades to empty lists and the card says "Nothing on the list yet." | A card that cannot load says nothing; a label is a wire change | A (recorded default) | `dayDashboard.http.db.test.ts › skips the reads no visible module needs, and still answers 200` |
| Q-100 | calendarPage | Keep `?edit=` failing with "Event not found" outside the loaded window? | The deep link finds rows in the month window or the fetch cache only | A one-Event read is a wire addition needing its own ticket | A (recorded default) | not pinned by a golden yet |
| — (answered, no id) | shell | Backport the `passwordHash`/`receiptIngestToken`/phonenumber leak fix to legacy before cutover? | `(calendar)/calendar/+layout.server.ts:17` serialises the whole `users` row to the browser on every app page | **Not a default: the owner chose the hotfix** — issue #324, branch `hotfix/user-page-data`, commit `be915320`; v2 fixes it in shell's port too | hotfix #324 | not pinned by a golden yet |
