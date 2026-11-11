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
- **#132** close the estate — **done** (landed in `9c2c741`)
- **#133** serve the estate on test — unblocked, not started
- **#136** security audit (read-only) → tickets — unblocked, not started
- **#145** day sheet at every widths — unblocked
- **#146** stats count real completions — unblocked

### Blocked
#134 → #133 · #135 → #131 · #137 → #131,#135 · #138/#139/#141 →
#137,#135 · #140 → #137,#135,#129 · #142 → #136 · #143 → almost everything

### Agents cancelled mid-flight, nothing running
#131, #136, #133 were all dispatched and all cancelled when the session ran out
of context. They produced no work and left no partial files. Re-dispatch them.

## Also open
- **#129** settings page look: rail is one bordered box w/ 8px rows; prototype
  draws a column of 20px cards, 15rem @ 1000px not 16rem @ 1024px.
- Notification settings **built and green** (4 toggles, persists, sibling JSON key
  in `notificationMethods`, legacy `{email,sms}` rows survive). Known gap: the
  network round-trip under `use:enhance` isn't covered by vitest.
- Pre-existing `proto:check` red: `adConsentRecords` in schema.ts but unmodelled,
  `feedback.js` drift ×2.

## ✅ COMMITTED + PUSHED 2026-10-06 — `fda07a0..d93a89a` on `test` (8 commits)

Build exit 0, **242 files / 3,546 tests / 0 failures**, `brand:check` green,
`proto:check` unchanged (4 green · 1 red · 3 skipped). Index clean; working tree
holds ONLY the seven do-not-touch files (`.probe.mts`, `film/`, the four
`docs/research/calendar-sync-*.md`, `docs/plans/group-chat-video.md`).

| commit | slice |
|---|---|
| `0183f39` | groceries `each_key_duplicate` crash |
| `7fdea91` | date-independent NLP test |
| `474fc94` | stats card removed (owner ruling) |
| `16cb748` | #131 conformance harness |
| `6c5d915` | #133 prototype publishing |
| `653fb71` | #136 — 15 security tickets |
| `5506913` | MEMORY.md sync |
| `d93a89a` | ignore `film/out/` |

### Owner rulings this session — all three answered
1. **Stats card** → "That card isn't needed" → removed (see §2).
2. **Geometry reference** → **B: the PROTOTYPE governs geometry.** Marketing
   tokens govern colour/type/shadow; sizes and spacing must come from the
   prototype (`git show 9c2c741^:…account.html`). **NOT YET IMPLEMENTED** — #131
   shipped the marketing-token path only, and its own report flagged geometry as
   inexpressible from marketing. This ruling is what unblocks #129's geometry
   rows (rail 16rem vs 15rem, 1024 vs 1000px grid, avatar). Precedence tie-break
   needed where marketing says `lg:` 1024 and the prototype says 1000.
3. **`film/`** → `/film/out/` added to `.gitignore` (it had never been there —
   the do-not-touch note guarded a non-existent entry while `film/` sat
   untracked AND unignored). Sources stay trackable.

### 1. Live crash: groceries page dies — `each_key_duplicate` — ✅ CODE DONE
Reported live on test: **"Keyed each block has duplicate key `walmart` at indexes
2 and 3"**. The whole page throws, not one row.

- **Cause**: the store field is free text with commas for alternates. Nothing
  deduped it. `{#each item.stores as store, index (store)}` is keyed by the store
  name, so a repeated name is a duplicate key.
- **DONE**: `uniqueStores()` added to `src/lib/data/groceries.ts`
  (case-insensitive, first spelling wins, order preserved because `stores[0]` is
  the row's primary shop) **and wired into all three sites**:
  1. add handler `groceries/+page.svelte:279`
  2. edit handler `:358`
  3. **render `:858`** — `{#each uniqueStores(item.stores) as store, index (store)}`
     This is the one that mattered: fixing only the write path would NOT have
     fixed it, because the crash comes from reading rows already in the database.
- **Tests**: 6 new cases in `src/lib/data/groceries.test.ts`, including the
  literal reported shape `['Aldi','Kroger','walmart','Walmart','Costco']`.
  File total 58 passing.
- Two other key sites were already safe, no change needed: `knownStores` uses a
  `Set`, `groupGroceriesByStore` keys a `Map` on lowercase.
- Dashboard `GroceriesCard.storesOf` routes through `groupGroceriesByStore` too,
  so it was never exposed.
- **Suite green**: 3,524 tests / 240 files, 0 failures (the 1 NLP failure was a
  separate date-pin bug, fixed in the same slice — see §4).
- **✅ PUSHED in `0183f39`.** The first build attempt failed with
  `ENOENT .svelte-kit/output/client` during prerender — the client compiled
  (`✓ built in 7.63s`) then a **concurrent subagent build wiped the output
  dir**. That is the documented race, NOT a code error; it cleared once the
  subagents finished. Final build exit 0.

### 2. Stats card: owner ruled "That card isn't needed" — ✅ REMOVED 2026-10-06
**OWNER DECISION, overrides the approved prototype.** The "The children are in
the numbers" card is GONE from the stats page. Asked A/B/C; owner answered
"That card isn't needed" — i.e. remove the whole card, stronger than option C
(which only dropped paragraphs 2-3).

**Context for whoever revisits this:** the card WAS approved — it is at
`git show 2ce04ac:prototypes/app-ui/stats.html:132-146`, three `argcols` columns
(numbers pill, mechanism paragraph, "So Mia can be assigned… she…" paragraph) in
a blush box (`border-color:#fecaca`, which is literally Tailwind's
`border-red-200`). The port was faithful.

**⚠️ MY WRONG CALL, corrected 2026-10-06:** I told the owner the agent
"substituted a critique for the approved card", and that a bare blush tile would
be "closer to the approval". **Both false.** I grepped the prototype with context
*after* a match, saw only JS, and never read the card body. Read the whole block,
not post-match context.

**Removed in this slice:**
- the `<section data-testid="children-in-the-numbers">` in `stats/+page.svelte`
- the now-dead `paired` and `hasChildren` reactive derivations
- the now-unused `assignedVsDone` import (the MODEL function stays — it has its
  own 14 tests in `statsPageModel.test.ts` and is not mine to delete)
- 3 tests asserting on the card, plus an assertion at
  `page.svelte.test.ts:204` in the empty-history test
- an emptied `describe('… the children are in the numbers')` shell

**Status:** stats + conformance suites green (52 tests), zero leftover references
in `src/` or `e2e/`.

**The underlying finding still stands and still wants a ticket:** a child has no
`passwordHash`, so `taskCompletions.actorId` can never be a child — "done by" is
always 0 for a member who can be assigned work. Removing the card removes the
explanation, not the defect.

### 3. Owner report not yet ticketed
"dashboard page - the sizes of sections is not cohesive." Unmeasured. This is
exactly what **#135** is for; do not eyeball it, take real numbers from a browser.

### 4. NLP test was date-pinned, broke on Oct 6 — ✅ FIXED
`naturalLanguageService.test.ts` — `parses "running today and the 5th of oct at
5pm" with the 5th present exactly once` failed with
`expected [ '2026-10-06', '2027-10-05' ] to include '2026-10-05'`.

- **The parser was RIGHT, the test was wrong.** Its own comment claimed the
  expectation was date-independent, then hardcoded `2026-10-05`. On Oct 6 the 5th
  has passed, and the parser's *pinned* rule is that a day-of-month rolls forward
  once passed (`:1461` "Day-of-month with monthly rollover when it already
  passed"; absolute dates resolving to `2027-` at `:502`, `:512`).
- **Fixed** by asserting the invariant instead of a calendar date:
  `dates.filter((d) => d.slice(5) === '10-05')` has length 1 on ANY run day.
  Passes on the 5th (collides with today, dedupes to one) and after it (rolls to
  next year). Time + title assertions kept.
- Same class of bug as the earlier "running today and the 5th" dedupe fix. When a
  test compares against the clock, compute the expectation from the clock — the
  sibling test at `:1204` already does this with `DateTime.now()`.


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
