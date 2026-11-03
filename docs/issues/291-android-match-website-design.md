# 291 — Android: look like the website

Status: done

Source: owner 2026-11-03: the native Android app "doesn't look like the website at all".

## Done

- Design language taken from the web code and written up in `docs/guides/android-design-tokens.md`, with a token table mapping each web class or variable to its Compose value. Sources: the tailwind `primary` and slate ramps, the theme-color `#dd5822`, theme.css tints and radii, and TaskRow, MonthDayCell, chipVocabulary, Toaster, BottomNav, Navbar and the login page. The site loads no webfont (system sans = Roboto) and has no dark mode, so the app is light-only and never uses dynamic colour.
- New FamilyPlanz theme `ui/theme/{Color,Type,Shape,Theme}.kt`:
  - Material3 `ColorScheme` mapped from the web palette: primary #dd5822, white surfaces on a slate-50 page, slate-200 and slate-300 outlines, red-600 error.
  - `FpColors` holds the roles Material has no slot for: chip, due/late, priority and calendar-cell tones.
  - Tailwind type scale and radii.
  - `FamilyPlanzTheme` is applied in `MainActivity`.
  - A status-bar strip in theme-color with light icons; the nav bar is white with dark icons.
- Shared look-alikes in `ui/FpComponents.kt`: header (Navbar), pill primary and outline buttons, AuthCard, chip, AuthInput field colours, Toast and filter pills.
- Screens restyled:
  - Sign-in: web login layout, with the app mark, wordmark, card, pill submit, error alert and centred code field.
  - Tasks tab:
    - Header, then the AddTaskCard.
    - Task rows in web style: slate-50 rounded rows that turn red when late, a round check, and a wrapping meta line of chips in the web palette (due/overdue/today, "N days late", recurring, category, priority dot, Family, assignee avatar pill, pending, focus).
    - Accept/Decline as emerald and red pills; empty state.
    - TaskFocus pieces (#290): the "Focusing" chip uses the theme's focus tone; FocusAction and the "Focusing now" note are unchanged.
  - Calendar tab:
    - Toolbar with chevrons and a List/Month toggle. List stays the default, so existing behaviour is unchanged.
    - Month grid of web MonthDayCells: Monday first, 14dp cells, today wash and disc, weekend paper, glyph marks. Tapping a day that has events opens its Day view.
    - Event rows use the chipShell look: rail plus dot or bar glyph.
  - Quick-add, notification banner (white card for the ask, amber when blocked), guest note (login info-card blue), bottom tab bar (BottomNav icons and active pill), snackbars (Toast).
- Assets: the web app icon (`static/brand/mark.svg`) ported to the vector `fp_app_mark.xml`; the Mark glyph, tab, chevron and close icons are vectors taken from the web SVG paths.
- Behaviour unchanged. Every test selector stays as it was; no existing test was edited.
- Tests: `WebThemeTest` covers the colour-scheme mapping, the chip palette, due/late tones, the `lateChip` wording, the avatar hash and the Monday-first grid.
- Evidence: `:app:mobileGate :app:assembleRelease` BUILD SUCCESSFUL, 255 tests, detekt clean. Robolectric native-graphics PNGs of sign-in, tasks, calendar list and calendar month were checked by eye; the test that made them was a scratch file and is not committed.

## Needs doing

(none)
