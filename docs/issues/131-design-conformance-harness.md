# 131 - The design-conformance harness

Status: done

**What to build:** One module that takes a rendered route and reports where it
departs from the design language the marketing pages actually emit. It ships
reporting **zero** deviations on a marketing page, so it is proven before it is
allowed to judge anything. This is the single new seam in the programme; every
visual ticket after this one is a red assertion in it.

Derive the expectations from the marketing pages' own emitted values. Do **not**
write a second style guide by hand - a second source of truth is how the current
drift happened in the first place.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Given a marketing page, the harness reports zero deviations
- [x] Given a known-drifting app route, the harness reports the specific deviation
- [x] The token set is derived from the marketing pages, not hand-written
- [x] Deviation output names the property, the expected value and the actual
- [x] A unit test per rule, written red first

**Note:** three review rounds in this repository reported a page as "matches the
prototype" and were wrong each time. All three compared feature presence rather
than emitted values. This harness exists so that verdict stops being an opinion.

## Done

- `src/lib/conformance/`: `collect.ts` (in-page walker via `page.evaluate`),
  `rules.ts` (one normaliser per tracked property — 22 properties, colour /
  length / keyword / shadow rules), `tokens.ts` (`deriveTokens`,
  `findDeviations`, `formatDeviations`). No value is written down anywhere in
  the code: the expected set is measured from the marketing routes each run.
- Unit seam: `rules.test.ts` + `tokens.test.ts`, 25 tests, written red first
  (`npx vitest run src/lib/conformance`), green after implementation.
- E2e seam: `e2e/conformance/`. Token set derived from 7 marketing routes at
  1280px in headless Chromium; `/about` held out of the corpus (leave-one-out,
  so the proof is not measured against itself) → **0 deviations**.
  Leave-one-out probe across all 8 routes, for the record: `/about` 0,
  `/contact` 0, `/pricing` 21 (its amber accent family is unique to it),
  `/changelog` 24, `/features` 48, `/roadmap` 60, `/privacy` 65, `/` 66.
- Known-bad proof: `account-known-bad.test.ts` measures `/account` at 1000px
  signed in → **6 deviations**, including two of #129's own measured rows:
  - `span[data-testid="account-initial"] | background-color | actual #ffedd5`
    (orange-100) against a palette containing `#fed5cf` (the approved blush);
  - `div.px-3.pb-2 | letter-spacing | expected 0.3px, normal | actual 1.1px`
    (the `tracking-widest` = .1em title against the marketing tracking set);
  - plus `font-weight 800`, orange-700 on the avatar, red-600 danger link,
    and `#f1f5f9` on the signed-in navbar dropdown (absent from signed-out
    marketing chrome).
- Later audits plug in at `findDeviations`: add the route to the measured list,
  assert on the returned findings; add a property to `PROPERTIES` to widen the
  vocabulary.

## Fork reported, not decided (geometry rows of #129)

The token harness cannot express the geometry rows of #129 — rail width 16rem
vs 15rem, the 1024 vs 1000px grid switch, framed-vs-unframed main, rail stack
gap — because the marketing pages emit no rail vocabulary to derive them from,
and marketing's own breakpoint is `lg:` 1024, which **conflicts** with the
deleted prototype's 1000px. Two options, for the owner:

- **A (shipped): token conformance only.** One reference (marketing), no
  per-route config, scales to every route #135 measures. Cost: geometry rows
  stay outside the harness and are found only by manual measurement against a
  prototype.
- **B: add a paired geometry diff** against the route's approved prototype
  recovered from git (`git show 9c2c741^:prototypes/app-ui/account.html`) at
  matched viewports. Would express "expected 240px @1000px" exactly. Cost: the
  page prototypes were deleted in `9c2c741` (pinned to a git rev forever, only
  5 prototype pages survive in the registry), every audited route needs a
  hand-written selector pairing, and the prototype disagrees with the marketing
  reference on breakpoints — the owner must rule which reference wins.

## Needs doing

- [ ] Owner rules on the fork above (geometry rows: marketing reference vs
      prototype-paired diff).
- [ ] #135 runs every route through `findDeviations` and files findings.

## Done

(evidence above; build green with `NODE_OPTIONS=--max-old-space-size=4096`)
