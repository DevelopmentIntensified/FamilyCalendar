# 040 — Console TypeError on calendar load (`reportAllChanges` / `startTime`)

Status: blocked — awaiting reporter

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
- Re-verified 2026-09-29 (triage pass): still zero hits for
  `reportAllChanges` in `src/`, still zero in `node_modules/svelte` and
  `node_modules/luxon`. The rule-out holds; nothing in the repo changed.

## Needs doing

This is a reporter-information ticket. There is no code to change and no
code change should be attempted until the reporter answers.

- **Ask the reporter (in this order — first three are decisive):**
  1. Does it reproduce in a **private/incognito window with all extensions
     disabled**, and in a **different browser** (Firefox, Edge, a phone)?
     If it vanishes extension-free, this is closed as extension-caused.
  2. **Full extension list** with versions (the ad blockers, privacy tools,
     and calendar/meeting extensions are the suspects).
  3. Which **view** (month / week / day), and is anything **visually
     broken** or is it **console noise only**? (Console-noise-only is the
     expected shape of an extension artefact.)
  4. Which **URL** — `test.familyplanz.com`, prod, or local dev?
  5. Screenshot of the DevTools console (collapsed frames expanded, so the
     `VM1054` frames and the calling frame are both visible).
- **What evidence would revive it as a real bug:** the same
  `reportAllChanges` TypeError on a machine with **no extensions installed**
  and a browser that is not Chromium-based, OR a stack whose frames resolve
  to real filenames from our own build (not `VM1054`/`at n.…`).
- **If it does revive:** re-triage against a **dev build with source maps,
  unminified** (`npm run dev`). The minified frames in the original report
  map to nothing we ship, which is exactly why the label matters.
- **Do not** add a defensive shim, a global `reportAllChanges`, or a
  try/catch around calendar mount on the strength of this report — there is
  no code path in `src/` that can throw this.
