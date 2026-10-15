# 132 - Close the prototype estate

Status: done

**What to build:** The prototype tree currently holds three loose ends created by
the removal of 24 superseded and incorporated page prototypes. Finish it so the
estate is coherent and its own tooling tells the truth.

- The root index is 645 lines of prose walking the history of designs that no
  longer exist, including live links to a deleted page. Replace it with a short
  index of what remains and why.
- The app-ui index lists eighteen deleted files. Prune it to what survives.
- The review registry still carries entries for deleted files. Remove them, so no
  entry names a file that is not there.
- `logo.html` is deleted - the mark was taken from `icon.html`, so the logo page
  was a duplicate record.
- `models.html` is marked reviewed and kept deliberately as a data-model reference.

**Blocked by:** None (can start immediately).

## Done 2026-10-15

- Root + app-ui indexes list only surviving files, zero dead links (EstateCloser slice + owner follow-ups).
- Registry: 5 entries, all resolve; `logo.html` absent, `models.html` kept-note present.
- Owner ruling executed: `d-working-calendar.html` killed outright (was already off disk in 9c2c741) — live refs pruned from `proto-nav.js`, `feedback-check.mjs` PAGES, `app-check.mjs` key map, calendar README (pages table now marks all deleted variants as git-history).
- Checkers repaired to policy: `app-check.mjs` §8/§9 retooled from skill-asset byte-equality to cross-set parity (estate `feedback.js` deliberately newer — click-stages-a-mark flow); `models.html`/`app-data.js` gained the `adConsentRecords` row (schema now 40 tables).
- `npm run proto:check` **5 green · 0 red · 3 skipped** (collector-dependent); `brand:check` green after `brand:build` (needed `npx playwright install chromium` — env gap, not code).

**Status:** done

- [ ] Root index lists only surviving files, no dead links
- [ ] App-ui index lists only surviving files
- [ ] Registry contains no entry for a missing file
- [ ] `npm run proto:check` passes
- [ ] `npm run brand:check` passes - the build renders app rasters from the brand
      prototype directory, so that directory must survive untouched

**Note:** `brand-ui/**` is retained because `scripts/build-brand-rasters.mjs`
renders `static/brand/` from `prototypes/brand-ui/marks.js`. Deleting it breaks
the build and the brand assets the app serves.
