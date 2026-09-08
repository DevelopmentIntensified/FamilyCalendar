# 040 — Console TypeError on calendar load (`reportAllChanges` / `startTime`)

Status: in-progress

## Done

- Ruled OUT our code: `reportAllChanges` appears nowhere in `src/`
  (components, utils, workers) and nowhere in bundled deps
  (svelte, luxon, date-picker-svelte, full node_modules grep empty).
- Ruled OUT injected scripts: `src/app.html` loads no third-party
  `<script>`; no `eval`/`new Function` in `src/` outside comments.
- `VM1054` = Chrome label for eval'd or extension-injected scripts, not
  for our Vite chunks (those show real filenames). `reportAllChanges` +
  `n.timeout` matches a DOM-watching browser extension, and `startTime`
  smells like a calendar/meeting/time-tracking extension reading our
  calendar DOM.

## Needs doing

- Confirm with reporter: browser + extension list? Repro in incognito
  (extensions off) or another browser? Which view (month/week/day)?
  Rendering broken or console noise only? Local dev or test/prod URL?
- If it repros extension-free: capture full stack with source maps
  (dev build, unminified) and re-triage — the minified frames map to
  nothing we ship.
