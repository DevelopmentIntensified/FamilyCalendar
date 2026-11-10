# 313 — Nav + theme prototype: decision note

Status: awaiting owner pick
Prototype: `apps/android/app/src/test/kotlin/com/familyplanz/app/ui/review/ReviewThemeVariantsTest.kt`
Screenshots: `apps/android/app/build/screenshots/380/theme-A.png` … `theme-D.png` (380 dp wide, 2600 dp tall, so the whole shell fits one PNG)

Regenerate: `./gradlew :app:testDebugUnitTest --tests '*ReviewThemeVariantsTest*'` (from `apps/android/`).

Everything below is render-only. A = the shipped shell; B/C/D each restate the delta from the current spec-mandated shape (6-tab bottom bar **plus** a hamburger menu repeating the same five destinations, bell inside the menu, orange + slate + white with the web's tints unused on Android).

## Common frame (all four shots)

Real components only: `FpNavbar`, `FpMobileMenu`, `FpNotificationBell`, `FpBottomNav`, `CalendarScreen` (month view), `FpCard`, `FpChip`, the app's type/shape/elevation tokens. The menu is open and Calendar is the active tab in every variant so the comparison isolates the nav chrome and the colour.

## A — baseline (shipped)

Delta: none.

The menu opens with the bell row, then Calendar / Dashboard / Tasks / Groceries / Family (the same five destinations the bar below already shows), a rule, Settings / Task Stats / Archive / Report a Bug, a rule, Logout. The bar carries six tabs with an orange active pill. Colour is orange (mark, FAB, active pill, active menu row, Logout), slate text, white surfaces — the owner's "too strictly orange and white, no third colour" reading is visible here.

## B — nav de-dup (bell promoted)

Delta:
- The menu loses its five destination rows. It keeps only Settings / Task Stats / Archive / Report a Bug and Logout — the destinations the bottom bar cannot reach.
- The bell leaves the menu's first row and sits in the navbar, immediately left of the hamburger, so notifications are one tap from every screen (today it is hamburger → menu → bell).
- The six-tab bottom bar is unchanged; colour is unchanged from A.

Effect: two competing lists become one list plus one overflow sheet. The menu roughly halves in height and no longer repeats the bar.

## C — mint as the third colour

Delta (structure identical to A):
- Active tab pill + label and the pill's glyph: mint, `Brand.Mint` `#C4E9DA` on `Brand.MintInk` `#2D5866` (`src/lib/marketing/theme.css:67`) instead of primary-50/600.
- Section header (kicker + title) carries mint ink over a mint wash band.
- The month grid's today cell takes a mint wash instead of primary-50.
- Orange stays where it means action: the navbar mark, the FAB, Logout, the selected menu row.

Cost noted for the build ticket: `tabTone()` (`ui/shell/BottomNav.kt:58`) and `menuRowTone()` (`ui/shell/Navbar.kt`) return `Primary.*` constants, so a third colour needs a real role (an `FpColors`/`colorScheme.tertiary` hook) rather than a call-site hex.

## D — blush focal, orange only for actions

Delta (structure identical to A):
- `MaterialTheme.colorScheme.surface` is washed blush (`Brand.Blush` `#FED5CF`, `theme.css:62`, pulled ~70 % toward white), so navbar, menu sheet, cards and the tab bar stop being white; the section band is a deeper blush with terracotta ink.
- The month grid's today cell is the blush wash.
- Orange survives only on actions: Logout, the FAB, the selected tab.

Cost noted: contrast drops versus white (slate-400 meta and hairlines read softer), the card elevation cue weakens, and a large tinted area is the most opinionated change of the four — good "matches the style guide", risk of reading pink on a phone at arm's length.

## Recommendation: B, shipping C's mint on top

B is the one variant that answers the owner's first complaint ("navigation feels busy") with structure rather than paint: it deletes the duplicated destination list, keeps every destination reachable, and promotes the bell to where it is already expected — with no new component, no new pattern, and a smaller menu. C is the cheapest answer to the second complaint: mint is already a ported token with its ink, it appears only where the palette was leaning on orange for state (active tab, section header, today cell), and orange keeps its brand/action role. D is a real alternative but it contradicts the shipped white-card system everywhere at once, so it is better revisited after the colour role exists.

Caveat before building B: the bell overlay in the screenshot is a harness composition (the real `FpNavbar` takes no bell slot), and B's reduced menu body is a harness composition because `FpMobileMenu` hard-codes `MENU_NAV_ROWS` — the follow-up ticket has to move both into the production shell (navbar trailing slot + a menu row set that depends on the route being tab-hosted).

## Follow-up build tickets (drafted, not filed)

1. **Menu dedup + navbar bell** — `FpMobileMenu` renders secondary/admin rows only; `FpNavbar` gains a bell in its trailing actions; keep the six-tab bar. Touch: `ui/shell/Navbar.kt`, `ui/FamilyPlanzHost.kt`.
2. **Third colour role** — add a nav/header accent role to `FpColors` (or map it to `colorScheme.tertiary`), repoint `tabTone()`, `menuRowTone()` and section headers; port lavender (`#D3C7E6` / `#6B5B7B`) at the same time so the palette is complete.
3. **(Only if D wins later)** blush surface washes — needs a card-vs-chrome surface split first, since `FpCard` and the chrome share `colorScheme.surface` today.
