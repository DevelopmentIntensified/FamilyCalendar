# 132 - Close the prototype estate

Status: open

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

**Status:** open

- [ ] Root index lists only surviving files, no dead links
- [ ] App-ui index lists only surviving files
- [ ] Registry contains no entry for a missing file
- [ ] `npm run proto:check` passes
- [ ] `npm run brand:check` passes - the build renders app rasters from the brand
      prototype directory, so that directory must survive untouched

**Note:** `brand-ui/**` is retained because `scripts/build-brand-rasters.mjs`
renders `static/brand/` from `prototypes/brand-ui/marks.js`. Deleting it breaks
the build and the brand assets the app serves.
