# App prototypes — `prototypes/app-ui/`

Every route in the FamilyPlanz app that is **not** the calendar, re-skinned into the marketing
design language while keeping the structure of the real route it came from.

The calendar set lives next door in [`../calendar-ui/`](../calendar-ui/). Both sets share one
`proto.css` copy, one feedback overlay, and one notes store.

---

## Run it

```powershell
node "C:\Users\MIRP\.agents\skills\prototype\assets\feedback\collector.mjs" `
     --root "C:\Users\MIRP\development\familyCalendar\prototypes" `
     --port 4180
```

Then open <http://127.0.0.1:4180/app-ui/>.

**Serve over HTTP, not `file://`.** Every page is an ES module, and modules are blocked on
`file://` — the pages render blank with no error in the console that points at the cause.

## Check it

```powershell
node prototypes/app-ui/app-check.mjs
```

Eight sections, all of which derive their expectations from the repo rather than from a
hardcoded list, so they fail when the prototypes drift:

| § | Checks |
|---|---|
| 1 | Every page loads the shell, the overlay and a valid `#fb-page` identity |
| 2 | Every page actually renders — jsdom, the real module body, the shell mounted |
| 3 | Every internal link resolves to a page that exists |
| 4 | The nav reproduces the real nav, **including the divergence** |
| 5 | The model matches `schema.ts` — same tables, no dupes, none invented |
| 6 | The hub lists every built page and no page that does not exist |
| 7 | `account.html`'s hash sections have ids the nav can reach |
| 8 | The feedback store keys on the path, so both `index.html` pages stay separate |
| 9 | Every page loads the dock, and the shared assets have not drifted |

The calendar set has its own eight suites; run them the same way:

```powershell
foreach ($t in 'smoke','lint','nav-check','feedback-check','drag-check','dock-check','feedback-e2e','rounds-e2e') {
  node "prototypes\calendar-ui\$t.mjs"
}
node prototypes/tree-check.mjs
```

---

## The pages

| Page | Real route | What it is arguing |
|---|---|---|
| `index.html` | — | The hub: every page, the audit findings, how to review |
| `dashboard.html` | `calendar/dashboard/` | Is a day read useful, or just eight cards competing? |
| `tasks.html` | `calendar/tasks/` | Can 20–150 items stay scannable? Is the inbox separate enough? |
| `groceries.html` | `calendar/groceries/` | Group by store or by aisle? |
| `family.html` | `family/` | A list of families, or a people page? |
| `family-detail.html` | `family/[familyId]/` | 793 lines. What is this page's one job? |
| `family-tasks.html` | `family/tasks/` | By assignee beats by due date? |
| `family-members-add.html` | `family/[familyId]/members/add` | One form or three? |
| `family-invitations.html` | `family/invitations` | Is a join code the right mechanism, and is it findable? |
| `family-create.html` | `family/create` | A real thing, or an account step? |
| `notifications.html` | `calendar/notifications/` | Do five types need telling apart? |
| `stats.html` | `calendar/stats/` | Does the history earn a page? |
| `archive.html` | `calendar/archive/` | Does anyone come back here? |
| `event.html` | `calendar/event/[id]/` | Is the RSVP list worth a page? |
| `import.html` | `calendar/import/` | Power feature or migration crutch? |
| `account.html` | `account/` | Seven hash sections — one page or seven? |
| `models.html` | `lib/server/db/schema.ts` | 39 tables: which are real, which are dead? |

## What these are not

Static mocks of real routes. The data is shaped like the schema and the copy comes from the
loaders, but nothing is wired to a database and the interactions are stubbed. They exist to
argue about layout, hierarchy and language — not to prove a feature works.

**Where a page has a real defect, the defect is reproduced rather than smoothed over.** The
broken `href` is shown broken, the parked Meals module is shown parked, and the two navs
disagree because the real ones do.

---

## Files

| File | Role |
|---|---|
| `proto.css` | Design tokens copied from the marketing pages |
| `app-shell.js` | Navbar, bottom nav, page header, toast — one chrome, many pages |
| `app-data.js` | Mock data + the 39-table model, derived from `schema.ts` |
| `app-check.mjs` | The eight check sections above |
| `feedback.js` / `feedback.css` / `drag.js` / `dock.js` | The review overlay, the drag helper and the collapsed launcher |
| `app-check.mjs` | The nine check sections above |

`proto.css` and the overlay files are **copies** of the shared assets rather than
symlinks, so each set runs independently. §9 of the checker fails if any of
`feedback.js`, `drag.js` or `dock.js` has drifted from the skill asset — if you see that
failure, re-copy:

```powershell
Copy-Item "$env:USERPROFILE\.agents\skills\prototype\assets\feedback\*" `
          "prototypes\app-ui\" -Force
```

---

## Reviewing

There is no toolbar sitting at the bottom of the page. There is one 36px **dock** in the
corner; everything lives behind it.

1. **Click the dock** (or press `M`). The menu offers **Review**, **Switch prototype** and
   **All prototypes**. The badge is how many marks are on this page.
2. **Review** opens the toolbar, **Switch prototype** opens the switcher. One at a time.
3. **Drag the dock** anywhere — the panels follow it, because the dock is the only thing
   that moves. Double-click resets its position.
4. **Hover to highlight, click to pin.** Alt+click pins the parent; shift+click adds a
   second pin at the same spot.
5. **Mark it good, bad, or an idea.** Bad auto-ticks *redo* — that is the rebuild queue.
6. **Hit "New round" when you are done.** Notes carry into the next round, so nothing is
   lost.
7. **Esc** closes the menu, then the panel.

Notes are per page but share one store across both prototype sets; the List panel can show
all of them at once.

Agent side:

```powershell
node "C:\Users\MIRP\.agents\skills\prototype\assets\feedback\read.mjs" --dir prototypes
node "C:\Users\MIRP\.agents\skills\prototype\assets\feedback\read.mjs" --dir prototypes --rounds
node "C:\Users\MIRP\.agents\skills\prototype\assets\feedback\read.mjs" --dir prototypes --close <id> --outcome done
```

---

## Findings

The audit that drove these pages turned up ten issues. The full list with detail is on the
hub (`index.html`); the ones worth acting on first:

- **Family detail 404s on "Manage invitations"** — it points at
  `/family/{id}/invitations`, and no such route exists. The braces are not
  the cause; Svelte interpolates an attribute value like that. Every admin
  who clicks it gets a 404.
- **The changelog advertises a dead feature** — "Scan receipts" and "Mark bills paid" are
  still public while the entire money subsystem (38 files) sits in `_attic/`.
- **Meals is half-wired and still has a switch** — the table, the API and the card all exist,
  but no loader reads meals, and `/account` still shows a toggle that switches nothing.
- **Groceries is unreachable on mobile** — the top nav has Groceries and no Notifications; the
  bottom nav has Alerts and no Groceries.
- **18 base tables have no migration** — created via `drizzle-kit push`, so a fresh database
  cannot be built from the migration runner alone.
