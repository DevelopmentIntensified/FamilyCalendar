# 064 — Family links: one real 404, one real dead breadcrumb, one page that renders without a family

Status: done

Source: the families-list prototype marked the 404 card "fix this then". While
grounding it, the claim on that card turned out to be **wrong**, and the real
defects are smaller and stranger.

**Blocked by:** None (can start immediately).

## What the prototype got wrong

The prototype (and the app-ui README) say the family links 404 because they
render a template string inside an `href`, so "the literal braces ship in the
URL". **They do not.** In Svelte markup, `href="/family/{family.id}"`
interpolates — that is ordinary Svelte, and eleven of the twelve such links are
fine. A prototype that shows a defect the app does not have is worse than one
that shows a real one, so the four prototype pages carrying that claim get
corrected to name the actual cause.

The real defects:

- [ ] **A JS string does not interpolate.** The family *tasks* breadcrumb
      builds its crumb href as a single-quoted JS string, so that one link
      really does ship literal braces. It is a template literal now.
- [ ] **One route shape is wrong.** The family detail page's "Manage
      invitations" points at a per-family invitations path that does not exist.
      The invitations page is a single top-level route, and the families list
      already links to it correctly.
- [ ] **The detail page renders with no family at all.** Its load returns an
      empty shape when the viewer is not a member, when the family is gone, and
      when the query throws — and the page has no not-found branch, so all
      five of its family links render against a null id, producing
      `/family/undefined/...`. Either the load refuses the page (correct: a
      non-member gets a 404, not a broken page) or the page says so plainly.
      The `?.` on every id goes once one of those is true.
- [ ] The four prototype pages that state the wrong cause are corrected, and
      the two real defects stay visible on them.
- [ ] A guard lands: a check that fails when a rendered `href` ships literal
      braces, or when an `href` names a path the router does not have. The
      prototype tree already walks its own links; this is the in-app
      equivalent, and it is what makes the wrong claim impossible to repeat.
- [ ] The family e2e specs still pass.

## Done

- The family **tasks** breadcrumb href is a template literal now. It was the
  only one of the twelve built as a JS string, and the only one that shipped
  literal braces.
- **Manage invitations** points at the single top-level invitations route. The
  per-family path never existed.
- The family detail **load refuses the page** (404) when the viewer is not a
  member, when the family is gone, and when the query throws. It used to return
  an empty shape and let the page render, which produced five links to
  `/family/undefined/...`. `HttpError`/redirect are re-thrown rather than
  swallowed by the catch, so a 404 cannot turn back into a broken page.
- Four prototype pages corrected (`family.html`, `family-detail.html`, the app
  hub, the app README): the defect is real, the stated cause was not.
- **Guard** (`links.test.ts`, 5 tests): no rendered href may ship literal
  braces; no href may be a quoted JS string containing braces; every static href
  must resolve to a route the router serves; and the two family links are
  pinned by name. It parses the Svelte sources rather than grepping, so an
  interpolated attribute is not mistaken for a literal one.
  - Guarding the guard found a bug in the guard: joining an attribute's parts
    dropped the mustache tag and invented `/family//members/add`. Dynamic hrefs
    are now skipped, and the limitation is written down — a dynamic href naming
    a non-existent route is not statically checkable, which is why the two
    family links are also asserted by name.
- Gates: `links.test.ts` 5/5; `svelte-check` 53 errors in 27 files against a
  **47 in 26** baseline — the 6 extra are the in-flight red test for 072, so
  064 itself adds none; `npm run build` green; `tree-check`, `app-check` and
  `review-check` clean.

## Notes

- The notification link for "added to family" is a real template literal and is
  fine. It was the thirteenth candidate and is not a defect.
- Grounding method worth keeping: parse the Svelte source and look at whether
  the attribute value contains an interpolated tag or a raw string. Reading the
  href and seeing braces is not the same as the browser rendering braces.
