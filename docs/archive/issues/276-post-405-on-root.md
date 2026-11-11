# 276 — POST to / returns 405 (no form actions)

Status: done

Source: user bug-report export 2026-11-02 (website, prod www.familyplanz.com — `main` was at 0fbcc93).

## Evidence

[auto-filed 405] "POST method not allowed. No form actions exist for this page" on / (2026-10-30). Some form posts to / without an action (e.g. a marketing or nav form with method=post and no action, or a stale logout form).

## Done

- Re-swept on `test` (cb888bd): every `<form>` in `src/` either has an
  explicit action, posts to its own route, or is JS-only (`preventDefault`);
  nav logout targets `/api/logout` (302 → GET `/`); no `fetch('/')`, no
  `formaction`, no 307/308 to `/`, no `reroute`, share_target is GET
  `/calendar`, the SW only intercepts POST `/api/logout`. The landing page
  has no form and (Vercel adapter) is client-rendered. Same verdict as
  #023/#059: no in-app form targets `/`. Since #153 only signed-in callers
  (incl. Anonymous Accounts) auto-file, so the sender held a session cookie
  — a browser/extension/cookie-keeping bot, not the cookieless webhook.
- Fix: `src/routes/(marketing)/+page.server.ts` adds a `default` action that
  answers a stray POST `/` with Post/Redirect/Get (`303 → /`) instead of the
  405 error page + auto-filed bug, and `console.warn`s referer, user-agent
  and content-type so the sender is findable in Vercel logs (addresses
  #023's "don't mask it" concern and #060's "capture request context").
- Red → green: `src/routes/(marketing)/page.server.test.ts` (303 → `/`;
  warn carries referer/UA/content-type) failed with "Cannot find module
  './+page.server'", passes after.
- Caveat: `(marketing)/+layout.server.ts` sets `prerender = ADAPTER ===
  'static'`; SvelteKit refuses to prerender pages with actions, so a
  static-adapter build would need this action guarded. `svelte.config.js`
  hard-codes adapter-vercel, so that mode is currently dead.
