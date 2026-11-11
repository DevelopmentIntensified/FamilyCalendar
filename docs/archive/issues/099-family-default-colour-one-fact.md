# 099 — Create a family: the default colour is written down twice

Status: done

Source: residue from `app-ui/family-create.html` — verifying 075 against the
code turned up a conflict 075 does not mention.

**Blocked by:** None (can start immediately).

## Needs doing

- [x] The default family colour is one fact in one place, read by the page's
      swatch state, the create action's fallback, and the prototype's curated
      set. It is currently written out in both the view and the action, and
      the two can drift apart silently.
- [x] When 075 swaps the seventeen-colour grid for the approved curated earthy
      set, the default becomes that set's first entry — and the curated set and
      the default cannot disagree, because they come from the same declaration.
- [x] The create page's end-to-end spec is updated to the new default. It
      currently asserts the old blue, and the test name claims to be about a
      custom colour while asserting only the default.
- [x] A guard fails when a family colour reaches the database that is not in
      the declared palette. A colour is free text in the column, so a crafted
      form post can set anything today.

## Done

### The three claims, verified against the code

1. **075 contradicts itself.** Verified. The prototype's set
   (`prototypes/app-ui/family-create.html:42`) is
   `['#c45e38', '#d38248', '#4d9c85', '#5b9fb5', '#8d7aa8', '#b45309']` — a
   terracotta first. The default 075 said had to hold, `#3B82F6`, was the
   *Blue* swatch of the seventeen-hex grid being replaced, and is not a member
   of the set. Both asks could not be true.
2. **The action hard-codes the default independently of the view.** Verified.
   `+page.server.ts` read `color || '#3B82F6'` while `+page.svelte` read
   `form?.color || '#3B82F6'` — two literals, no shared declaration, and a
   request with no colour field got the action's copy.
3. **The "custom color" e2e asserted only the default.** Verified. It filled
   the name, clicked create, and asserted `#3B82F6` — it never touched a
   swatch, so it proved nothing about a custom colour.

### The decision

**The curated earthy set replaces the old default. It does not join it.**
`#3B82F6` is retired as a default; the new default is the set's first entry,
terracotta `#c45e38`, taken from the same declaration as the swatches. Families
that already exist keep the colour they were given — nothing rewrites a stored
colour, because a family that was created blue has been living with blue
avatars, a blue chip and a blue calendar tint, and silently repainting it would
be a change nobody asked for. Only *new* families get the new default.

`RETIRED_FAMILY_COLOR` is exported purely so a test can assert the blue is
*not* in the palette. Re-adding it fails a test, so the decision gets made on
purpose rather than by accident.

### The one source of truth

`src/lib/utils/familyPalette.ts` — `FAMILY_PALETTE`, `DEFAULT_FAMILY_COLOR`
(defined as `FAMILY_PALETTE[0].value`, not a second literal), `RETIRED_FAMILY_COLOR`
and the `isFamilyColor` guard. Read by the view's swatch state, the action's
fallback, and the action's guard. 13 specs.

### The guard

`+page.server.ts` now refuses a colour that is not in the declared palette with
a 400 before a single insert runs, and names the failure
("Pick one of the offered family colours") rather than swallowing it. An absent
colour is not a failure — it takes the declared default, because a default
that only exists in a browser is a suggestion, not a default. The test is
exact and case-sensitive, so what is stored is always exactly what the page
declared: `'#C45E38'`, `'#c45e38 '`, `'red'` and
`'red; background:url(x)'` are all refused. 9 specs in
`src/routes/(family)/family/create/page.server.test.ts`.

### The e2e

`e2e/family/FamilyCreation.test.ts` now carries **two** colour specs: "Create
family with the default color" (asserts `#c45e38`) and "Create family with
custom color", which clicks the **Sage** swatch and asserts `#4d9c85` in the
`families` row. The second one is a real custom colour now, so the name is
true. (This half landed with 075's pass — both tickets touch the same spec.)

### SQL for the user to run by hand

No migration file, no `drizzle-kit push`. The application guard above is the
real one; this is the belt-and-braces at the column, and it is optional.

```sql
-- 099: pin families.color to the declared palette, at the database.
-- Run in this order; the UPDATE first, or the constraint will not validate.

-- 1. Normalise any family whose colour is not in the palette, and any family
--    with no colour at all (a NULL). Nothing is deleted — the family keeps
--    existing, it just wears the default from now on.
UPDATE "families"
   SET "color" = '#c45e38'
 WHERE "color" IS NULL
    OR "color" NOT IN (
         '#c45e38', '#d38248', '#4d9c85', '#5b9fb5', '#8d7aa8', '#b45309'
       );

-- 2. Add the check, unvalidated, so the ALTER never holds a lock on a rewrite.
ALTER TABLE "families"
  ADD CONSTRAINT "families_color_in_palette"
  CHECK (
    "color" IN (
      '#c45e38', '#d38248', '#4d9c85', '#5b9fb5', '#8d7aa8', '#b45309'
    )
  ) NOT VALID;

-- 3. Now prove it against history.
ALTER TABLE "families" VALIDATE CONSTRAINT "families_color_in_palette";
```

To undo, before step 3:

```sql
ALTER TABLE "families" DROP CONSTRAINT "families_color_in_palette";
```

**Before running this against a test database:** four e2e specs insert families
through the shared `createFamily` action or `db.insert` with a legacy hex and
will trip the check — `e2e/family/MemberRemoval.test.ts:31`,
`MemberSearch.test.ts:57`, `FamilySettings.test.ts:30` (`#3b82f6`) and
`MobileLayout.test.ts:49` (`#22C55E`). They were left alone here because they
are not this ticket's surface; move them onto a palette hex (`#c45e38`) when
you run the DDL, or the family e2e suite fails on the insert rather than on the
thing it means to test. `e2e/events/EventCalendarChange.test.ts` inserts
families with no colour at all — a NULL, which the constraint permits (a CHECK
only fails on FALSE) and which step 1 normalises anyway.

## Notes

- **075 said the default colour "still has to hold", and it could not.** 075
  also asked for the prototype's curated set, whose first entry is an earthy
  terracotta — not the blue the app defaulted to today, and not a member of the
  set being adopted. Those two asks contradict each other. 075 wins on the
  palette; the default moves with it; the spec follows. Said in 075 when it
  landed.
- The action's fallback is what a request with no colour field gets. A default
  that exists only in the browser is not a default — it is a suggestion, and a
  form post without a colour silently gets the other one. That is now impossible:
  the browser's default and the server's fallback are the same line of code.
- 075's other to-dos are unaffected. The usage line it asks for is 098's data,
  and 075's own copy and layout work is independent of this.
- **Flagged, not fixed:** the guard is strict about case on purpose, so a
  browser with a stale cached page holding an older palette would get a 400 on
  create rather than a coerced colour. That was the trade for "what is stored is
  exactly what we declared". If it ever bites in practice, normalise the case
  instead of loosening the membership test.
- The view still uses Svelte 4 syntax (`export let`, `$:`), matching the file it
  replaces and its siblings. `svelte-autofixer` flags it as runes-mode-invalid;
  converting one page in a repo of legacy components is churn, not a fix, and
  `svelte-check` is clean.
