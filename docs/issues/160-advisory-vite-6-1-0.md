# 160 — Advisory: vite 6.1.0 — twelve dev-server advisories, in range, dev-only exposure

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 14/15 — high-severity advisories but confined to the dev server process; production is Vercel build output with no vite running.

## Done

- Installed 6.1.0 (package-lock; devDep range `^6.0.0`). `npm audit` flags `vite` high, range `<=6.4.2` (current 6.x tail: 6.4.4; vite 8.3.3 is latest line). Notable: GHSA-p9ff-h696-f583 arbitrary file read via dev-server WebSocket, GHSA-4w7w-66w2-5vf9 path traversal in optimized-deps `.map`, several `server.fs.deny` bypasses, GHSA-v6wh-96g9-6wx3 Windows NTLM hash disclosure via launch-editor — all require the **dev server** to be running and attacker-reachable.
- Exposure class: `npm run dev` on a hostile/shared network (e.g. `--host` on untrusted Wi-Fi). Vercel prod deployments never run vite — builds execute at deploy time in CI, serving only static/SSR output.
- Same-family: `@sveltejs/vite-plugin-svelte@5.0.3` not separately flagged; `postcss@8.5.3` high (XSS via `</style>` stringify, sourcemap file read) also build-time-only — see issue 161.

## Needs doing

- Option A — `npm i -D vite@6.4.4` (same major, all twelve fixed). Cost: near-zero; smoke `npm run dev` + `npm run build`.
- Option B — accept: dev-only, dev machines are single-user. Cost: dev-server file-read stays available to anyone who can reach the dev port; `npm audit` noise persists.
- Not choosing (issue 136).
