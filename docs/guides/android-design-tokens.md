# Android design tokens (web → Compose)

Issue 291. The native app (`apps/android/`) takes its look from the website, and this guide shows where each value comes from. Code: `apps/android/app/src/main/kotlin/com/familyplanz/app/ui/theme/{Color,Type,Shape,Theme}.kt` and `ui/FpComponents.kt`. If the web changes a value, update the matching row here and in the Kotlin file.

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

## Elevation

Web `shadow-sm` on cards becomes `shadowElevation = 1.dp`. The toast's `shadow-lg` uses Material's Snackbar elevation. Buttons are flat, as on the web.

## Components (`ui/FpComponents.kt` and screens)

| Web | Compose |
|---|---|
| `Navbar` (white, slate-200 rule, primary Mark + bold title) | `FpHeader` |
| login submit (pill, primary-600, 48px, disabled slate-200/500) | `FpPrimaryButton` |
| "Start planning — no account needed" (pill, slate-300 border) | `FpOutlineButton` |
| `AuthCard` | `FpCard` |
| `AuthInput` | `OutlinedTextField(shape = FpShape.Input, colors = fpFieldColors())` |
| `Toaster` | `FpToast` (SnackbarHost slot) |
| `BottomNav` | `PhoneTabBar` in `FamilyPlanzHost.kt` (icon pill, 11sp label, navItems.ts icons as `ic_fp_tasks` / `ic_fp_calendar`) |
| `CalendarToolbar` chevrons + view toggle | `CalendarToolbar.kt` (`MonthStepButton`, `ViewToggle`) |
| `MonthView` / `MonthDayCell` (Monday first, glyph view) | `CalendarMonthGrid.kt` |
| `chipShell` (rail + dot/bar glyph) | `EventRow` in `CalendarScreen.kt` |
| `EmptyState` | `FpEmptyState` |
| `Mark.svelte` glyph | `res/drawable/ic_fp_calendar.xml` |
| `static/brand/mark.svg` app icon | `res/drawable/fp_app_mark.xml` (1:1 vector port, shown on sign-in) |
