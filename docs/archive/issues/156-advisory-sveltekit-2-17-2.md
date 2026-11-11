# 156 — Advisory: @sveltejs/kit 2.17.2 — six in-range advisories, one reachable

Status: done

Source: security audit (issue 136), 2026-10-06. Rank 10/15 — first advisory ticket: the reachable one is an unauthenticated production DoS.

## Done

- **Upgraded to @sveltejs/kit@2.70.3** (Option A): all six in-range advisories fixed, incl. the reachable Accept-header ReDoS (GHSA-29g2-3rmr-qm68).
- One kit-2.70 fallout fixed: the `sequence()` hook helper now resolves through an ALS request store that only exists inside a real server — `src/hooks.server.ts` composes `securityHeaders → apiOriginCheck → sessionHandle` manually instead (identical order; hooks.server.test.ts + bearer suites green).
- `adapter-vercel` floated 5.6.3→5.10.3 with the bump and **broke the Windows build gate** (5.10.3 symlinks function outputs; EPERM without Developer Mode) — pinned back to 5.6.3 (no advisory on it; Linux/Vercel builds unaffected either way).
- Gates: full suite 249 files / 3598 tests green, svelte-check 39 err (≤44 baseline), build green.

## Done

- Installed 2.17.2 (package-lock; range `^2.16.0`). `npm audit` flags `@sveltejs/kit` high, overall range `<=2.70.3`. Latest 2.x = 2.70.3; latest line = 3.0.1. Per-advisory reachability:
  - **GHSA-29g2-3rmr-qm68** — ReDoS O(n^2) in content negotiation via `Accept` header, unauthenticated. Fixed >2.70.1 → **2.17.2 affected, REACHABLE**: every request parses Accept on the Vercel function. Impact: per-instance CPU burn.
  - GHSA-6q87-84jw-cjhp (CVE-2025-32388) XSS via tracked search-param names — fixed 2.20.6 → in range, **not reachable**: requires iterating all `searchParams` in a server load; grep found iteration only in a test file (`api/family/member-search/server.test.ts:22`); app code only does fixed `.get(key)`.
  - GHSA-3f6h-2hrp-w5wx unvalidated redirect — in range, **not reachable**: all 58 `redirect(` sites audited are constant/self-built targets, no user input.
  - GHSA-2crg-3p73-43xp adapter-node BODY_SIZE_LIMIT — **N/A**: app wires adapter-vercel/static only (`svelte.config.js:14-20`); adapter-node is an unwired devDep.
  - GHSA-866w-xmhq-wj7x + GHSA-wqjv-9729-c5q2 remote-function prototype pollution / payload crash — **N/A**: no remote functions used (grep `from '$app/remote'` — zero).

## Needs doing

- Option A — upgrade to `@sveltejs/kit@2.70.3` (all six fixed, stays on 2.x). Cost: ~2 years of minor releases in one jump; run `npm test` + Playwright + deploy to test branch and watch it.
- Option B — stay on 2.17.2, mitigate only the ReDoS (normalise/strip `Accept` in a hook before `resolve`, or Vercel WAF rule). Cost: five advisories remain in range, permanent version drift, hook mitigation is ours to maintain.
- Not choosing (issue 136).
