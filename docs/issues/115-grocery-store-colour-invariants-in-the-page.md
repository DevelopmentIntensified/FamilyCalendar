# 115 — Grocery Store colour: the invariants live in the page, not the interface

Status: open

Source: architecture review, 2026-09-30, candidate #7.

**Blocked by:** None. Smallest of the nine.

## The finding

Twelve exports for one page plus one dashboard card. The problem is not the
count — it is that **three different key conventions coexist**:

| Layer | Keys on |
|---|---|
| groups | `label.toLowerCase()` |
| colour resolution | the label **as written** |
| DB rows | the trimmed `storeKey` |

The page converts between them **by hand**. Nothing in the interface says which
convention a function wants, so the conversion is spread across the call sites
where it can be forgotten.

## Possible real bug — flagged, not confirmed

The optimistic override map is keyed by store **alone**, but `colourFor`
resolves **personal-then-family**. Set a personal colour, then a family colour
for the same Store in one session, and **the personal override is overwritten.**

**Reproduce this before acting on it.** It may be correct by accident, or the
override map may already be scope-keyed somewhere this review did not read.

## Needs doing

- [ ] **Repro the personal-then-family overwrite first.** Write it down here
      whatever the answer is. A confirmed bug is a ticket; an unconfirmed one is
      a note.
- [ ] One key convention, stated in the interface, used by all three layers.
- [ ] Grouping and colour resolution are **one concept** the page currently
      assembles from four calls. Grouping + colour is the deepening; key
      normalisation is the means.
- [ ] `GroceriesCard.svelte:33-35` is pure pass-through — either it earns its
      place or the call goes direct.
- [ ] The store *name* is the hash input, and collisions are **permitted and
      disclosed**, never prevented. That was a deliberate decision (096). Any
      change must preserve it, including the disclosure.

## The deletion test

Deleting the pure helpers makes the page re-implement key normalisation,
precedence, name-hashing and collision disclosure — that **concentrates**. The
helpers are deep. The *seam* between them and the page is not.

## Done

## Notes

- `src/lib/data/groceries.ts:167` is a **third copy** of the charCode-sum hash.
  `contactColors.ts:22` is byte-identical, so the comment claiming reuse is
  wrong; `avatarColor.ts:14` is a third variant. Extract one `hashName()`. Small,
  mechanical, worth doing while the file is open.
- Personal-over-family precedence is a domain rule. `CONTEXT.md` should state it
  once rather than leaving it to a code comment.
