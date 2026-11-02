# 257 — Bug reports record /report-bug as the URL

Status: done

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/report-bug/+page.server.ts` uses POST referer (always /report-bug).

## Repro

Bug on /calendar/tasks -> admin shows 'at …/report-bug'.

## Done

- New `src/lib/utils/reportBug.ts`: `reportBugHref(path)` builds `/report-bug?from=<path>`; `safeReportedPath(raw, origin)` keeps same-origin paths only (rejects other origins, `//`, `/\`, non-paths, the bug form itself; caps 500 chars).
- `Navbar.svelte` passes `reportBugHref` (current pathname+search) to `NavbarProfileMenu` / `NavbarMobileMenu`.
- `report-bug/+page.server.ts`: load returns `from` (`?from=` else GET referer, which client nav sets to the originating page — covers AccountSidebar/error-page links too); action stores hidden `from` (else referer) instead of the always-/report-bug POST referer.
- `report-bug/+page.svelte`: hidden `from` input, keeps first non-empty value across post-submit reloads.
- Red-green: `src/lib/utils/reportBug.test.ts` (table), `src/routes/report-bug/page.server.test.ts` (action stores `from`, off-site rejected, load ?from + referer fallback), hidden input test in `page.svelte.test.ts`, Navbar link test.

## Needs doing

(none)
