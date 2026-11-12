# 0010. Every page has a load budget

Status: accepted (owner directive, 2026-11-11)

## Context

The owner's goal for the rewrite: the app is lighter on desktop and mobile, and every page loads in under 1 s, preferably in 300 ms or less, on a decent PC and connection.

Nothing measures page speed today. The one page that was measured (#041, the calendar) started at about 1.35 s TTFB with 465 KB of HTML. The fixes that followed are written up in [page-perf-playbook.md](../guides/page-perf-playbook.md). Without a check on every page, a rebuild can quietly bring those costs back.

## Decision

1. The page catalog (K-10) lists every page with a seeded user and a **ready selector**: the element whose appearance means the page is usable.
2. `npm run perf:check -- <module>` (K-11) loads each of the module's pages from a local production build (`build:safe` plus preview, local Postgres, seeded data) in two profiles. It records:
   - **ready time**: from navigation start until the ready selector is visible;
   - LCP, TTFB, and transferred bytes (initial JS gzip, HTML, page data).
3. Profiles:
   - desktop: 1280×800, no CPU throttle, 50 Mbps down / 20 ms RTT;
   - mobile: Pixel 7, 4× CPU slowdown, 12 Mbps down / 50 ms RTT.
4. Budgets:

   | check | target | fails above |
   |---|---|---|
   | desktop ready, repeat visit (cached assets) | 300 ms | 1000 ms |
   | desktop ready, first visit (empty cache) | 500 ms | 1000 ms |
   | mobile ready, repeat visit | 600 ms | 1000 ms |
   | server TTFB (local DB) | 100 ms | 300 ms |
   | initial JS per page (gzip) | 100 KB | the page's recorded legacy baseline (it may only shrink) |

5. K-11 measures the legacy baseline for every page and commits it (`docs/rewrite/perf-baseline.md`).
6. A module's S7 is done only when its pages pass `perf:check`. A page that misses a target records the reason in its module sheet. Going over a hard limit needs the owner's approval.

## Consequences

- Performance rules join the conventions ([conventions.md › Performance](../architecture/conventions.md#performance)): a small, fixed number of queries per load; bounded queries; layout-shared scope; streaming for slow sections; heavy views loaded on demand; no server libraries in client bundles.
- Local numbers leave out real network and Neon latency. They catch what the code controls. Production monitoring is a separate owner decision.
- `perf:check` needs a production build (~70 s) and Playwright, so it runs at S7, not after every edit.
