# 209 — Remove Capacitor web wrap

Status: done

Owner call 2026-10-27: go straight native for Android (#210); the Capacitor
webview wrap is dead weight. `@capacitor/*` also carried install-time advisory
chains (#157) — removing the wrap retires that residual rebuild step too.

## Done

- Deps out: `@capacitor/{android,ios,cli,core,geolocation}` + `@sveltejs/adapter-static`
  (only consumer was the capacitor branch of `svelte.config.js`).
- Out: `capacitor.config.ts`, `scripts/build-capacitor.mjs`,
  `build:capacitor` / `cap:add` / `cap:sync` / `cap:open:android` scripts.
- `svelte.config.js`: `CAPACITOR_BUILD` static-adapter branch gone —
  adapter-vercel is the only build path.
- README stack line points at `apps/android/` native app instead of the wrap.
- `npm run build` green post-cut (vite 49s, adapter-vercel, ssr-render check
  137/137). Audit-note `_attic/` references untouched (dead code, historical).
- Historical records (`docs/issues/157`, archive plans, spec snapshots) left
  as-is — they document what happened, not the current tree.

## Needs doing

- none
