# Page harness (K-10)

Screenshots every page route at two widths, and is the page-loading base the
perf harness (K-11) builds on. One catalog, one seed per page shape, one
throwaway database, one baseline per module (generated locally — see the
platform note below).

The playbook is [kernel-tasks.md · k-10](../../docs/rewrite/playbooks/kernel-tasks.md#k-10);
this file explains how the pieces fit and how to run them.

## Files

| file | what | why | how it is tested |
|---|---|---|---|
| `catalog.ts` | Every page route from `npm run census` (42 of them: `scripts/arch/legacy-map.json`, kind `route`, file `+page.svelte`), grouped by module. Each entry is `{ module, name, path, landsOn?, seed, ready, mask? }`; `landsOn` is where a redirecting route ends up (`/share-target` → `/calendar`). Also `pagesForModule()` (the `PAGES_MODULE` filter) and `resolvePath()` (fills `[param]` fill-ins). | One list is the whole definition of "every page". Adding a route means adding a row here, and the visual run, the perf run and the `--list` count all follow. | `npx playwright test -c playwright.pages.config.ts --list` lists every entry once per project (42 × 2). An unknown `PAGES_MODULE` fails the run instead of silently testing nothing. |
| `seeds.ts` | One seed per page shape: the user, the rows the page reads, and the values a dynamic route needs (`{ email?, params?, cookies? }`). Plain drizzle inserts through `$lib/kernel/db/tables.server`; no legacy service is called. | A page is only comparable when it has real data. Seeds also pin every clock-derived *state*: dates are relative to today in `America/New_York`, open items due today sit at 23:59 (they never turn overdue during the day), explicit overdue examples sit on earlier days, and relative timestamps are whole days in the past. | Every page test runs its seed through `session.ts`; the page's `ready` selector then proves the data reached the page. `dashboardUser` exists so the day dashboard's cards render populated (family + groceries), not an empty band. |
| `session.ts` | `openAs(page, seedName)`: runs the seed, signs in with `loginWithSession` from `e2e/testUtils.ts` (the same `authSession` row + signed cookie the app issues), attaches any cookie the page itself reads, and returns the seed result. `gotoReady(page, entry, seed)`: navigates, waits for `ready`, asserts the landing path (`landsOn` when the route redirects) and asserts `GET /api/me` returns the seed's identity. | Signing in the way the app does keeps the harness honest: no auth bypass in the server. The identity check is the part that matters: a broken cookie does **not** redirect a protected route to `/login` — `hooks.server.ts:84-93` creates an anonymous user instead — so a redirect check alone would happily screenshot a guest. | Exercised by every page test: a missing session fails on the `/api/me` email, a missing `ready` selector fails the wait, and a wrong landing fails the path assertion. |
| `env.ts` | The constants the config, server, seeds and tests must agree on: database name and URLs (`127.0.0.1:5433`), port/base URL (`http://localhost:4174`) and the session key. Also `withLoopbackNoProxy()`. Imports nothing — no spawn, no postgres — so K-11 can import it without starting a server. | One value, one place: a port or database name drifting between config, server and tests would make the harness fail in a misleading way. | Read by `playwright.pages.config.ts`, `serve.ts` and `globalSetup.ts`; any mismatch shows up as a refused connection or an invalid session. |
| `serve.ts` | The pages server, run with `npx tsx`. Drops and recreates `familycalendar_pages` on `127.0.0.1:5433`, then starts `vite preview --port 4174` on the existing build with `DATABASE_URL` pointing at it and migrations **enabled**. Pins the preview's `TZ` to `UTC` (production parity, independent of the host). Warns — never fails — when the recorded build HEAD differs from the current HEAD. | A real preview of the real build is the only thing worth screenshotting. Migrations run the production way — `src/hooks.server.ts` calls the kernel `runMigrations` at cold start. Step 4 of the playbook applied them here instead; that cannot work under plain `tsx`, because `bundledMigrations.server.ts` imports SQL through Vite `?raw`. | Playwright's `webServer`: the run does not start until `http://localhost:4174` answers. `globalSetup.ts` then proves the schema landed. |
| `globalSetup.ts` | Requests `baseURL` once (so the server loads its hooks), then polls `select count(*) from "__schema_migrations"` until it equals the number of `sql/migrations/*.sql` files (60 s timeout; the error names both counts). | The cold-start migration run is asynchronous and off the request path; a seed that wins the race would insert into tables that do not exist yet. | Runs before every test in the project; a missing migration fails the whole run with both counts in the message. |
| `visual.spec.ts` | For each catalog page of `PAGES_MODULE` (all pages when unset): `openAs`, `gotoReady`, `waitForLoadState('networkidle')`, then `toHaveScreenshot` with masks, animations disabled and `maxDiffPixelRatio: 0.01`. `afterAll` ends the session pool so the worker can exit. | The check itself: one test per page per project, named `<module> / <name>`. Idle is awaited here and only here — K-11 times the arrival and must not wait for it. | This is the test. `npm run visual:check -- <module>`. |
| `README.md` | This file. | The harness is not discoverable from the app code, so the file list and the same-day rule live beside it. | Reviewed by hand; `npm run docs:check` also checks its links (D3 covers `e2e/**/README.md`). |
| `__screenshots__/<project>/<module>-<name>.png` | The baselines, one directory per project (`desktop`, `mobile`). | The point of the harness: a rebuild is compared against the approved look, not against a memory of it. **Platform-specific**: the snapshot template has no `{platform}`, and font rasterisation differs, so a baseline written on Windows only matches on Windows. Generate them locally; do not share baselines across machines or CI. | Written by `npm run visual:baseline`, compared by `npm run visual:check`. |

Outside this folder: `playwright.pages.config.ts` (repo root) is the config —
its own `testDir`, its own server, its own baselines; it pins
`timezoneId: 'America/New_York'` and `locale: 'en-US'` so the browser does not
inherit the host's, and adds loopback to `NO_PROXY` so a host proxy cannot break
Playwright's port probe. `scripts/pages-run.mjs` is the runner behind the npm
scripts.

Paths are resolved from the **repo root**, never from the cwd or from
Playwright's `rootDir`: `rootDir` is the resolved `testDir` (`e2e/pages`), so
`globalSetup.ts` and `serve.ts` climb two levels with
`fileURLToPath(new URL('../../', import.meta.url))`, and the runner passes
`cwd: <repo root>` (one level up from `scripts/`) to Playwright. Anything that
opens `sql/migrations`, `.svelte-kit/output` or the build stamp must do the same.

## Running it

```bash
npm run pages:build                    # npm run build:safe + records git HEAD
npm run visual:baseline -- groceries   # write the groceries baselines
npm run visual:check -- groceries      # compare them
```

`pages:build` writes `git rev-parse HEAD` to `.svelte-kit/pages-build-head`,
next to `.svelte-kit/output`; `serve.ts` warns when the build is older than the
checkout (it previews code that no longer exists at HEAD — rebuild, do not
accept the warning).

`visual:baseline` and `visual:check` take the module argument after `--`; the
runner sets `PAGES_MODULE` and calls
`npx playwright test -c playwright.pages.config.ts e2e/pages/visual.spec.ts`
(plus `--update-snapshots` for a baseline). To run every page, call the spec
directly without `PAGES_MODULE`:

```bash
npx playwright test -c playwright.pages.config.ts
```

**Baseline and check must run on the same day.** Seeds freeze clock-derived
*states*, not the calendar: pages still print today's date, and "today" moves at
midnight (America/New_York for the seeded users, whatever the host's zone). If
more time passes, recreate the baseline from the module's S2 commit in a
temporary worktree rather than accepting a shifted one.

## What the shots hide

Seeds pin every clock-derived state a page can show: dates are relative to
`DateTime.now()` in the user's zone, open items due today sit at 23:59 (so they
never flip to overdue as the day runs — `MonthDayCell.svelte:245-247` compares
with the exact current time), the explicit overdue examples sit on earlier days,
relative timestamps are whole days in the past, and the calendar opens in month
view (no now-line, no hour auto-scroll). That is why no catalog entry currently
sets `mask`. The field stays in the shape — `visual.spec.ts` applies it — for a
page that reintroduces a live clock. "Nothing changes on its own" is true within
one day, not across midnight: the date itself still moves, hence the same-day
rule above.

## Playbook notes

Two notes on the implementation, worth knowing before editing a seed; the
second is a departure from the playbook (the route list and the rest of the
harness are exactly as specified).

1. **Identity is fixed per seed, not random per run** (the playbook's step 2
   says the same). Users get a stable address
   (`visual+<seed>-<suffix>@example.invalid`) and stable row ids (`pageId()`).
   Freshness comes from two deletes: deleting the seed user cascades every row
   that hangs off it, and the rows of a table that does not cascade
   (`bugReports` is `onDelete: 'set null'`; `unmatchedPhrases` has no user FK)
   are deleted by primary key — the same ids the seed is about to insert. The
   account rail, the family roster and every avatar colour hash the user id
   (`kernel/ui` `colorHash`), so a random id or address would change pixels the
   harness cannot mask, and a committed baseline could never match on the next
   run. Every run starts from one user, not two.
2. **`resolvePath` fills `[token]` in the query, not in a path segment.** The
   invited-by-email page (`/family/invite/email?token=…`) validates a signed
   JWT from the query string, so the seed mints one with the placeholder
   `EMAILSECRET` that `npm run build:safe` bakes into `$env/static/private`, and
   the template carries the placeholder where the token actually travels.
   Seeds also return `cookies` for the one page that reads a cookie of its own
   (the guest-merge stash), which `openAs` attaches next to the session cookie.

`ready` is the data-dependent signal, not the page shell: the dashboard waits
for `[data-testid="dashboard-card-band"]` (the `h1` renders above its streaming
`{#await}`), the family page for a roster row, and `/share-target` for the Quick
Add field in the modal the redirect opens (the legacy modal exposes no
`data-testid`, so `#nl-input` is the stable hook).
