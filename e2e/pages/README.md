# Page harness (K-10)

Screenshots every page route at two widths, and is the page-loading base the
perf harness (K-11) builds on. One catalog, one seed per page shape, one
throwaway database, one committed baseline per module.

The playbook is [kernel-tasks.md · k-10](../../docs/rewrite/playbooks/kernel-tasks.md#k-10);
this file explains how the pieces fit and how to run them.

## Files

| file | what | why | how it is tested |
|---|---|---|---|
| `catalog.ts` | Every page route from `npm run census` (42 of them: `scripts/arch/legacy-map.json`, kind `route`, file `+page.svelte`), grouped by module. Each entry is `{ module, name, path, seed, ready, mask? }`. Also `pagesForModule()` (the `PAGES_MODULE` filter) and `resolvePath()` (fills `[param]` fill-ins). | One list is the whole definition of "every page". Adding a route means adding a row here, and the visual run, the perf run and the `--list` count all follow. | `npx playwright test -c playwright.pages.config.ts --list` lists every entry once per project (42 × 2). An unknown `PAGES_MODULE` fails the run instead of silently testing nothing. |
| `seeds.ts` | One seed per page shape: the user, the rows the page reads, and the values a dynamic route needs (`{ email?, params?, cookies? }`). Plain drizzle inserts through `$lib/kernel/db/tables.server`; no legacy service is called. | A page is only comparable when it has real data. Seeds also pin every clock: dates are relative to today in `America/New_York`, and relative timestamps are seeded days in the past. | Every page test runs its seed through `session.ts`; the page's `ready` selector then proves the data reached the page. |
| `session.ts` | `openAs(page, seedName)`: runs the seed, attaches the session cookie from `getSessionCookie` (`e2e/testUtils.ts`), plus any cookie the page itself reads, and returns the seed result. | Signing in the way the app does (a real `authSession` row + the signed cookie) keeps the harness honest: no auth bypass in the server. | Exercised by every page test; a broken cookie shows up as a redirect to `/login` and a missing `ready` selector. |
| `serve.ts` | The pages server, run with `npx tsx`. Drops and recreates `familycalendar_pages` on `127.0.0.1:5433`, then starts `vite preview --port 4174` on the existing build with `DATABASE_URL` pointing at that database and migrations **enabled**. Exports the database URL, port and session key the config and tests share. | A real preview of the real build is the only thing worth screenshotting. Migrations run the production way — `src/hooks.server.ts` calls the kernel `runMigrations` at cold start. Step 4 of the playbook applied them here instead; that cannot work under plain `tsx`, because `bundledMigrations.server.ts` imports SQL through Vite `?raw`. | Playwright's `webServer`: the run does not start until `http://localhost:4174` answers. `globalSetup` then waits for the schema. |
| `globalSetup.ts` | Requests `baseURL` once (so the server loads its hooks), then polls `select count(*) from "__schema_migrations"` until it equals the number of `sql/migrations/*.sql` files (60 s timeout; the error names both counts). | The cold-start migration run is asynchronous and off the request path; a seed that wins the race would insert into tables that do not exist yet. | Runs before every test in the project; a missing migration fails the whole run with both counts in the message. |
| `visual.spec.ts` | For each catalog page of `PAGES_MODULE` (all pages when unset): `openAs`, `goto`, wait for `ready`, then `toHaveScreenshot` with masks, animations disabled and `maxDiffPixelRatio: 0.01`. | The check itself: one test per page per project, named `<module> / <name>`. | This is the test. `npm run visual:check -- <module>`. |
| `README.md` | This file. | The harness is not discoverable from the app code, so the file list and the same-day rule live beside it. | Reviewed by hand; `npm run docs:check` keeps its links resolving. |
| `__screenshots__/<project>/<module>-<name>.png` | The committed baselines, one directory per project (`desktop`, `mobile`). | The point of the harness: a rebuild is compared against the approved look, not against a memory of it. | Written by `npm run visual:baseline`, compared by `npm run visual:check`. |

Outside this folder: `playwright.pages.config.ts` (repo root) is the config —
its own `testDir`, its own server, its own baselines — and
`scripts/pages-run.mjs` is the two-line runner behind the npm scripts.

## Running it

```bash
npm run pages:build                    # npm run build:safe — needed before any run
npm run visual:baseline -- groceries   # write the groceries baselines
npm run visual:check -- groceries      # compare them
```

`visual:baseline` and `visual:check` take the module argument after `--`; the
runner sets `PAGES_MODULE` and calls
`npx playwright test -c playwright.pages.config.ts e2e/pages/visual.spec.ts`
(plus `--update-snapshots` for a baseline). To run every page, call the spec
directly without `PAGES_MODULE`:

```bash
npx playwright test -c playwright.pages.config.ts
```

**Baseline and check must run on the same day.** Pages show today's date, and
"today" moves at midnight (America/New_York for the seeded users). If more time
passes, recreate the baseline from the module's S2 commit in a temporary
worktree rather than accepting a shifted one.

## What the shots hide

Seeds pin every clock-derived value a page can show: dates are relative to
`DateTime.now()` in the user's zone, relative timestamps are seeded days in the
past, and the calendar opens in month view (no now-line, no hour auto-scroll).
That is why no catalog entry currently sets `mask`: there is nothing left that
changes on its own. The field stays in the shape — `visual.spec.ts` applies it
— for a page that reintroduces a live clock.

## Two deliberate departures from the playbook

Both exist because the page would otherwise be unreachable or incomparable; the
route list and the rest of the harness are exactly as specified.

1. **Identity is fixed per seed, not random per run.** Users get a stable
   address (`visual+<seed>-<suffix>@example.invalid`) and stable row ids
   (`pageId()`), and each seed deletes its own previous rows first. The account
   rail, the family roster and every avatar colour hash the user id
   (`kernel/ui` `colorHash`), so a random id or address would change pixels the
   harness cannot mask, and a committed baseline could never match on the next
   run. "Fresh" comes from the delete: every run starts from one user, not two.
2. **`resolvePath` fills `[token]` in the query, not in a path segment.** The
   invited-by-email page (`/family/invite/email?token=…`) validates a signed
   JWT from the query string, so the seed mints one with the placeholder
   `EMAILSECRET` that `npm run build:safe` bakes into `$env/static/private`, and
   the template carries the placeholder where the token actually travels.
   Seeds also return `cookies` for the one page that reads a cookie of its own
   (the guest-merge stash), which `openAs` attaches next to the session cookie.
