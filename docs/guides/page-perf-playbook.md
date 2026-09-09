# Page Perf Playbook — make a page slimmer and feel instant

Repeatable process. Distilled from #041 (calendar: TTFB ~1.35s → shell
~0.8s, HTML 465KB → 147KB). One numbered issue per page; one slice per
commit; every slice measured before/after and pushed green to `test`.

## 0. Setup (once)

- Bench user + stable session: fresh anon via curl jar, long-lived
  session id written into a hand-made cookie file. Reuse the jar for all
  measurements of the slice series.
- Seed realistic data for THAT user (recurring + one-offs + stale rows).
  Know which DB the server reads: raw `process.env.X` uses dotenv `.env`
  ONLY (`.env.local` ignored) — verify with a probe script, never assume.
- Keep the dev server running; allow ~6s reload after server-file changes.
- Clean up: delete temp scripts (`*.tmp.*`), verify `git status` shows
  only intended files. Never seed junk in shared DBs — verify counts.

## 1. Baseline (no code changes)

- `curl -sL -c JAR -b JAR -H "Accept: text/html" URL`, 5–7 runs, warmed
  median TTFB + total + bytes. Record all three.
- Note the load chain shape: count sequential `await` stages and DB
  roundtrips per stage in `+page.server.ts` (+layout chain).
- Note payload drivers: unbounded SELECTs, recurrence expansion windows,
  full-row serialization per occurrence.
- Note client hot paths: per-cell/per-row `.filter()` over full arrays,
  luxon parse/format inside loops, statically imported views/modals.

## 2. Slice order (biggest first, each measured + committed)

1. **Dedupe queries**: layout data via `parent()` (settings, family
   scope); pure derive-helpers (`zoneFromSettings`) with colocated tests
   instead of re-SELECTs. Metric: TTFB + query count.
2. **Bound the data**: visible-range windows (month grid ± pad) for
   expansion + overlap-WHERE on one-off SELECTs; keep legacy default for
   other callers. Watch drizzle `mode:'string'` columns — pass ISO
   strings, never Dates. Metric: HTML bytes + TTFB.
3. **Writes out of the read path**: batch per-row UPDATE loops into one
   `UPDATE...WHERE inArray(ids)`; assert same semantics with existing
   mock-contract tests. Metric: A/B via `git stash` with stale rows
   present (stash → measure → pop, one file only).
4. **Delete remote-in-critical-path**: local list over external fetch;
   update the tests that pinned fallback behavior. Metric: worst-case
   latency killed + lines removed.
5. **Stream**: slow pipelines return unresolved as ONE promise
   (allSettled-style, per-section fallbacks + warnings in payload);
   `{#await}` block form with skeleton pending + retry catch; stash-once
   cache feeding existing reactives so handlers/first-run/deep-links keep
   working. Metric: shell TTFB vs full-body total. Verify rendering in a
   real browser (Playwright): toolbar, views, stream resolve, zero
   page errors. Remember SSR emits pending only — curl HTML never shows
   then-content; assert via browser, not grep.
6. **Share via layout**: family scope / roster / ids load once in
   `+layout.server.ts`; pages map locally from `parent()`. Metric:
   page-only `__data.json?x-sveltekit-invalidated=…` A/B + query math.
   Check no consumer reads `data.pathname`-style stale layout fields.
7. **Group, don't scan**: one-pass `Map<key, rows>` (tested util) shared
   by cells/rows instead of per-unit `.filter()`. Metric: honest
   micro-bench WITH the real key cost (luxon format, not string `===`).
8. **Componentize**: extract toolbar/panels/rows into tested components;
   pure logic into tested utils; keep markup + behavior identical
   (document preserved quirks, e.g. picker close rules). Metric: lines +
   browser verification of every view/state.
9. **Gate session-costly client effects**: once-per-user-per-browser flags
   for probe-POST-then-`invalidateAll` patterns. Metric: Playwright
   request counts across two visits (block the endpoint to simulate the
   stuck case).

## 3. Per-slice gates (no exceptions)

- Red-green where a seam exists (new util/component → colocated test).
- `oxlint` + `prettier --check` on touched files (repo anti-slop rules:
  `satisfies` over `Record`, `SAFETY:` comments, no `as` without cause).
- Existing suites covering touched areas stay green.
- `npm run build` before push; push each slice to `test` immediately.
- Issue file: append result line under Done with numbers; STATUS.md rollup.

## 4. Honesty rules

- Report warmed medians, not best runs; report flat/noise results as flat.
- A/B with `git stash` (single file) when the win needs stale/loaded
  state; always `stash pop` back and verify `git status`.
- Payload bytes and query counts are results too when time is noise.
- Never claim browser-rendered content from curl HTML.
