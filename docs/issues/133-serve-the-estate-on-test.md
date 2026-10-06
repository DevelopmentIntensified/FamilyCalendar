# 133 - Serve the prototype estate on the test environment

Status: in-progress

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

**Original ticket below:**

**What to build:** The owner cannot review prototypes in the deployed
environment. They exist only on one developer's machine, at a local collector
port. Make them reachable at `test.familyplanz.com/prototypes/...` so review can
happen against a URL anyone can open.

Everything else in the review programme depends on this: the owner cannot mark up
a page they cannot load.

**Blocked by:** 132 (the indexes must be correct before they are served).

**Status:** open

- [ ] A prototype page resolves over HTTP on the test environment
- [ ] The tree index and a leaf page both load, with working relative links
- [ ] The brand prototype directory still loads - its rasters are referenced
- [ ] The machine-local feedback output is **not** published; deployed pages say
      plainly that the collector is not running rather than pretending a save worked
- [ ] The published copy is generated at build time and is gitignored - the source
      of truth stays the prototype tree, never the copy
- [ ] The marketing pages' own domain is unaffected

**Note:** the estate is small enough to publish whole (single-digit megabytes).
Decide deliberately whether it also ships to production; internal design
artefacts on a customer-facing domain is an owner's call, and the default here is
to publish on the preview environment only.
