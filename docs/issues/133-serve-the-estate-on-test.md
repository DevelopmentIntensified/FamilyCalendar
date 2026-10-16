# 133 - Serve the prototype estate on the test environment

Status: done

**History [pre-2026-10-15, superseded — see Off-test section below]:** `scripts/publish-prototypes.mjs` copies `prototypes/` -> `static/prototypes/` (clean-first, `feedback/` excluded, gitignored), wired as `npm run build` first step. Gate: skips when `VERCEL_ENV=production` (override `PUBLISH_PROTOTYPES=0/1`).

## Done 2026-10-15 — verified live on test.familyplanz.com (deploy d825325)

- Tree index 200 (`/prototypes/`); app-ui hub 200 (`/prototypes/app-ui/`); models leaf 200 with the new `adConsentRecords` row (`/prototypes/app-ui/models.html` — deploy lag noted: first probe showed the pre-fix copy, re-probe after ~2 min carried the row).
- Brand set 200 (`/prototypes/brand-ui/`); `feedback/` 404 (machine-local, never published).
- Marketing `/` unaffected (page shell only, no prototype chrome).
- [Superseded — all deploys now skip, not just production]: Production gate stands: `VERCEL_ENV=production` skips publish (owner call to change).

## Off test 2026-10-15 — prototypes approved, estate pulled

- Owner approved all prototypes wholesale. Publish gate cut to local-only (`VERCEL_ENV` set → skip + clean; `PUBLISH_PROTOTYPES=1` forces on): no deploy serves `/prototypes/...` any more. Verified: local run publishes 57 files, `VERCEL_ENV=preview` run skips and removes output, `npm run build` green.
- Live 2026-10-15 (deploy eb12daa): `/prototypes/` 404s, `/` unaffected. #134 closed moot (no marking round will run).

**Original ticket below:**

**What to build:** The owner cannot review prototypes in the deployed
environment. They exist only on one developer's machine, at a local collector
port. Make them reachable at `test.familyplanz.com/prototypes/...` so review can happen against a URL anyone can open.

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
