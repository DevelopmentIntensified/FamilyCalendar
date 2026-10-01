# 095 — The icon synthesis should read as a calendar

Status: open

Source: prototype review, `brand-ui/icon.html`, round 1 — 1 mark, flagged for
rebuild.

**Blocked by:** None (can start immediately).

## The finding

The prototype puts three candidate marks side by side at the sizes they ship at
and then a synthesis, and the reviewer's verdict on the synthesis is **"make it
look more like a calendar"** — flagged as a rebuild, not a tweak.

The prototype's own question is the right frame: an icon is judged at 16 pixels
in a browser tab, not at 512 in a brand book. A mark that reads as a calendar at
512 can read as a blob at 16.

## Needs doing

- [ ] Redraw the synthesis so it reads as a calendar at **every** size it ships
      at, not just the large one. Measure it at each.
- [ ] Keep the existing constraint: all three variants are drawn from the same
      paths, so the comparison stays honest. If the synthesis needs different
      geometry, say why and record it.
- [ ] Check what actually ships. The prototype's own route note says the repo's
      `static/icon.svg` is *the off-brand clipboard*. **Verify that** before
      shipping anything — the file may already have been replaced, in which case
      this is a smaller job than it looks, and that is worth knowing before
      drawing.
- [ ] The social-card page declares that **zero** `og` / `twitter` / `canonical`
      tags exist anywhere in the repo. Confirm, and file that separately if it is
      still true — a share card that nothing references is invisible.

## Done

## Notes

- Round is still open in the review tool; closure belongs to the collector.
- The mark is brand surface, not app code: nothing here changes product
  behaviour, so it cannot regress the app's test suite.