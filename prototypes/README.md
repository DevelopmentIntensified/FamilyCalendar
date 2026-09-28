# Prototypes

Every prototype in the FamilyPlanz repo, in one tree.

**Start here:** <http://127.0.0.1:4180/> — the root serves the tree.

---

## Run it

```powershell
node "$env:USERPROFILE\.agents\skills\prototype\assets\feedback\collector.mjs" `
     --root "$PWD\prototypes" `
     --port 4180
```

**`--root` must be `prototypes`, not a subdirectory.** Rooted anywhere else, `/` serves one
set's hub and the other set is invisible — which is exactly how the tree went missing
once already. The tree links siblings with `../`, so it only resolves from this root.

| Port | Root | Serves |
|---|---|---|
| **4180** | `prototypes/` | the tree — **use this one** |
| ~~4179~~ | `prototypes/calendar-ui/` | retired; it hid the app set |

**Serve over HTTP, not `file://`.** Every page is an ES module and modules are blocked on
`file://` — the pages render blank with no console error pointing at the cause.

## The tree

`index.html`, three views over the same estate:

- **Lineup** — the tree itself: two sets, 21 prototypes, each with the real route it came
  from and the question it exists to answer
- **Lineage** — how D was built from the round-1 review, and why the losers stayed on disk
- **Files** — what is actually on disk, what each file is for

The tree is **checked, not trusted**: `tree-check.mjs` fails if it lists a file that is not
on disk, or if a file on disk is missing from it. A tree that lies is worse than no tree.

## The two sets

| | | |
|---|---|---|
| [`calendar-ui/`](calendar-ui/) | the grid page — baseline, three variants, one synthesis | [hub](calendar-ui/index.html) |
| [`app-ui/`](app-ui/) | every other route, plus a browsable read of the data model | [hub](app-ui/index.html) |

Both share one feedback store, so a review on the calendar and a review on the dashboard
land in the same list. The dock's **All prototypes** item goes to the tree from any page.

## The review system

A prototype is not done when it renders. It is reviewed, the review has an
outcome, and the outcome either graduates to a ticket or supersedes the page.
That chain is the system; this section is how to run it.

**Three states, and one of them is a lie detector.**

| state | meaning |
|---|---|
| `unreviewed` | no marks exist. It has never been looked at. |
| `reviewed` + `approved` | looked at, no bad marks. **Port it to the app.** |
| `reviewed` + `changes-requested` | looked at, bad marks that are not rebuilds. |
| `reviewed` + `to rebuild` | looked at, at least one mark flagged **redo**. |

The record lives in [`review.json`](review.json) — one entry per page, and the
tree renders it. `review-check.mjs` proves that record against two things that
cannot be talked into agreeing:

1. **the directory** — a registered page must exist, and an unregistered page
   fails the check. There is no prototype that is invisible to the system.
2. **the collector's own record in `feedback/`** — a page cannot be called
   `reviewed` without marks behind it, cannot be called `approved` while a bad
   mark exists, cannot be called `to rebuild` without a redo flag, and cannot
   declare itself closed while a round is still open.

That last one matters. **Closure belongs to the collector, not the registry.**
Close the round with the tool, then the registry follows:

```powershell
node "$env:USERPROFILE\.agents\skills\prototype\assets\feedback\read.mjs" `
     --dir prototypes --rounds
node "$env:USERPROFILE\.agents\skills\prototype\assets\feedback\read.mjs" `
     --dir prototypes --close <round-id> --outcome done
```

Flipping `closed: true` in `review.json` by hand is the one thing the check
will refuse.

**Current state:** 21 pages · 9 reviewed (3 approved, 2 changes requested,
4 to rebuild) · 12 unreviewed. All 9 rounds still open.

### For the next prototype

The workflow, so a new page arrives reviewable rather than orphaned:

1. **State the question** in the page's `#fb-page` block, with the real route
   it came from and the thesis it argues. A page with no question cannot be
   reviewed against anything.
2. **Register it as `unreviewed`** in `review.json` — one line. Do this in the
   same commit as the page, or `review-check.mjs` fails the build and says
   which page you forgot.
3. **List it in the set's hub** so the set's own check sees it too.
4. **Review it** through the dock. Bad marks auto-tick *redo*; that list is
   the rebuild queue.
5. **Resolve the outcome**: an approved page gets a ticket and is ported to
   the app; a rebuild page gets a new page, and the old one records
   `supersededBy`. The losers stay on disk — a review produces a synthesis,
   not a patch.
6. **Close the round**, then update `review.json` to match, then run
   `review-check.mjs`.

### Why the state is not in the page

Each page carries its own `#fb-page` identity, so a review state there would
need twenty-one edits and would drift the moment a mark is made. The registry
is one file, and it is checked against the disk and the feedback — the same
rule the rest of the tree lives by. **A tree that lies is worse than no tree**,
and so is a review board that lies.

## Check it

```powershell
node prototypes/tree-check.mjs      # does the tree match the disk?
node prototypes/serve-check.mjs     # does every page actually serve and run? (needs the server up)
node prototypes/review-check.mjs    # is every prototype's review state the truth?
node prototypes/app-ui/app-check.mjs
foreach ($t in 'smoke','lint','nav-check','feedback-check','drag-check','dock-check','feedback-e2e','rounds-e2e') {
  node "prototypes\calendar-ui\$t.mjs"
}
```

Eleven suites. Every expectation is derived from the repo — the directory, `schema.ts`,
the nav tables in `navItems.ts` — so they fail when the prototypes drift rather than when
someone remembers to update a list.

`serve-check.mjs` is the one that answers "can I actually reach all of this from the
browser": it walks every link in the tree over HTTP, resolves each page's assets, inlines
the module graph transitively (page → engine → data), and asserts nothing renders empty.

## The review tool

There is no toolbar at the bottom of the page. There is one 36px **dock** in the corner.

1. Click it (or `M`) → **Review** · **Switch prototype** · **All prototypes**
2. **Select elements** (`F`), hover, click, verdict
3. Bad auto-ticks *redo* — that is the rebuild queue
4. `Esc` closes, the dock drags anywhere, `New round` keeps the history

Notes live in `localStorage` under `proto-fb:v1`, keyed on the **path** so the two sets'
`index.html` never merge. The collector mirrors them to `feedback/` as JSON.

## Ground rules

1. **Every prototype keeps the whole feature set.** A prototype that drops a control to make
   a layout argument is not a prototype, it is a lie about the layout.
2. **Every variant is one engine plus its own chrome.** `proto-shell.js` renders the view;
   the page file is only the frame. The baseline is the exception — it is standalone
   because it reproduces the shipped page rather than a prototype of it.
3. **Every prototype states its question** in `#fb-page`, and the review is measured
   against that question rather than against taste.
4. **A review produces a synthesis, not a patch.** The losers stay on disk as the record
   of the argument.
5. **Feedback is per prototype and never erased.** Rounds accumulate; a mark that flips
   bad→good is the evidence the fix landed.
6. **The chrome is one collapsed thing, not two bars.** See `calendar-ui/dock-check.mjs`.
7. **Defects in the real app are shown, not smoothed over.** A broken `href` renders
   broken, a parked module renders parked. The prototype is evidence.
