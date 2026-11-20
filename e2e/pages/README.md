# Page harness (K-10) and perf check (K-11)

Screenshots every page route at two widths, and measures how long each one
takes to become usable. One catalog, one seed per page shape, one throwaway
database, two measurements (look and speed) over the same `ready` selector.

The playbook is [kernel-tasks.md · k-10](../../docs/rewrite/playbooks/kernel-tasks.md#k-10)
and [k-11](../../docs/rewrite/playbooks/kernel-tasks.md#k-11); the budgets are
[ADR 0010](../../docs/adr/0010-performance-budget.md). This file explains how
the pieces fit and how to run them.

## Files

| file | what | why | how it is tested |
|---|---|---|---|
| `catalog.ts` | Every page route from `npm run census` (42 of them: `scripts/arch/legacy-map.json`, kind `route`, file `+page.svelte`), grouped by module. Each entry is `{ module, name, path, landsOn?, seed, ready, mask? }`; `landsOn` is where a redirecting route ends up (`/share-target` → `/calendar`). Also `pagesForModule()` (the `PAGES_MODULE` filter) and `resolvePath()` (fills `[param]` fill-ins). `ready` must be a plain CSS selector: the perf probe matches it with `document.querySelector`, so a Playwright-only selector (`:has-text()`) would never mark. | One list is the whole definition of "every page". Adding a route means adding a row here, and the visual run, the perf run and the `--list` count all follow. | `npx playwright test -c playwright.pages.config.ts --list` lists every entry once per project (42 × 2). An unknown `PAGES_MODULE` fails the run instead of silently testing nothing. |
| `seeds.ts` | One seed per page shape: the user, the rows the page reads, and the values a dynamic route needs (`{ email?, params?, cookies? }`). Plain drizzle inserts through `$lib/kernel/db/tables.server`; no legacy service is called. | A page is only comparable when it has real data. Seeds also pin every clock-derived *state*: dates are relative to today in `America/New_York`, open items due today sit at 23:59 (they never turn overdue during the day), explicit overdue examples sit on earlier days, and relative timestamps are whole days in the past. | Every page test runs its seed through `session.ts`; the page's `ready` selector then proves the data reached the page. `dashboardUser` exists so the day dashboard's cards render populated (family + groceries), not an empty band. |
| `session.ts` | `openAs(page, seedName)`: runs the seed, signs in with `loginWithSession` from `e2e/testUtils.ts` (the same `authSession` row + signed cookie the app issues), attaches any cookie the page itself reads, and returns the seed result. `gotoPage(page, entry, seed)`: navigates, waits for `ready`, asserts the landing path (`landsOn` when the route redirects). `expectSignedIn(page, entry, seed)`: asserts `GET /api/me` returns the seed's identity. `gotoReady` is both halves — the visual check's shared arrival; the perf run calls them separately so the identity round trip falls outside the measurement. | Signing in the way the app does keeps the harness honest: no auth bypass in the server. The identity check is the part that matters: a broken cookie does **not** redirect a protected route to `/login` — `hooks.server.ts:84-93` creates an anonymous user instead — so a redirect check alone would happily screenshot a guest. | Exercised by every page test: a missing session fails on the `/api/me` email, a missing `ready` selector fails the wait, and a wrong landing fails the path assertion. |
| `env.ts` | The constants the config, server, seeds and tests must agree on: database name and URLs (`127.0.0.1:5433`), port/base URL (`http://localhost:4174`) and the session key. Also `withLoopbackNoProxy()`. Imports nothing — no spawn, no postgres — so K-11 can import it without starting a server. | One value, one place: a port or database name drifting between config, server and tests would make the harness fail in a misleading way. | Read by `playwright.pages.config.ts`, `serve.ts` and `globalSetup.ts`; any mismatch shows up as a refused connection or an invalid session. |
| `serve.ts` | The pages server, run with `npx tsx`. Drops and recreates `familycalendar_pages` on `127.0.0.1:5433`, then starts `vite preview --port 4174` on the existing build with `DATABASE_URL` pointing at it and migrations **enabled**. Pins the preview's `TZ` to `UTC` (production parity, independent of the host). Warns — never fails — when the recorded build HEAD differs from the current HEAD. | A real preview of the real build is the only thing worth screenshotting. Migrations run the production way — `src/hooks.server.ts` calls the kernel `runMigrations` at cold start. Step 4 of the playbook applied them here instead; that cannot work under plain `tsx`, because `bundledMigrations.server.ts` imports SQL through Vite `?raw`. | Playwright's `webServer`: the run does not start until `http://localhost:4174` answers. `globalSetup.ts` then proves the schema landed. |
| `globalSetup.ts` | Requests `baseURL` once (so the server loads its hooks), then polls `select count(*) from "__schema_migrations"` until it equals the number of `sql/migrations/*.sql` files (60 s timeout; the error names both counts). | The cold-start migration run is asynchronous and off the request path; a seed that wins the race would insert into tables that do not exist yet. | Runs before every test in the project; a missing migration fails the whole run with both counts in the message. |
| `visual.spec.ts` | For each catalog page of `PAGES_MODULE` (all pages when unset): `openAs`, `gotoReady`, `waitForLoadState('networkidle')`, then `toHaveScreenshot` with masks, animations disabled and `maxDiffPixelRatio: 0.002`. `afterAll` ends the session pool so the worker can exit. | The check itself: one test per page per project, named `<module> / <name>`. Idle is awaited here and only here — K-11 times the arrival and must not wait for it. | This is the test. `npm run visual:check -- <module>`. |
| `perf.spec.ts` | The check: for each page of `PAGES_MODULE` (all when unset), both profiles, five runs of a first visit in a fresh context plus a repeat visit in it — measured by `perf-measure.ts`. Prints a table per page, merges each page into `perf-results/<module>.json` as soon as it is measured, and fails on the four hard limits — in check mode only. | Measuring inside the page keeps Playwright's IPC and the identity check out of the number; a fresh context is the only honest "empty cache". Writing per page means a later timeout still leaves the pages already measured. Baseline mode does not fail on a hard limit (the legacy pages may already miss them). | This is the test: `npm run perf:check -- <module>` and `npm run perf:baseline`. |
| `perf-measure.ts` | The measuring half: the two profile definitions (and their CDP network/CPU settings), `openStaging` (seed and sign in once, hand the cookies to each fresh context), `measureProfile` (five runs), the in-page ready/LCP probe and the CDP byte counter. Ready is marked from a `requestAnimationFrame` loop only, so it lands on a frame that can paint; LCP is read after two frames and a task via `takeRecords()`. A missing ready mark, LCP entry or navigation timing throws instead of becoming a number. | A first visit needs a fresh context, which the Playwright fixture cannot give; keeping that plumbing out of the spec leaves `perf.spec.ts` a readable loop of measure → print → assert. | Exercised by `perf.spec.ts`; its own logic (`measureProfile`, profiles) has no branch worth a node test. |
| `budgets.ts` | ADR 0010's targets and hard limits, `RUNS` (5), the 2% JS-ceiling tolerance, and the per-page ceiling read from `perf-baseline.json` (`loadBaseline`, `jsCeiling`, `baselineKey`). A missing file, or a page missing from it, means "no ceiling yet", never a failure. | One home for every number the run compares against, and one page-key format. Pure Node — no Playwright, no browser — so the unit test can import it. | `perf-report.unit.ts` pins the constants, the missing-file rule and the baseline round trip into `jsCeiling`. |
| `perf-report.ts` | The decision half: `median` / `medianRun`, `compareBudgets` (the four hard limits), `upsertMeasurement` (the per-page results merge), `formatPageTable`, `baselineFile` and `baselineMarkdown`. No browser, no filesystem. | Keeps `perf.spec.ts` a thin measuring loop: every number rule is testable without a browser, and a formatting change cannot silently change what a run asserts. | `perf-report.unit.ts` (vitest, project `pages`). |
| `perf-report.unit.ts` | Node unit tests for `budgets.ts` and `perf-report.ts`: medians, each hard-limit boundary (including the 2% JS tolerance and desktop-only TTFB), the results merge, the console table, the baseline JSON and markdown, and the baseline → `jsCeiling` round trip. | The pure logic is where perf mistakes hide (an off-by-one limit, an unsorted baseline, a missing ceiling treated as zero). Testing it needs no browser, no database, no build. The `.unit.ts` suffix is deliberate: Playwright's default matcher takes `.spec.ts` and `.test.ts`, so nothing here can join a browser run by accident. | `npx vitest run --project pages` (also picked up by `npm run test:affected`). |
| `perf-baseline.json` | The committed baseline, written by `npm run perf:baseline`: keyed `<module>/<name>` (module and name separately too), every page's full numbers in both profiles (ready, TTFB, LCP first; ready, LCP repeat; JS, HTML, page-data bytes) and the larger profile's initial JS as the ceiling. | ADR 0010 lets a page's initial JS only shrink against its recorded legacy baseline; this file is that record, with the numbers behind it. | Read by `budgets.ts`; a page absent from it simply has no ceiling yet. |
| `perf-results/<module>.json` | Per-run output — medians per page and profile. Gitignored. | The console table scrolls away; this is what a S7 review reads. Never committed: the numbers to keep are `perf-baseline.json` and `perf-baseline.md`. | Merged and written after each page, so a later failure keeps the earlier pages. |
| `README.md` | This file. | The harness is not discoverable from the app code, so the file list and the same-day rule live beside it. | Reviewed by hand; `npm run docs:check` also checks its links (D3 covers `e2e/**/README.md`). |
| `__screenshots__/<project>/<module>-<name>.png` | The baselines, one directory per project (`desktop`, `mobile`). | The point of the harness: a rebuild is compared against the approved look, not against a memory of it. **Platform-specific**: the snapshot template has no `{platform}`, and font rasterisation differs, so a baseline written on Windows only matches on Windows. Generate them locally; do not share baselines across machines or CI. | Written by `npm run visual:baseline`, compared by `npm run visual:check`. |

Outside this folder: `playwright.pages.config.ts` (repo root) is the config —
its own `testDir`, its own server, its own baselines; it pins
`timezoneId: 'America/New_York'` and `locale: 'en-US'` so the browser does not
inherit the host's, and adds loopback to `NO_PROXY` so a host proxy cannot break
Playwright's port probe. Its `desktop`/`mobile` projects ignore `perf.spec.ts`;
the single `perf` project exists only when the runner sets `PERF_MODE`, so a
bare `npx playwright test -c playwright.pages.config.ts` stays visual-only.
`scripts/pages-run.mjs` is the runner behind all four npm scripts
(`visual:baseline`, `visual:check`, `perf:check`, `perf:baseline`).

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
(plus `--update-snapshots=all` for a baseline, so every snapshot is rewritten). To run every page, call the spec
directly without `PAGES_MODULE`:

```bash
npx playwright test -c playwright.pages.config.ts
```

**Baseline and check must run on the same day.** Seeds freeze clock-derived
*states*, not the calendar: pages still print today's date, and "today" moves at
midnight (America/New_York for the seeded users, whatever the host's zone). If
more time passes, recreate the baseline from the module's S2 commit in a
temporary worktree rather than accepting a shifted one.

## Performance (K-11)

```bash
npm run pages:build                # the same preview the visual check uses
npm run perf:baseline             # every page: writes the committed baseline
npm run perf:check -- groceries    # one module: fails on a hard limit
```

Each page is measured in the two ADR 0010 profiles, from the same catalog, the
same seed and the same `ready` selector the screenshot waits for:

| profile | viewport | network (CDP `Network.emulateNetworkConditions`) | CPU |
|---|---|---|---|
| desktop | 1280×800 | 50 Mbps down / 10 up, 20 ms RTT | none |
| mobile | Pixel 7 | 12 Mbps down / 4 up, 50 ms RTT | 4× slowdown (`Emulation.setCPUThrottlingRate`) |

A run is one fresh browser context. The **first visit** records ready time
(navigation start → the `ready` selector visible), TTFB (navigation timing), LCP
(`PerformanceObserver`, read once the page has settled: network idle, then two
animation frames and a task; on the (marketing) pages the first paint lands well
after the load event, so a read at load would miss it) and the
transferred bytes of the initial JS, the HTML and the page data (CDP
`encodedDataLength`). The byte cut-off is one fixed point: everything that
finished by the load event; lazy chunks after it do not count. The **repeat
visit** navigates to `about:blank` and then to the page, so it is an ordinary
navigation (a same-URL `goto` is a reload in Chromium); it sees the HTTP cache
and records ready time and LCP. The service worker never registers on localhost,
so neither visit shows production's service-worker cache.

Five runs per page and profile, and the **median** of each number is what the
run compares and prints: a single slow run (GC, a cold server path, a Windows
update) cannot pass or fail the check by itself. Ready is marked from a
`requestAnimationFrame` loop inside the page — a frame that can actually paint —
and the signed-in check runs after the measurement, so neither Playwright's wait
nor a check lands in the window. `ready` must be a plain CSS selector: the probe
matches it with `document.querySelector`.

TTFB is navigation timing, so it includes the profile's emulated latency and any
redirect hops. The hard limit applies to the **desktop** profile (the ADR row
means server TTFB); mobile TTFB is printed as information, because its 50 ms of
emulated latency is not the server's.

`perf:check` fails on the four hard limits only: desktop ready above 1000 ms
(first or repeat), mobile ready above 1000 ms (repeat), desktop TTFB above
300 ms, and initial JS above the page's recorded ceiling plus 2% (headers and
gzip jitter). The ADR targets (500 ms first / 300 ms repeat desktop, 600 ms
repeat mobile, 100 ms TTFB, 100 KB JS) are printed beside the numbers but do not
fail. `perf:baseline` does not fail on a hard limit: the legacy pages may already
miss them, which is what the rebuilds fix; hard limits apply from each module's
S7. A timeout or any other harness error still fails the run. It writes
`e2e/pages/perf-baseline.json` (every page's numbers in both profiles, plus its
ceiling) and `docs/rewrite/perf-baseline.md` (slowest page first, a target row
per profile), and refuses to write either when a page did not finish, so a
broken run cannot replace a good baseline.

**Measure on an otherwise idle machine.** These are local numbers (`vite
preview` and local Postgres) with no real network or Neon latency: they catch
what the code controls. Anything else using the CPU moves the mobile medians
most, so do not run a build, another test suite or a video call beside a
baseline. `e2e/pages/perf-results/<module>.json` (`all.json` for
`perf:baseline`) is merged after every page, so a later failure keeps the pages
already measured; it is gitignored.

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
