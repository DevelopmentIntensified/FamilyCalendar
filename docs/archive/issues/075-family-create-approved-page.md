# 075 — Create a family: the approved page, on the real page

Status: done

Source: `app-ui/family-create.html` review — "passed". Prototype approved.

**Blocked by:** None (can start immediately).

## Needs doing

- [x] The real page takes the approved prototype's composition: a live preview
      of the family as you name it, the name field as the loudest thing on the
      page, the colour choice explained rather than just offered.
- [x] The swatch set is the prototype's curated earthy set, not seventeen
      arbitrary hexes in a six-column grid.
- [x] Copy: "What do you call it?" and a plain explanation of what the colour
      is for, replacing "max 50 characters" as the visible instruction.
- [x] Usage line showing how many families are used against the plan limit, so
      the upgrade banner stops being the only signal.
- [x] The create still acks in under 100ms and confirms what happened (toast
      plus the redirect), per the UI rules.
- [x] The existing family creation e2e spec is updated, not deleted: the
      heading, the name field, the button, the error box, the redirect, and
      the default colour all still have to hold.

## Done

- `+page.svelte` rebuilt to the approved composition:
  - a **live preview** card at the top of the card stack — a "Family" chip in
    the chosen colour, a soft blurred blob, and the typed name falling back to
    "Your family". It reads the live `name` state, so it updates as you type.
  - the **name field is the loudest thing on the page**: `text-2xl
    font-extrabold`, borderless with a 2px bottom rule that takes the brand
    colour on focus. The page title dropped to `text-sm` so it no longer
    competes. Label is "What do you call it?"; the "(max 50 characters)" hint
    is gone (`maxlength` and the server check both still hold).
  - the **colour explained in plain words**: "The colour tints the family
    calendar, the member avatars and the family chip. It is the one thing on
    this page that ends up visible everywhere else." Each swatch carries an
    `aria-label` of its plain-word name and the chosen one is announced
    ("Sage selected") rather than painted alone.
  - the **curated earthy six** from the prototype, in a wrapping flex row of
    `aria-pressed` swatches — not a six-column grid of seventeen.
  - the **usage line**: "0 of 1 family used on your plan." The count comes from
    `canCreateFamily`, which already computed the number and threw it away;
    it now returns it as `used` (additive — the existing call, not a second
    one).
  - the **create confirms itself**: `pushToast` on a redirect or success result,
    naming the family it made ("The Hoppers created — opening it now"). The
    submit already set the pending state synchronously, so the ack is
    immediate; the error box still names a failure, so nothing toasts on one.
  - the buttons stack under `sm` (primary first) so nothing overflows at 320px;
    the swatch row wraps for the same reason.
- `e2e/family/FamilyCreation.test.ts` **updated, not deleted**: 5 specs became
  7. The heading, the name field, the submit button, the error box, the
  redirect and the colour assertion all still hold — under the new field label
  and the new default. Added a spec for the preview + usage line, and split the
  old "custom color" spec into a real default-colour spec and a real
  custom-colour spec (that half was 099's to-do; it landed with this pass
  because both tickets touch the same spec). The "name only" spec now also
  asserts the toast.
- `src/routes/(family)/family/create/page.svelte.test.ts` — 10 specs covering
  the preview, the swatch state, the plain-word copy, the usage line, and the
  toast. Renamed off the `+` prefix: SvelteKit reserves `+`-prefixed filenames
  inside `src/routes/`, and `+page.svelte.test.ts` fails the build for
  everybody. `page.svelte.test.ts` is the repo convention (7 other files).
- `canCreateFamily` now returns `used` as well — 3 specs in
  `subscriptionService.test.ts`, including the de-duplicated case (one family,
  two roster rows).

## Notes

- This is the **presentational** half of the approved page. The structural half
  — picking members before the finish line — is 076 and needs its own window.
- The create action is three separate inserts and is not atomic. If 076 is
  touching it, take the transaction there rather than here. **Left untouched
  here**: the action's only change is the colour (#099), so 076 has the
  transaction to itself.
- **075 contradicted itself and the contradiction was resolved in 099**: this
  ticket asked for the prototype's curated set *and* for the old blue default
  to "still hold". The blue `#3B82F6` is not a member of the curated set, so
  both could not be true. The palette won; the default moved to the set's
  first entry; the spec followed. 099 is where that is written down, with the
  decision asserted so it cannot be undone by accident.
- Verified: `npm run build` exits 0, both vitest projects green (2421 tests),
  and `npx playwright test e2e/family/FamilyCreation.test.ts` — **7 passed**
  against the real build and the real database.
