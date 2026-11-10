# Desktop theme prototype (#322)

**Question:** the signed-in web app reads as white + primary orange. Which way should it
pick up the marketing style guide — a third colour, lighter nav surfaces, or both — without
losing the density the real shell carries?

**Route:** `/prototypes/theme?v=A` (dev server only; the floating bar is gated on
`import.meta.env.DEV`).

**Variants:** `?v=A`, `?v=B`, `?v=C`, `?v=D`. Arrow keys `←` / `→` cycle; `A`–`D` jump.

> This file is a decision note for the throwaway route. It is not a page in the root
> `prototypes/` estate (#132 stays closed) and it touches no production file.

## How it is built

All four variants mount the real `Navbar`, `BottomNav` (and, through `Navbar`,
`NavbarMobileMenu`), `Calendar` and `TopPrioritiesCard` with real props. The only
variant-specific code is a class on the route's wrapper plus CSS scoped under that class;
colours come from the tokens in `src/lib/marketing/theme.css`:

- `--mp-lavender` / `--mp-lavender-ink` (otherwise unused in the app)
- `--mp-blush`, `--mp-peach`, `--mp-blue`, `--mp-mint` and their `-ink` partners
- `--mp-tint-blush` for the wash, `--mp-brand-ink` / `--mp-warm-600` for ink and action

The palette is imported by the prototype route only, so no production stylesheet changes.

## Variant deltas

| `?v=` | Name | Delta from the shipped shell | If the owner picks it |
|---|---|---|---|
| `A` | Baseline | Nothing. White cards, primary-orange active states, desktop nav row, six-tab phone bar. | Keep the app as-is; #322 closes with no follow-up. |
| `B` | De-duped nav | Phone tab bar keeps Calendar / Dashboard / Tasks. Groceries, Family and Alerts stay in the hamburger menu, and the bell is promoted into the navbar. Desktop already has one nav row, so it is untouched. | `bottomNavItems` gains a primary flag; `NavbarMobileMenu` keeps the secondary rows; `NotificationBell` joins the phone header cluster. |
| `C` | Lavender accents | Lavender (`--mp-lavender` / `--mp-lavender-ink`) on the active tab pill and every section header. Everything else is baseline. | Add a semantic lavender accent token to the app theme and let the tab bar + section headers read it rather than repeating a hex. Smallest production change of the four. |
| `D` | Blush canvas | Blush washes (`--mp-tint-blush`) become the page, nav and card surfaces; active nav reads brand-ink on blush. Orange survives only on the action button. | Split the app's surface tokens into blush paper/cards and brand-orange for actionable controls only. The largest visual rewrite. |

Each variant repeats its delta in the page copy, and the page footer carries the
decision note for the current variant.

## Recommendation

**Pick `C`.** It is the direct answer to "too strictly orange and white": the marketing
palette's one unused third colour appears on the two surfaces a user reads constantly (the
active tab pill and the section headers), and the change is one token plus two selectors —
no layout, density or interaction changes. `B` is a separate nav-only win that can ship on
phones afterwards; `D` is worth trying only if the owner wants a full surface rewrite.
