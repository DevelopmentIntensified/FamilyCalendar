# MEMORY.md — working state

Repo: `C:\Users\MIRP\development\familyCalendar`. Branch `test`. Last push: `2ce04ac`.

## The one rule that governs everything

**An approval is a specification, not a comparison.** Build what the approved
artefact shows, for look *and* function. "The app is already better" is never a
reason to change nothing. The owner has stated this repeatedly and overruled agents
who hedged it.

**Never decide alone.** A genuine fork goes to the owner as two options with
costs. Irreversible DDL always asks. This applies to subagents too — an agent that
invents a third option instead of stopping has failed, even if its code is good.

Where the app has capability the prototype cannot show (loading, empty, error,
authz), **keep it** — the prototype is silent, and silence is not instruction to
delete.

## Owner decisions made 2026-10-03/04

| Question | Decision |
|---|---|
| 640–767px tap behaviour | **Day sheet opens at every width.** Prototype E's "tap → day view" is rejected everywhere; E is followed everywhere else. → #145 |
| `userAdConsent` table | **Drop it.** 0 rows / 239 users, not in `schema.ts`, irreversible — explicitly instructed. → #144 |
| Stats page | **Fix the numbers, keep the page.** Count from `taskCompletions`. → #146 |
| `models.html` / `logo.html` | models.html **kept as a reference**, not approved. logo.html **deleted** (mark came from icon.html). |
| Task chips (`Mine`) | **Keep labels, fix the lie.** `Mine` = assigned-to-me (per prototype's own line 167); mislabelled column → `Created by me`. Applied and green. |

## Prototype estate — pruned 2026-10-04

**24 page prototypes deleted** (17 incorporated, 7 rejected/superseded), plus
`logo.html`. All were git-tracked, so recoverable. Survivors: root `index.html`,
`app-ui/{index,models}.html`, `brand-ui/**`.

**`brand-ui/**` must survive** — `scripts/build-brand-rasters.mjs` renders
`static/brand/` from `prototypes/brand-ui/marks.js`. Deleting it breaks the build.

**`calendar-ui/` kept** (18 engine/checker files, no pages) — ~40 references
including `brand-ui/theme.html` and `marks.js`. Removing it is a wide refactor, not
a slice. Deliberately deferred; flag to owner.

`tree-check.mjs` enforced "rejected variants must stay on disk — the losers are the
record". **Owner overruled this**; the check now states version control is the
record. Also replaced: a hardcoded 20-link floor → derived from disk.

`app-check.mjs` §7 tested the deleted `account.html`; retired with a note pointing
at the app's own section registry, which covers the behaviour more strongly.

## Programme: spec #130, tickets #131–#146

Spec: `docs/issues/130-the-gate-to-master-audit-marks-and-a-definition-of-done.md`
(60 user stories). Tickets 131–143 from the task graph, 144–146 from owner decisions.

**Cannot close in one PR.** #134 (owner's marks → tickets) and #143 (promotion
sign-off) require the owner. #137–141 depend on findings #135/#136 haven't produced.

### Frontier (unblocked)
- **#131** design-conformance harness — the one new seam
- **#132** close the estate — *mostly done, verifying*
- **#136** security audit (read-only) → tickets
- **#144** drop `userAdConsent` — needs Neon, both branches, verify after
- **#145** day sheet at all widths
- **#146** stats count real completions

### Blocked
#133 → #132 · #134 → #133 · #135 → #131 · #137 → #131,#135 · #138/#139/#141 →
#137,#135 · #140 → #137,#135,#129 · #142 → #136 · #143 → almost everything

## Also open
- **#129** settings page look: rail is one bordered box w/ 8px rows; prototype
  draws a column of 20px cards, 15rem @ 1000px not 16rem @ 1024px.
- Notification settings **built and green** (4 toggles, persists, sibling JSON key
  in `notificationMethods`, legacy `{email,sms}` rows survive). Known gap: the
  network round-trip under `use:enhance` isn't covered by vitest.
- Pre-existing `proto:check` red: `adConsentRecords` in schema.ts but unmodelled.
  Ties to #144.

## Verified state at last check
Full suite **238 files / 3,490 tests / 0 failures** · `npm run build` exit 0 ·
`npm run brand:check` green · tree-check green.

## Environment gotchas
- Build needs `NODE_OPTIONS=--max-old-space-size=4096` (OOM-killed without it).
- Builds race on `.svelte-kit/output` when run concurrently — `ENOENT`/`ENOTEMPTY`
  are not code failures.
- e2e fails all 14 family specs if `familycalendar-db` container is down
  (`ECONNREFUSED 127.0.0.1:5433`). Start it first or the failure is phantom.
- A `npm run preview` without `.env.local` points at a different database and fails
  every auth e2e spec with a redirect to `/login`.
- `Select-String -Path src/**/*.ts` does **not** recurse. Use `git grep` — it has
  lied about dead code repeatedly this session.
- Neon project `hidden-resonance-16080139`: `main` = `br-holy-salad-a50xupa6`,
  preview/test = `br-misty-butterfly-a5mpnuxu`.

## Unrelated, do not touch
Deliberately uncommitted, not mine (09-29): `film/`, `docs/plans/group-chat-video.md`,
four `docs/research/calendar-sync-*.md`, `.gitignore`'s `/film/out/`.

## My recurring failure
Asserting from a guessed name instead of reading the code. Cost real time three
times: claimed `memberSearch` was dead (3 callers), claimed the app "never had a
rail", claimed notification settings were "blocked on DDL" when the prototype named
the exact column and no migration was needed. **Read the code.**
