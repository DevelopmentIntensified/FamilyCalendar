# 133 - Serve the prototype estate on the test environment

Status: done

**Done (local, uncommitted):** `scripts/publish-prototypes.mjs` copies
`prototypes/` -> `static/prototypes/` (clean-first, `feedback/` excluded,
gitignored), wired as `npm run build` first step. Gate: skips when
`VERCEL_ENV=production` (override `PUBLISH_PROTOTYPES=0/1`).
Verified over HTTP against build output: tree index, all 8 pages + refs,
`brand-ui/` 200; `feedback/`, deleted prototype, `/__feedback` 404.
`brand:check` green; `proto:check` unchanged (4 green / 1 red / 3 skipped);
`npm run build` green.

**Needs doing:** orchestrator commit + push to `test`, then confirm live
status codes on test.familyplanz.com (build-output proof only so far);
flip to `done`, roll up `docs/STATUS.md`.

## Done 2026-10-15 — verified live on test.familyplanz.com (deploy d825325)

- Tree index 200 (`/prototypes/`); app-ui hub 200 (`/prototypes/app-ui/`); models leaf 200 with the new `adConsentRecords` row (`/prototypes/app-ui/models.html` — deploy lag noted: first probe showed the pre-fix copy, re-probe after ~2 min carried the row).
- Brand set 200 (`/prototypes/brand-ui/`); `feedback/` 404 (machine-local, never published).
- Marketing `/` unaffected (page shell only, no prototype chrome).
- Production gate stands: `VERCEL_ENV=production` skips publish (owner call to change).

**Original ticket below:**

**What to build:** The owner cannot review prototypes in the deployed
environment. They exist only on one developer's machine, at a local collector
port. Make them reachable at `test.familyplanz.com/prototypes/...` so review can
**Status:** done

Everything else in the review programme depends on this: the owner cannot mark up
a page they cannot load.

**Blocked by:** 132 (the indexes must be correct before they are served).

- [x] A prototype page resolves over HTTP on the test environment
- [x] The tree index and a leaf page both load, with working relative links
- [x] The brand prototype directory still loads - its rasters are referenced
- [x] The machine-local feedback output is **not** published; deployed pages say
      plainly that the collector is not running rather than pretending a save worked
- [x] The published copy is generated at build time and is gitignored - the source
      of truth stays the prototype tree, never the copy
- [x] The marketing pages' own domain is unaffected

**Note:** the estate is small enough to publish whole (single-digit megabytes).
Decide deliberately whether it also ships to production; internal design
artefacts on a customer-facing domain is an owner's call, and the default here is
to publish on the preview environment only.
