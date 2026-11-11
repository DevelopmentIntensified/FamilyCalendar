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

Default applied: **A**.

Answer:

## Q-002 Parked modules: port or delete (plan, 2026-11-11)

Context: `meals` (owner-parked) and `bills` (archived to `_attic/money`) still have code, tables and one endpoint (`/api/meals`).

Options:
A. Port as-is: tables and vocabulary for bills; the endpoint and card for meals. Cost: about 400 LOC carried along.
B. Delete the meals endpoint and card; keep only the tables. Cost: removes a parked feature (reversible from git).

Default applied: **A**.

Answer:

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

## Q-005 `GET /api/tasks` serves private and unassigned Family Tasks to every member (plan, 2026-11-11)

Context: `POST /api/tasks` with `familyId` absent stores the Task under the caller's family, whatever its `visibility` (`src/routes/api/tasks/+server.ts:142-166`). `GET /api/tasks` returns `userId = me OR familyId = myFamily` with no visibility or assignment filter (`src/lib/server/db/actions/tasks/queries.ts:27-30,66`). Only the `?eventId=` branch drops other people's private rows (`+server.ts:72`). Result: a member's private Task created through the API without `familyId: null` reaches every family member's phone. It also breaks CONTEXT's rule that a Family Task "appears on an individual's list only when assigned to them". This is live on `test` and `main`, not only in the rewrite. Whether any such rows exist in production is unchecked.

Options:
A. Fix it on `test` now as a normal ticket: filter `GET /api/tasks` to the CONTEXT rules (own rows, live assignments, Family Tasks assigned to me, no private rows of others). The rewrite picks it up through [sync-with-test.md](playbooks/sync-with-test.md). Cost: Android lists change shape (fewer rows); check the phone's Family tab, which may rely on the extra rows.
B. Keep the wire through the port and fix after cutover. Cost: the leak stays open meanwhile.

Recommendation: **A** (privacy). Default applied: none. M-tasks keeps today's behaviour in its S2 goldens until answered.

Answer:
