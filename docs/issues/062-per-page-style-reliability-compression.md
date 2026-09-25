# 062 — Per-page style reliability + compression

Status: open

## Needs doing

- User report: styles intermittently fail to load. Fix the reliability root
  cause.
- Compress scope: styles should be per-page — each page ships only the CSS it
  uses, small and fast-loading (no cross-page dead weight).
- Verify: every page's CSS bundle drops unused rules or reported as already
  clean; no flash-of-unstyled on served pages.

## Done

- (blocked by nothing, but queue it after #060 per triage order)
