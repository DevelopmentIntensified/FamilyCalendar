# Android design tokens (web → Compose)

Issue 291, updated by #292 lane 1 (§1.9). The native app (`apps/android/`) takes its look from the website, and this guide shows where each value comes from. Code: `apps/android/app/src/main/kotlin/com/familyplanz/app/ui/theme/{Color,Type,Shape,Theme,FpMotion}.kt`, `ui/{FpComponents,FpBanner,FpChips}.kt` and `ui/shell/**`. If the web changes a value, update the matching row here and in the Kotlin file. Every new Kotlin token carries a KDoc comment naming its `file:line`, and `WebThemeTest` asserts it.

## Sources read

- `tailwind.config.js`: `primary` ramp, plus `secondary` (which is slate copied unchanged)
- `src/app.html` / `static/manifest.webmanifest`: `theme-color` / `theme_color` `#dd5822`
- `src/lib/marketing/theme.css`: brand tints, radii (`--mp-r-*`) and font stack (`--mp-font`)
- Components: `MonthDayCell.svelte`, `tasks/TaskRow.svelte`, `tasks/CategoryChip.svelte`, `Toaster.svelte`, `BottomNav.svelte`, `Navbar.svelte`, `auth/{AuthCard,AuthInput,ModeToggle}.svelte`, `(marketing)/login/+page.svelte`, `calendar/{CalendarToolbar,EmptyState}.svelte`, `tasks/{TasksHeader,AddTaskCard}.svelte`
- Utilities: `utils/chipVocabulary.ts`, `utils/eventChip.ts` (`chipColor` fallback `#94a3b8`), `utils/priorityTone.ts`, `utils/taskUrgency.ts` (`lateChip`), `utils/avatarColor.ts`, `utils/navItems.ts` (tab icons)

## Font

The site loads no webfont. `--mp-font` is the platform sans stack (`ui-sans-serif, system-ui, … Roboto …`), which resolves to Roboto on Android. The app therefore uses `FontFamily.Default` and bundles no font file.

## Dark mode

The site has none: there are no `dark:` classes and no `darkMode` setting. The app is light-only and never uses dynamic colour.

## Colour

| Web | Value | Compose |
|---|---|---|
| `primary-600` / theme-color | `#dd5822` | `colorScheme.primary`, status-bar strip (`FpColors.statusBar`, `STATUS_BAR_ARGB`) |
| `primary-50` | `#fef7f0` | `primaryContainer` (active tab pill, today cell, empty state) |
| `primary-700` | `#b8441c` | `onPrimaryContainer` |
| `primary-300` | `#f5be92` | `inversePrimary`, `FpColors.todayCellBorder` |
| `secondary` = `slate-700` | `#334155` | `secondary` |
| `slate-50` | `#f8fafc` | `background` (page canvas), `FpColors.rowSurface` |
| `white` | `#ffffff` | `surface`, cards, inputs, tab bar |
| `slate-900` | `#0f172a` | `onSurface`, `FpColors.textStrong` |
| `slate-600` | `#475569` | `FpColors.textBody` |
| `slate-500` | `#64748b` | `onSurfaceVariant` |
| `slate-400` | `#94a3b8` | `FpColors.textMuted`, `FpColors.chipRail` (web `chipColor` fallback) |
| `slate-300` | `#cbd5e1` | `outline` (AuthInput border, check ring) |
| `slate-200` | `#e2e8f0` | `outlineVariant` (card/cell border, header/tab rules) |
| `slate-100` | `#f1f5f9` | `surfaceVariant` (toggle track), `FpColors.rowBorder` |
| `red-600` / `red-50` / `red-700` | `#dc2626` / `#fef2f2` / `#b91c1c` | `error` / `errorContainer` / `onErrorContainer` |
| `#366d7e` / `#bedae3` (brand blue ink / blue) | | `tertiary` / `tertiaryContainer` |
| `#bedae3` at 40% (login info card) | | `FpColors.infoSurface` (guest note) |
| `amber-50/200/800` (TasksHeader notice) | | `FpColors.warn*` (blocked-notifications banner) |
| `#f8f6f3` paper (weekend wash) | | `FpColors.weekendCellSurface` |

### Page canvas (#292 §1.1, AC-SH-21)

| Screen | Web | Compose |
|---|---|---|
| Calendar, Dashboard, Groceries, Alerts | `#ffffff` (body has no bg, `app.html:45`) | `FpColors.canvasWhite` |
| Tasks (`tasks/+page.svelte:364`), Family, Account, Sign-in | `#f8fafc` slate-50 | `FpColors.canvasSlate` |
| picker | `canvasFor(route)` in `ui/FamilyPlanzHost.kt` (white unless route in the slate set) | |

### Navbar, banners, toasts, badges (#292 §1.1-§1.2)

| Token | Web | Compose |
|---|---|---|
| navbar wordmark | `text-slate-800` (`Navbar.svelte:82`) | `FpColors.wordmark` = `Slate.S800` |
| "Sent again ✓" pill | `#c4e9da` at 60% (`theme.css:67`, `calendar/+layout.svelte:218`) | `FpColors.mintPill` |
| offline banner | `border-amber-300 bg-amber-100 text-amber-900` (`OfflineBanner.svelte:63`) | `FpColors.offline` (`BannerTone`) |
| guest / verify banner | amber-200/50/800 (`calendar/+layout.svelte:167,251`) | `FpColors.warnBanner`, `FpColors.warnHint` = amber-600 |
| urgent guest / error | red-200/50/800 (`calendar/+layout.svelte:250`) | `FpColors.errorBanner`, `FpColors.errorText` = red-700 |
| claimed / merged | green-200/50/800 (`calendar/+layout.svelte:151`) | `FpColors.successBanner` |
| notification tones | `notificationTypes.ts` TONES | `NotifTones.pending/positive/declined/family/unknown` |
| scrim | `bg-black/40`; toolbar sheets `bg-slate-900/30` | `FpColors.scrim` / `FpColors.scrimSlate` (no blur) |
| account avatar | terracotta `#c45e38` on blush `#fed5cf` (`theme.css:43,62`) | `FpColors.avatarAccount`, `Brand.Blush` |
| selected / idle filter chip | `border-slate-900 bg-slate-900 text-white` / white + slate-600 | `FpColors.chipSelected` / `chipIdle` |
| tab badge / bell badge | `bg-primary-600` / `bg-red-500` (`BottomNav.svelte:164`, `NotificationBell.svelte:190`) | `FpColors.tabBadge` / `bellBadge` |
| toast text / dismiss | slate-800 / slate-300 (`Toaster.svelte`) | `FpColors.toastText` / `toastDismiss` |
| kicker | `text-slate-400` (`Calendar.svelte:566`) | `FpColors.kicker` |
| store swatches | `groceries.ts:156-200` STORE_COLOURS | `GroceryTones` (6, same order) |
| calendar defaults / sponsored | `calendar/+page.server.ts:106,145,320` | `CalendarDefaults.Personal/Family/Sponsored` |

## Chips (TaskRow meta slots → `FpColors`, `FpChip`)

| Slot | Web class | Compose |
|---|---|---|
| category | `bg-teal-100 text-teal-800` | `category` (tag `category-chip`) |
| tag | `bg-sky-100 text-sky-700` | `tag` |
| family | `bg-indigo-100 text-indigo-700` | `family` |
| late (`N days late`) | `bg-red-100 text-red-700` bold | `late` |
| due today / later | `dueTone`: amber-100/700, slate-100/600 | `dueToday` / `due` |
| overdue due date | `dueTone` red-100/700 | `late` |
| pending assignment | `bg-amber-100 text-amber-700` | `pending` |
| assignee pill | `bg-slate-100 text-slate-600` + `avatarColor()` disc | `assignee` + `avatarTone(id)` (same hash, same 8-tone palette) |
| recurring | purple text | `recurring` (purple-100/500) |
| focus / Focusing | primary-50/700 | `focus` |
| priority dot | `bg-red-500` / `bg-slate-300` / `bg-slate-200` | `priorityHigh/Normal/Low` |
| accept / decline | emerald-100/700, red-100/700 pills | `accept` / `decline` |
| row surface | `border-slate-100 bg-slate-50/60`; late `border-red-200 bg-red-50` | `rowSurface/rowBorder`, `lateRowSurface/lateRowBorder` |

The chip shape matches the web: `rounded-full`, 18dp high, 7dp horizontal padding, 10sp text (`FpChipText`).

## Type (`FpTypography`)

| Web | Compose |
|---|---|
| `text-3xl font-bold tracking-tight` (login h1) | `headlineMedium` 30/36 Bold −0.025em |
| `text-2xl font-bold` | `headlineSmall` 24/32 Bold |
| `text-xl font-bold` (navbar wordmark, "Tasks") | `titleLarge` 20/28 Bold |
| `text-lg font-semibold` | `titleMedium` 18/28 SemiBold |
| `text-sm font-semibold` (card h2) | `titleSmall` 14/20 SemiBold |
| `text-base` | `bodyLarge` 16/24 |
| `text-sm` | `bodyMedium` 14/20 |
| `text-xs` | `bodySmall` 12/16 |
| button `text-sm font-semibold` | `labelLarge` 14/20 SemiBold |
| `text-xs font-medium` | `labelMedium` 12/16 Medium |
| `text-[11px] font-medium` (BottomNav label, meta) | `labelSmall` 11/16 Medium |
| `text-[0.625rem]` chip | `FpChipText` 10/12 Medium |
| `text-[13px] font-bold` day disc | `FpDayDiscText` |
| marketing display (800, −0.03em) | `displaySmall` |

### #292 §1.3 additions

| Web | Compose |
|---|---|
| `text-xl font-extrabold tracking-tight` (family card name) | `FpTitleLargeHeavy` 20/28/800 −0.025em |
| `text-lg font-bold tracking-tight` (calendar month label) | `FpTitleMediumBold` 18/28/700 |
| `text-[0.6875rem] leading-5` (TaskRow meta) | `FpMetaText` 11/20/500 |
| `text-[9px] font-bold` (RSVP badge, avatar initial) | `FpMicroText` 9/12/700 |
| `text-[10px] font-semibold leading-none` (badge) | `FpBadgeText` 10/10/600 |
| navbar wordmark `text-xl font-bold` (`Navbar.svelte:82`) | `FpWordmarkText` 20/28/700, no tracking |
| uppercase kickers `tracking-[0.08em]` (`AccountSidebar.svelte:67`) | `FpKickerText` + `FpKicker()` |
| `tracking-widest` (`family/+page.svelte` `dt`) | `FpKickerWideText` (0.1em) |

## Radii (`FpShapes`, `FpShape`)

| Web | dp | Compose |
|---|---|---|
| `rounded-md` (event chip) | 6 | `shapes.extraSmall` |
| `rounded-lg` (task row, toggle item) | 8 | `shapes.small` |
| `rounded-xl` (toast, alert, toggle track) | 12 | `shapes.medium` |
| `rounded-2xl` (AuthCard, TasksHeader, AddTaskCard) | 16 | `shapes.large` |
| `rounded-3xl` | 24 | `shapes.extraLarge` |
| `rounded-[14px]` MonthDayCell (`--mp-r-cell`) | 14 | `FpShape.Cell` |
| `rounded-[10px]` AuthInput | 10 | `FpShape.Input` |
| `rounded-full` (buttons, chips, disc) | pill | `FpShape.Pill` |
| `rounded` (overflow "+N more", `?K` hint) | 4 | `FpShape.Xs` |
| `rounded-[1.25rem]` (account rail card, section card) | 20 | `FpShape.Rail` |
| bottom sheets `rounded-t-2xl` (`DayActionSheet.svelte:84`) | top 16 | `FpShape.SheetTop` |

## Elevation (`FpElevation`, `ui/theme/Shape.kt`)

Tailwind 3.4.19 `boxShadow`. Compose draws one shadow per surface, so each two-layer web shadow maps to the nearest elevation.

| Web | Where | Compose |
|---|---|---|
| `shadow-sm` | cards, toolbar controls, calendar card | `FpElevation.Sm` 1 dp |
| `shadow-md` | RSVP active, list-card hover | `FpElevation.Md` 3 dp |
| `shadow-lg` | toast, bell dropdown, help popover | `FpElevation.Lg` 6 dp |
| `shadow-xl` + `shadow-primary-400/50` | FAB, bulk bar, mini picker | `FpElevation.Xl` 8 dp, `spotColor = Primary.P400.copy(0.5f)` |
| `shadow-2xl` | bottom sheets, action menu | `FpElevation.Xxl` 12 dp |

## Motion (`FpMotion`, `ui/theme/FpMotion.kt`)

Every duration cites its source; `FpMotion.spec(ms, reduced)` snaps when the system animator scale is 0 (`app.css:13-21`), `rememberReducedMotion()` reads it.

| Web | Value | Source | Compose |
|---|---|---|---|
| standard transition | 150 ms `cubic-bezier(.4,0,.2,1)` | `theme.css:146-147` | `FpMotion.STANDARD_MS`, `Ease` |
| page fade-in | 100 ms | `calendar/+layout.svelte:270` | `PAGE_FADE_MS` |
| mobile menu slide | 200 ms | `NavbarMobileMenu.svelte:29` | `MENU_SLIDE_MS` |
| bell dropdown / banner fade | 150 ms | `NotificationBell.svelte`, `calendar/+layout.svelte:153` | `BANNER_MS` |
| sheet swipe-to-close | drag > 100 px, release 150 ms ease-out | `bottomSheetSwipe.ts:15,39` | `SheetCloseDistance`, `SHEET_RELEASE_MS` |
| toast auto-dismiss / stack | 6 000 ms, 4 at once (keeps last 3) | `toasts.ts:14,18` | `TOAST_MS`, `TOAST_STACK` |
| "Sent again ✓" | 3 000 ms | `calendar/+layout.svelte:126` | `SENT_AGAIN_MS` |
| "Synced N changes" / recount | 4 000 / 2 000 ms | `OfflineBanner.svelte:73-86` | `SYNCED_MS`, `RECOUNT_MS` |
| press | `active:scale-[0.95..0.98]` | toolbar/FAB/buttons | `Modifier.pressScale()` |

## Spacing (dp = px at density 1)

| Web | dp | Where |
|---|---|---|
| navbar `px-6 py-4`, gap 2 | 24 / 16 / 8 | `Navbar.svelte:78-80`; content height 44 + 32 = **76** |
| calendar gutter `px-3` | 12 | `Calendar.svelte:471` |
| tasks / family `px-3 py-4` | 12 / 16 | `tasks/+page.svelte:365` |
| dashboard `px-2 py-4` | 8 / 16 | `dashboard/+page.svelte` |
| groceries / alerts `px-4 py-6` | 16 / 24 | those pages |
| account `px-4 py-8` | 16 / 32 | `account/+page.svelte` |
| card padding / stack gap `p-4 space-y-4` | 16 | `FpCard` |
| bottom clearance `pb-28` / `pb-20` | 112 / 80 | `calendar/+layout.svelte:267`, `tasks/+page.svelte:365` |
| touch floor `min-h-11` | 44 | `Modifier.minimumInteractiveComponentSize()` |

## Icons (`res/drawable/ic_fp_*`)

24-unit **stroke** paths, ported verbatim (`fill=none stroke=currentColor stroke-width=2 round`), tinted at the call site.

| Icon | Path source | Drawable |
|---|---|---|
| Tabs: Calendar, Dashboard, Tasks, Groceries, Alerts, Family | `utils/navItems.ts:41-68` | `ic_fp_calendar`, `ic_fp_dashboard`, `ic_fp_tasks`, `ic_fp_groceries`, `ic_fp_alerts`, `ic_fp_family` |
| Mark (navbar 32 dp, sign-in 20 dp) | `brand/Mark.svelte:52-55` | `ic_fp_calendar` (same glyph) |
| Hamburger / close | `Navbar.svelte:155,164` | `ic_fp_menu`, `ic_fp_close` |
| Bell | `NotificationBell.svelte:180` | `ic_fp_alerts` |
| Add (`M12 4v16m8-8H4`, stroke 2.5 on the FAB) | `calendar/+page.svelte:640` | `ic_fp_add` |
| Filters (`M3 5h18M6 12h12M10 19h4`) | `CalendarToolbar.svelte` | `ic_fp_filters` |
| Chevrons | `DayNav.svelte` | `ic_fp_chevron_left/right` |
| Recurring (purple-400) | `MonthDayCell.svelte:276` | `ic_fp_recurring` |
| Event detail rows: date, calendar, creator, location, reminder | `calendar/EventDetailList.svelte:62,94,111,128-134,151` | `ic_fp_detail_date`, `ic_fp_detail_calendar`, `ic_fp_detail_creator`, `ic_fp_detail_location`, `ic_fp_detail_reminder` |
| Event detail time (clock) | `LocationSearch.svelte:262`, `calendar/ListView.svelte:198` | `ic_fp_detail_time` |
| App icon art | `static/brand/mark.svg` | `fp_app_mark.xml` |

## Components (`ui/FpComponents.kt` and screens)

| Web | Compose |
|---|---|
| `Navbar` (white, slate-200 rule, 32 dp primary Mark + bold slate-800 wordmark, 44 dp hamburger) | `FpNavbar` (`ui/shell/Navbar.kt`) |
| `NavbarMobileMenu` (200 ms expand, nav rows, secondary + admin rows, Logout) | `FpMobileMenu` + `MenuState`/`MenuActions` |
| `NotificationBell` (44 dp button, red-500 badge, dropdown) | `FpNotificationBell` + `BellActions` |
| login submit (pill, primary-600, 48px, disabled slate-200/500) | `FpPrimaryButton` |
| "Start planning — no account needed" (pill, slate-300 border) | `FpOutlineButton` |
| `AuthCard` | `FpCard` |
| `AuthInput` | `OutlinedTextField(shape = FpShape.Input, colors = fpFieldColors())` |
| `Toaster` (80 dp above the safe area, 4 stacked, 6 s) | `FpToaster` + `ToastQueue` (`ui/shell/Toaster.kt`) |
| `OfflineBanner` | `FpOfflineBanner` + `OfflineBannerState` (`ui/shell/BannerStack.kt`) |
| guest / verify / claimed banners | `FpAccountBanner`, `accountBanner()`, `VerifyChrome` |
| `BottomNav` (6 tabs, 52 dp, 28 dp icon pill, 11 sp label) | `FpBottomNav` (`ui/shell/BottomNav.kt`) |
| banner row (`px-4 py-2.5 text-sm`, ✕ Dismiss) | `FpBanner` (`ui/FpBanner.kt`) |
| bottom sheet (drag > 100 px, 150 ms release, handle-only drag) | `FpSheet` (`ui/shell/FpSheet.kt`) |
| task chips / filter pills | `FpChip`, `FpDot`, `FpFilterChip` (`ui/FpChips.kt`) |
| `CalendarToolbar` chevrons + view toggle | `CalendarToolbar.kt` (`MonthStepButton`, `ViewToggle`) |
| `MonthView` / `MonthDayCell` (Monday first, glyph view) | `CalendarMonthGrid.kt` |
| `chipShell` (rail + dot/bar glyph) | `EventRow` in `CalendarScreen.kt` |
| `EmptyState` | `FpEmptyState` |
| `Mark.svelte` glyph | `res/drawable/ic_fp_calendar.xml` |
| `static/brand/mark.svg` app icon | `res/drawable/fp_app_mark.xml` (1:1 vector port, shown on sign-in) |
