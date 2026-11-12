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

Context: `blobService` is public, unmetered and unsniffed. The security audit asked for "harden or delete" before anything wires it further.

Options:
A. Delete the blob code during the sponsored port; ads serve without blob assets. Cost: re-adding it later.
B. Port it behind a `blob` port, private and size-capped. Cost: extra work in M-sponsored.

Default applied: none. **M-sponsored is blocked on this answer.**

Answer:

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
