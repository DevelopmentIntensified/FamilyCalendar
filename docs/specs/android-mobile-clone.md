# Android = the website's mobile view — build spec

Issue: [292](../archive/issues/292-android-clone-mobile-web.md). Owner directive (2026-11-03): _"make the app a clone of the website mobile view for now. Be thorough. And follow the same style guide."_

This is a **spec**. It changes no app code. It tells implementation lanes what to build, which value each token comes from, which JSON endpoint each screen reads, and how each screen is checked.

## 0. Rules for every lane

1. **The website at < 768 px is the reference.** The breakpoint is `VIEW_BREAKPOINT_PX = 768` (`src/lib/components/calendar/calendarView.ts:35`). Every Tailwind `sm:` (640 px) and `md:` (768 px) variant below is **off** for the phone. Read only the unprefixed classes, plus any `max-sm:` classes. Design target: a 390 × 844 dp phone. Floor: 320 dp, with no horizontal scroll (#130 story 18/19).
2. **There is one style guide, and it is not this file.** Token values come from:

   - (a) the design-conformance harness (#131). `src/lib/conformance/{rules,tokens,collect}.ts` + `e2e/conformance/helpers.ts` derive the allowed set per property (`PROPERTIES`, `rules.ts:12-35`) from the marketing pages at run time. No value is written down by hand.
   - (b) the declared sources those pages emit: `tailwind.config.js`, `src/lib/marketing/theme.css`, `prototypes/*/proto.css` (byte-identical copies), and Tailwind 3.4.19 defaults (`node_modules/tailwindcss`).
   - (c) the component classes cited per screen.

   `docs/guides/android-design-tokens.md` (#291) is the current Kotlin mapping. Lane 1 **updates that guide** (§1.9). It does not fork a second guide. Every row in §1 cites its source. If a value cannot be cited, it does not ship.

3. **Clone means structure, copy, states and behaviour, as well as look.** Copy strings are verbatim from the cited `file:line`. Where this spec quotes a string, the quote is authoritative. Where it says "copy from `X:n-m`", the implementer opens the file and copies every string in that range.
4. **Where the web departs from its own style guide, clone the web literally and record the departure.** The two known departures (Groceries `gray-*` / `bg-black`; Alerts developer-note side cards) are **fixed on the web (#292)**, so clone the fixed pages: Groceries uses the §1 slate/primary tokens and Alerts has no side cards. A lane never "improves" the web design on Android alone.
5. **Keep native-only capabilities that already ship.** These have no web counterpart and stay where they are (Q1 asks whether to keep them):
   - TaskFocus Start/Stop focus (#290)
   - the notification-permission banner (#286)
   - local reminders (#271)
   - FCM (#273)
   - background refresh (#268)
   - the "Advanced → paste token" sign-in fallback (#288)
6. **Content rule (AGENTS.md:108).** Family imagery is man + woman + children only. The only family emoji are 👪 and 👨‍👩‍👧‍👦. The web copy quoted here already complies: 👪 appears in `FamilyTaskBoardCard.svelte` ("enjoy the calm 👪.") and `AccountDangerSection.svelte` ("Export your data 👪"). Copy no other family emoji.
7. **Data comes only from `/api/**`with`Authorization: Bearer fp\_…`.** The hook authenticates Bearer **only** under `/api/` (`src/hooks.server.ts:41-58`). Page loads, form actions (`?/action`) and non-`/api` `+server.ts`routes are unreachable from the app. Those include`/family/[id]/members/add/\*`, `/calendar/setUserDefaultTimeZone`and`/signup/password/verify`. §3 lists the endpoints that must be added.
8. **Light only, system font.** The site has no dark mode and loads no webfont (`theme.css:130-135`; #291 guide "Font" and "Dark mode").

---

## 1. Token table (with citations)

Status key:

- **ok**: the current Kotlin value already matches.
- **fix**: Kotlin exists, but its value or usage differs.
- **new**: no Kotlin token exists yet.

The Kotlin names are in `ui/theme/Color.kt`, `Type.kt`, `Shape.kt` and `ui/FpComponents.kt`.

### 1.1 Colour — brand and neutrals

| Token                               | Value                                                                                                                                                      | Source                                                                                                       | Harness property                         | Compose                                       | Status                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| primary-50…950                      | `#fef7f0 #fdede0 #fad9bf #f5be92 #ee9459 #e87539 #dd5822 #b8441c #943a1e #793420 #421a0c`                                                                  | `tailwind.config.js:11-22`                                                                                   | background-color, color, border-\*-color | `Primary.P50…P950`                            | ok                                                                           |
| theme-color / status bar            | `#dd5822`                                                                                                                                                  | `src/app.html:12`                                                                                            | —                                        | `FpColors.statusBar`                          | ok                                                                           |
| slate-50…900                        | `#f8fafc #f1f5f9 #e2e8f0 #cbd5e1 #94a3b8 #64748b #475569 #334155 #1e293b #0f172a`                                                                          | `tailwind.config.js:25-35`; `theme.css:73-79` (`--mp-ink*`)                                                  | same                                     | `Slate.S50…S900`                              | ok                                                                           |
| white                               | `#ffffff`                                                                                                                                                  | `theme.css:36` `--mp-surface`                                                                                | background-color                         | `colorScheme.surface`                         | ok                                                                           |
| page canvas, **white** screens      | `#ffffff`. The body has no background (`src/app.html:45`). Applies to `/calendar`, `/calendar/dashboard`, `/calendar/groceries`, `/calendar/notifications` | `app.html:45`; `calendar/+page.svelte:525` (no bg)                                                           | background-color                         | **new** `FpColors.canvasWhite` (= surface)    | **fix**: Android paints slate-50 everywhere (`FamilyPlanzHost.kt` Column bg) |
| page canvas, **slate-50** screens   | `#f8fafc` on `/calendar/tasks`, `/family/**`, `/account`, `/login`, `/signup`                                                                              | `tasks/+page.svelte:364`; `family/+page.svelte` root; `account/+page.svelte` root; `login/+page.svelte` root | background-color                         | `colorScheme.background`                      | ok, but per-screen                                                           |
| paper (weekend wash start)          | `#f8f6f3`                                                                                                                                                  | `theme.css:35` `--mp-canvas`; `MonthDayCell.svelte:88`                                                       | background-color (gradient stop)         | `FpColors.weekendCellSurface`                 | ok                                                                           |
| terracotta / blush (account avatar) | `#c45e38` on `#fed5cf`                                                                                                                                     | `theme.css:43,62`; `AccountSidebar.svelte` `account-initial`                                                 | background-color, color                  | `Brand.Terracotta`, **new** `Brand.Blush`     | new                                                                          |
| login info / blue                   | `#bedae3` at 40% and 50%; ink `#366d7e`                                                                                                                    | `theme.css:65-66`; `login/+page.svelte` mergeMode and emailSent icon tile                                    | background-color                         | `FpColors.infoSurface`, `tertiary`            | ok                                                                           |
| mint "Sent again ✓" pill            | `#c4e9da` at 60%                                                                                                                                           | `theme.css:67`; `calendar/+layout.svelte:218`                                                                | background-color                         | **new** `FpColors.mintPill`                   | new                                                                          |
| text strong                         | slate-900                                                                                                                                                  | per component                                                                                                | color                                    | `FpColors.textStrong`                         | ok                                                                           |
| **navbar wordmark**                 | **slate-800** `#1e293b`                                                                                                                                    | `Navbar.svelte:82`                                                                                           | color                                    | `Slate.S800`                                  | **fix**: `FpHeader` uses slate-900                                           |
| body / muted / faint                | slate-600 / slate-500 / slate-400                                                                                                                          | per component                                                                                                | color                                    | `textBody` / `onSurfaceVariant` / `textMuted` | ok                                                                           |
| hairline                            | slate-200; slate-100 inside cards                                                                                                                          | `theme.css:39-40`; `Navbar.svelte:75`                                                                        | border-\*-color                          | `outlineVariant` / `FpColors.rowBorder`       | ok                                                                           |

### 1.2 Colour — status and data tones

All hex values come from the Tailwind 3.4.19 default palette (`node_modules/tailwindcss/colors`).

| Role                                                                                       | Classes                                                                                                                                                        | Source                                                         | Compose                                                   | Status    |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| warn banner (guest, verify, load warnings)                                                 | `border-amber-200 bg-amber-50 text-amber-800`                                                                                                                  | `calendar/+layout.svelte:167,251`; `calendar/+page.svelte:551` | `FpColors.warn*`                                          | ok        |
| offline banner                                                                             | `border-amber-300 bg-amber-100 text-amber-900`                                                                                                                 | `OfflineBanner.svelte:63`                                      | **new** `FpColors.offline*` (#fcd34d / #fef3c7 / #78350f) | new       |
| urgent guest banner, errors                                                                | `border-red-200 bg-red-50 text-red-800`                                                                                                                        | `calendar/+layout.svelte:250`; `calendar/+page.svelte:605`     | `errorContainer` + **new** `Accent.Red800 #991b1b`        | fix       |
| success banner                                                                             | `border-green-200 bg-green-50 text-green-800`                                                                                                                  | `calendar/+layout.svelte:151`                                  | **new** `Accent.Green*`                                   | new       |
| RSVP Going / Maybe / Can't go (active)                                                     | `bg-green-600` / `bg-yellow-500` / `bg-red-600`, white text, `shadow-md shadow-<c>/30`                                                                         | `EventRsvpRow.svelte` (template)                               | **new**                                                   | new       |
| task chips (category, tag, family, late, due, pending, assignee, recurring, priority dots) | see #291 guide "Chips"                                                                                                                                         | `TaskRow.svelte` meta slots                                    | `FpColors.*`                                              | ok        |
| notification tones                                                                         | assignment_pending `blue-100/800`; accepted and completed `emerald-100/800`; declined `red-100/800`; added_to_family `orange-100/800`; unknown `slate-100/600` | `src/lib/utils/notificationTypes.ts` `TONES`                   | **new** `FpColors.notif*`                                 | new       |
| store colours (6 swatches)                                                                 | terracotta `orange-100/900, bar orange-50, dot orange-500`; sky; sage = emerald; lilac = violet; amber; slate                                                  | `src/lib/data/groceries.ts:156-200` `STORE_COLOURS`            | **new** `GroceryTones`                                    | new       |
| avatar palette (8)                                                                         | rose, amber, emerald, sky, violet, fuchsia, lime, orange at `-100` / `-700`; hash = sum of char codes mod 8                                                    | `src/lib/utils/avatarColor.ts:1-16`                            | `AvatarTones`, `avatarTone()`                             | ok        |
| Family source chip (dashboard)                                                             | `bg-cyan-50 text-cyan-600`                                                                                                                                     | `TodayGlanceCard.svelte`                                       | **new**                                                   | new       |
| "Filtered/Searching" kicker; selected chip                                                 | `text-slate-400` / `border-slate-900 bg-slate-900 text-white`                                                                                                  | `Calendar.svelte:566`; `TaskToolbar.svelte`                    | `Slate.S900`                                              | new usage |
| sponsored event colour                                                                     | `#f59e0b` (amber-500)                                                                                                                                          | `calendar/+page.server.ts:320`                                 | **new**                                                   | new       |
| default calendar colours                                                                   | personal `#fa8072` fallback; family `#e0ffff` fallback; chip fallback `#94a3b8`                                                                                | `calendar/+page.server.ts:106,145`; `eventChip.ts:3`           | `FpColors.chipRail` (fallback)                            | partial   |

### 1.3 Typography

The system sans is Roboto (`theme.css:134`), so `FontFamily.Default` is right. Sizes and line heights are Tailwind defaults.

| Web                                             | px / leading / weight                                                                                 | Used for (phone)                                                                         | Compose                             | Status                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------ |
| `text-3xl font-bold tracking-tight`             | 30/36/700, −0.025em                                                                                   | login and signup h1                                                                      | `headlineMedium`                    | ok                       |
| `text-2xl font-bold`                            | 24/32/700                                                                                             | Groceries h1, Alerts h1, Family Tasks / Invitations / Account h1                         | `headlineSmall`                     | ok                       |
| `text-xl font-bold`                             | 20/28/700                                                                                             | Navbar wordmark, "Tasks", "Families", "Day Dashboard" h1                                 | `titleLarge`                        | ok                       |
| `text-xl font-extrabold tracking-tight`         | 20/28/800                                                                                             | family card name                                                                         | **new** `titleLargeHeavy`           | new                      |
| `text-lg font-bold tracking-tight`              | 18/28/700                                                                                             | calendar month label (`CalendarToolbar.svelte`, mini picker button)                      | **new** `titleMediumBold`           | new                      |
| `text-lg font-semibold / font-bold`             | 18/28                                                                                                 | modal titles, day sheet header                                                           | `titleMedium`                       | ok                       |
| `text-base`                                     | 16/24                                                                                                 | mobile menu rows, action-menu rows                                                       | `bodyLarge`                         | ok                       |
| `text-sm`                                       | 14/20                                                                                                 | body, buttons                                                                            | `bodyMedium` / `labelLarge`         | ok                       |
| `text-[13px] font-bold`                         | 13/—/700                                                                                              | day disc; dashboard verse                                                                | `FpDayDiscText`                     | ok                       |
| `text-xs`                                       | 12/16                                                                                                 | meta, hints                                                                              | `bodySmall`                         | ok                       |
| `text-[11px] font-medium`                       | 11/16/500                                                                                             | tab label, chip title in month cell, kicker labels                                       | `labelSmall`                        | ok                       |
| `text-[0.6875rem]` (11px) with `leading-5` (20) | 11/20                                                                                                 | TaskRow meta line                                                                        | `labelSmall` with 20 sp line height | fix: needs lineHeight 20 |
| `text-[0.625rem]` / `text-[10px]`               | 10/12                                                                                                 | chips, badges                                                                            | `FpChipText`                        | ok                       |
| `text-[9px] font-bold`                          | 9                                                                                                     | RSVP badge in month chip, assignee avatar initial                                        | **new** `FpMicroText`               | new                      |
| uppercase kickers                               | 11/700/uppercase, `tracking-[0.08em]` = 0.88 px; `tracking-wide` = 0.025em; `tracking-widest` = 0.1em | `AccountSidebar.svelte` rail title; `AssignmentsCard.svelte`; `family/+page.svelte` `dt` | **new** `FpKicker`, `FpKickerWide`  | new                      |

### 1.4 Radii

| Web                  | dp   | Source                                                                          | Compose                | Status     |
| -------------------- | ---- | ------------------------------------------------------------------------------- | ---------------------- | ---------- |
| `rounded`            | 4    | overflow "+N more", ⌘K hint                                                     | **new** `FpShape.Xs`   | new        |
| `rounded-md`         | 6    | month event chip, action-row buttons                                            | `shapes.extraSmall`    | ok         |
| `rounded-lg`         | 8    | task row, inputs in forms, menu rows, toggle segment                            | `shapes.small`         | ok         |
| `rounded-[0.625rem]` | 10   | account rail rows; AuthInput                                                    | `FpShape.Input`        | ok (reuse) |
| `rounded-xl`         | 12   | toast, banners, toolbar controls, view-toggle track, search field               | `shapes.medium`        | ok         |
| `rounded-[14px]`     | 14   | month cell (`--mp-r-cell`, `theme.css:125`)                                     | `FpShape.Cell`         | ok         |
| `rounded-2xl`        | 16   | cards (Tasks, Dashboard, Family bands), bottom sheets (top corners), EventModal | `shapes.large`         | ok         |
| `rounded-[1.25rem]`  | 20   | account rail card, section card                                                 | **new** `FpShape.Rail` | new        |
| `rounded-3xl`        | 24   | calendar card, filter sheet top, family card                                    | `shapes.extraLarge`    | ok         |
| `rounded-full`       | pill | buttons in auth, chips, discs, FAB, filter chips                                | `FpShape.Pill`         | ok         |

### 1.5 Spacing (dp = px at density 1)

| Web                                                | dp                                               | Where                                                                                                                                                                                                             | Status                                           |
| -------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Navbar `px-6 py-4`, gap-2                          | 24 / 16 / 8                                      | `Navbar.svelte:78-80`                                                                                                                                                                                             | **fix**: `FpHeader` is 16 start / 4 end, 56 tall |
| Navbar content height = hamburger `h-11` 44 + 2×16 | **76**                                           | `Navbar.svelte:78,146`. Note: the web offsets `<main>` by only 64 (`calendar/+layout.svelte:267`), so 12 px of content sits under the translucent bar. Android stacks the bar and does not reproduce the overlap. | fix                                              |
| calendar page gutter `px-3`                        | 12                                               | `Calendar.svelte:471`                                                                                                                                                                                             | new                                              |
| Tasks / Family gutter `px-3 py-4`                  | 12 / 16                                          | `tasks/+page.svelte:365`; `family/+page.svelte`                                                                                                                                                                   | new                                              |
| Dashboard gutter `px-2 py-4`                       | 8 / 16                                           | `dashboard/+page.svelte` root                                                                                                                                                                                     | new                                              |
| Groceries / Alerts gutter `px-4 py-6`              | 16 / 24                                          | `groceries/+page.svelte`, `notifications/+page.svelte`                                                                                                                                                            | new                                              |
| Account `px-4 py-8`                                | 16 / 32                                          | `account/+page.svelte`                                                                                                                                                                                            | new                                              |
| card padding `p-4`; stack gap `mt-4` / `space-y-4` | 16                                               | TasksHeader, AddTaskCard, dashboard cards                                                                                                                                                                         | ok (FpCard)                                      |
| bottom content clearance                           | `pb-28` = 112 under calendar; `pb-20` = 80 tasks | `calendar/+layout.svelte:267`; `tasks/+page.svelte:365`                                                                                                                                                           | new (Scaffold inset + FAB)                       |
| touch-target floor                                 | 44 (`min-h-11`, `min-h-[44px]`)                  | throughout; `src/lib/utils/touchTarget.ts`                                                                                                                                                                        | ok (`Modifier.minimumInteractiveComponentSize`)  |
| spacing-check floor                                | ≥ 8 between blocks; ≤ 24 declared vertical gap   | `prototypes/app-ui/README.md` "Spacing"                                                                                                                                                                           | rule                                             |

### 1.6 Elevation (shadows)

Tailwind 3.4.19 `defaultTheme.boxShadow`:

| Web                                   | CSS                                                                                 | Where                                                        | Compose                                                                          | Status        |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------- |
| `shadow-sm`                           | `0 1px 2px 0 rgb(0 0 0/.05)` (= `--mp-shadow-rest`, `theme.css:119`)                | cards, toolbar controls, calendar card                       | `shadowElevation = 1.dp`                                                         | ok            |
| `shadow-md`                           | `0 4px 6px -1px /.1, 0 2px 4px -2px /.1`                                            | RSVP active, list-card hover                                 | 3.dp                                                                             | new           |
| `shadow-lg`                           | `0 10px 15px -3px /.1, 0 4px 6px -4px /.1`                                          | toast, bell dropdown, help popover                           | 6.dp                                                                             | ok (Snackbar) |
| `shadow-xl` + `shadow-primary-400/50` | `0 20px 25px -5px, 0 8px 10px -6px` tinted `#ee9459` 50%                            | **FAB** (`calendar/+page.svelte:636`), bulk bar, mini picker | 8.dp, `spotColor = P400.copy(.5f)`                                               | new           |
| `shadow-2xl`                          | `0 25px 50px -12px /.25`                                                            | bottom sheets, action menu                                   | 12.dp                                                                            | new           |
| scrim                                 | `bg-black/40 backdrop-blur-sm` (sheets, modals); `bg-slate-900/30` (toolbar sheets) | `DayActionSheet.svelte`; `CalendarToolbar.svelte` backdrop   | **new** `FpColors.scrim` = black 40%, `scrimSlate` = S900 30% (Android: no blur) | new           |

### 1.7 Motion

| Web                               | Value                                                                      | Source                                                   | Compose                                                       |
| --------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| standard transition               | 150 ms `cubic-bezier(.4,0,.2,1)`                                           | `theme.css:146-147` `--mp-motion`, `--mp-ease`           | **new** `FpMotion.Standard = tween(150, FastOutSlowInEasing)` |
| page fade-in                      | 100 ms                                                                     | `calendar/+layout.svelte:270`                            | `fadeIn(tween(100))` on tab switch                            |
| mobile menu slide                 | 200 ms                                                                     | `NavbarMobileMenu.svelte:29`                             | `expandVertically(tween(200))`                                |
| bell dropdown slide; banners fade | 150 ms                                                                     | `NotificationBell.svelte`; `calendar/+layout.svelte:153` | 150                                                           |
| sheet swipe-to-close              | close if drag > 100 px; release animates 150 ms ease-out; handle-only drag | `bottomSheetSwipe.ts:15,39`; `DayActionSheet.svelte:51`  | `FpSheet`                                                     |
| month swipe nav                   | month view only; \|dx\| > 60 and \|dx\| > 1.5·\|dy\|; left = next          | `calendarView.ts:118-121`; `Calendar.svelte:443-452`     | `detectHorizontalDragGestures`                                |
| task complete "celebrate"         | scale 1 → 1.02 → 1 over 450 ms ease; skipped when reduce-motion is on      | `tasks/+page.svelte` `<style>`                           | `animateFloatAsState`                                         |
| press                             | `active:scale-[0.97]` toolbar, `active:scale-95` FAB / `[0.98]` buttons    | `CalendarToolbar.svelte`; `calendar/+page.svelte:636`    | `Modifier.pressScale()`                                       |
| reduced motion                    | all animation → 0.01 ms                                                    | `app.css:13-21`                                          | honour `Settings.Global.ANIMATOR_DURATION_SCALE == 0`         |
| toast auto-dismiss                | 6000 ms; at most 4 stacked (keeps the last 3, then appends)                | `src/lib/client/toasts.ts:14,18`                         | **fix**: Snackbar `Short` = 4 s, single                       |
| "Sent again ✓"                    | visible 3000 ms                                                            | `calendar/+layout.svelte:126`                            | 3 s                                                           |
| offline "Synced N changes"        | 4000 ms; recount 2000 ms after reconnect                                   | `OfflineBanner.svelte:73-86`                             | —                                                             |

### 1.8 Icons

All icons are 24-unit **stroke** icons: `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap/linejoin="round"`. Port each path verbatim to `res/drawable/ic_fp_*.xml`.

| Icon                                                                                                               | Path source                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Tab: Calendar, Dashboard, Tasks, Shop, Alerts, Family                                                              | `src/lib/utils/navItems.ts:41,46,51,57,62,68`                                                                                  |
| Mark (navbar)                                                                                                      | `brand/Mark.svelte:52-55` (rect 3,4,18,18 rx2; M8 2v4; M16 2v4; M3 10h18). Navbar size 32 dp (`Navbar.svelte:81`), login 20 dp |
| Hamburger / close                                                                                                  | `Navbar.svelte:155,164` (`M4 6h16M4 12h16M4 18h16`, `M6 18L18 6M6 6l12 12`)                                                    |
| Bell                                                                                                               | `NotificationBell.svelte:180` (same path as the Alerts tab)                                                                    |
| Month / Week / List view glyphs (**filled** paths)                                                                 | `CalendarToolbar.svelte:90-102`                                                                                                |
| Add `M12 4v16m8-8H4` (stroke 2.5 on FAB, 32 dp)                                                                    | `calendar/+page.svelte:640`                                                                                                    |
| Select (clipboard-check), Filters (`M3 5h18M6 12h12M10 19h4`), Search, Import, Print, Dashboard grid, Settings cog | `CalendarToolbar.svelte` (action strip, 16 dp)                                                                                 |
| Chevrons `M15 19l-7-7 7-7` / `M9 5l7 7-7 7`                                                                        | `DayNav.svelte`                                                                                                                |
| Recurring `M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3m2 9a8 8 0 01-14 3` (purple-400)                                   | `MonthDayCell.svelte:276`                                                                                                      |
| Illustrations (SVG assets)                                                                                         | `src/lib/assets/svgs/{calendar-note-date,todo-list,family,big-family}-svgrepo-com.svg` → `res/drawable` (vector)               |

### 1.9 Lane 1 deliverable for tokens

Lane 1 brings `docs/guides/android-design-tokens.md` up to date with every **new** and **fix** row above, citing the same sources. Each new Kotlin token carries a KDoc comment naming its `file:line`. `WebThemeTest` grows one assertion per new token.

---

## 2. Screens

The 14 screen sections:

- §2.1 App shell
- §2.2 Calendar (month / list / week / day, sheets, modals, quick-add, bulk)
- §2.3 Day Dashboard
- §2.4 Tasks
- §2.5 Groceries
- §2.6 Alerts
- §2.7 Families list
- §2.8 Family detail
- §2.9 Family invitations
- §2.10 Create family and add member
- §2.11 Family tasks
- §2.12 Account
- §2.13 Sign-in and sign-up
- §2.14 Secondary pages (Stats, Archive, Report a Bug, Import, Print)

Each section has:

- **Layout tree**
- **Components and copy**
- **States**
- **Interactions**
- **Data/API**
- **Current Android gap**
- **Acceptance** (numbered `AC-<area>-n`)

### 2.1 App shell

**Layout tree (signed in, < 768 px)**: `calendar/+layout.svelte:139-287` and `(family)/+layout.svelte`.

```
Column(fill)
├─ StatusBarStrip #dd5822                         (native, #291)
├─ Navbar  (white/95, bottom rule slate-200, 76 dp)      Navbar.svelte:74-182
│   ├─ Mark 32dp primary-600 + "Family Planz" text-xl bold slate-800 (tap → Calendar tab)
│   └─ Hamburger 44dp rounded-lg slate-600 (toggles "Open menu"/"Close menu")
├─ NavbarMobileMenu (when open; slides 200ms; pushes content)  NavbarMobileMenu.svelte:29-115
├─ BannerStack (0..2 rows, full width)            calendar/+layout.svelte:143-265
│   ├─ OfflineBanner
│   └─ one of: claimed ✅ | verify-email form | merged ✅ | guest (amber / urgent red)
├─ Content (per tab; fade-in 100ms)
├─ FAB (Calendar tab only)                         calendar/+page.svelte:628-643
├─ Toaster (bottom edge 80dp above the safe-area bottom; clears the 52dp tab bar)  Toaster.svelte:11-49
└─ BottomNav (6 tabs, white/95, top rule)          BottomNav.svelte:121-180
```

**Components and copy**

- **BottomNav**:
  - Items in this order (`navItems.ts:35-70`), with labels: **Calendar**, **Dashboard**, **Tasks**, **Shop** (aria-label "Groceries"), **Alerts**, **Family**.
  - Grid of equal columns, `min-h-[52px]`, `py-2.5`, `gap-0.5` (`BottomNav.svelte:142`).
  - Icon wrapper: `h-7 rounded-full` with **no horizontal padding** (`:145`). On → `bg-primary-50 text-primary-600`. Off → `text-slate-400`.
  - Icon 20 dp.
  - Label: 11 sp medium, truncate. On → primary-600. Off → slate-500 (`:171`).
  - Alerts badge (`:164`): `bg-primary-600`, 10 sp semibold white, min 16 dp, `-right-1 -top-1`, "99+" cap. Content description "Alerts (N unread)".
  - Active tab = longest-prefix match (`navItems.ts:83-91`).
  - The bar hides (opacity 0, not removed) while the IME is open: visual viewport is more than 150 px shorter than the window (`BottomNav.svelte:93-102`).
  - Badge refreshes on mount, on every route change and on app resume (`:40-77`).
- **NavbarMobileMenu** (`NavbarMobileMenu.svelte`):
  - Panel: white, top rule, `px-3 py-3`, rows spaced 4.
  - First row (right-aligned): NotificationBell 44 dp.
  - Nav rows (Calendar, Dashboard, Tasks, Groceries, Family — `loggedInNavItems` drops only the bell-replaced Alerts, `navItems.ts:73`): `rounded-lg px-3 py-2.5 text-base font-medium`. Active → `bg-primary-100 text-primary-700`. Else slate-600.
  - Divider, then secondary rows `text-sm slate-600 px-3 py-2`: **Settings** → Account, **Task Stats**, **Archive**, **Report a Bug**. Admin only: **Admin**, **Bug Reports**.
  - Divider, then a full-width **Logout** button: `rounded-lg bg-primary-600 py-2.5 text-base font-medium white` (`:89-95`).
  - Any navigation closes the menu (`Navbar.svelte:25-28`, #253).
  - Note: Alerts is not a menu row; the bell at the top of the menu stands in for it. That is the web's `loggedInNavItems`; clone it.
- **NotificationBell** dropdown (inside the menu; `NotificationBell.svelte:174-310`):
  - Panel: `w-80 max-w-[100vw-2rem] rounded-xl border shadow-lg py-2`. Title "Notifications".
  - States: "Loading…"; "Couldn't load notifications." + **Retry**; empty "No notifications yet — all quiet on the home front."
  - List rows: glyph disc 24 dp in the notif tone, title and meta. Unread rows `bg-slate-50`.
  - Footer: **Mark all read**, and the push block. On Android the push block is the native permission banner (§0.5); the web push copy does not apply.
  - Badge in the bell is `bg-red-500` (`:190`). The tab badge is primary-600. Both are cloned as-is.
- **Toaster**:
  - Region `bottom-20` (80 dp) `px-4`, column gap 8, max width 384 dp.
  - Toast: `rounded-xl border-slate-200 bg-white px-4 py-3 text-sm slate-800 shadow-lg`.
  - Optional action: `text-xs font-semibold primary-600 px-2.5 py-1 rounded-lg`, e.g. **Undo**.
  - Dismiss ✕: 14 dp slate-300, label "Dismiss notification".
  - Auto-dismiss 6 s. Up to 4 toasts stack.
- **OfflineBanner** (`OfflineBanner.svelte:59-85`):
  - Offline: "You're offline — showing your recent events and tasks (this month, last month, next month). Months or tasks you haven't visited recently aren't available offline. Changes you make now will sync automatically when you're back online."
  - Pending: "{N} change(s) waiting to sync." (bold).
  - After sync: "Synced {N} change(s)." for 4 s.
  - Android maps "offline" to `ConnectivityManager` and "pending" to its own write queue (`TaskCache` and new queues).
- **Calendar-group banners** (`calendar/+layout.svelte:149-263`). Precedence: claimed → verify → merged → guest.
  - Claimed: "✅ Email added — your calendar now syncs across devices." + ✕.
  - Verify:
    - Copy: "Your email isn't verified yet — enter the code we sent to unlock family features like member search."
    - Code field: "Verification code", centred, tracking 0.2em, `max-w-40`.
    - **Verify** button: primary, 44 dp; reads "Verifying…" while busy.
    - **Resend**: underlined; then shows the "Sent again ✓" mint pill for 3 s.
    - ✕ dismisses.
    - Errors: "Invalid code" / "Verification failed — check your connection and try again." / "Couldn't resend the code — try again." / "Couldn't resend the code — check your connection."
  - Merged: "✅ Brought over {n} event(s)[ and {m} task(s)] from your guest calendar."
  - Guest (anonymous), normal: "You're using a guest calendar — your events can't sync to other devices. **Add an email to save them** (deleted after 90 days of inactivity)".
  - Guest, ≤ 14 days left (red): "⚠️ Guest calendar — inactive accounts are deleted after 90 days. **{d} day(s) left.** Save your data with an email".
  - Days left = 90 − days since `lastActiveAt` (`:51-58`).
  - The banners show on the Calendar, Dashboard, Tasks, Groceries and Alerts tabs (the `(calendar)` group). They do **not** show on Family or Account.

**States**: the badge falls silent on fetch failure (stays 0). Logout: `POST /api/mobile/auth/logout`, then local sign-out (existing).

**Interactions**:

- Tapping a tab while on that tab keeps its sub-state. Web tabs are links, so they reload the route: tapping returns to the tab root and scrolls to top.
- The Calendar tab opens `/calendar?dashboardView=1`, which bypasses the "dashboard default view" redirect (`navItems.ts:37-41`).
- The Mark/wordmark goes to `/` on the web (marketing). On Android it selects the Calendar tab (Q4).

**Data/API**:

- `GET /api/notifications` → `unreadCount` (exists).
- Banners need `isAnonymous`, `emailVerified` and `lastActiveAt` → **GAP G1** (`GET /api/me` extension).
- Verify and resend → **GAP G12**.
- Claimed/merged come from web query params after web-only flows; Android shows them only after G13 (claim).

**Current Android gap**:

- 2 tabs (Tasks, Calendar), in the wrong order.
- The tab pill has 16/4 padding; the tab is 56 tall, not 52.
- No Navbar, hamburger, menu or bell. `FpHeader` is 56 dp, has a 24 dp mark and a slate-900 title, and carries "Stop focus" and a cog that _signs out_.
- No OfflineBanner.
- Guest banner copy differs (`GuestNote.kt`). No verify, claimed or merged banners.
- Snackbar: 4 s, one at a time, Material action style.
- One slate-50 canvas for all screens.

**Acceptance**

- AC-SH-1: The tab bar shows exactly 6 tabs labelled Calendar, Dashboard, Tasks, Shop, Alerts, Family, in that order. Shop's content description is "Groceries".
- AC-SH-2: The selected tab's icon sits in a 28 dp-tall primary-50 pill, tinted primary-600, with a primary-600 label. Unselected: icon slate-400, label slate-500. Measured: tab ≥ 52 dp tall, icon 20 dp, label 11 sp.
- AC-SH-3: With 3 unread notifications the Alerts icon carries a primary-600 badge reading "3". With 120 unread it reads "99+".
- AC-SH-4: The badge refetches on app resume and after any tab change.
- AC-SH-5: With the IME open, the tab bar is invisible and not clickable. It is visible again within one frame of IME close.
- AC-SH-6: The header is 76 dp tall (±2) under the status strip. It shows a 32 dp primary-600 Mark, "Family Planz" in 20 sp bold slate-800, and a 44 dp hamburger at the end.
- AC-SH-7: The hamburger opens the menu with a 200 ms expand. The menu has the bell, nav rows Calendar / Dashboard / Tasks / Groceries / Family, then Settings / Task Stats / Archive / Report a Bug, then a full-width primary "Logout".
- AC-SH-8: Admin-role users also see "Admin" and "Bug Reports". Other users do not.
- AC-SH-9: Selecting any menu row or any tab closes the menu.
- AC-SH-10: In the menu, the current destination row is primary-100 / primary-700.
- AC-SH-11: Logout calls `/api/mobile/auth/logout` and returns to the sign-in screen.
- AC-SH-12: A toast's bottom edge sits 80 dp above the bottom safe-area inset, clear of the tab bar. It is a white card with 12 dp corners, a slate-200 border and slate-800 14 sp text, and has a ✕ "Dismiss notification".
- AC-SH-13: A toast disappears after 6 s ± 0.2 s. Four toasts can be visible at once; a 5th evicts the oldest.
- AC-SH-14: A toast with an action ("Undo") runs the action and dismisses itself on tap.
- AC-SH-15: In airplane mode the amber-100 offline banner with the verbatim offline sentence appears under the header on the Calendar, Dashboard, Tasks, Groceries and Alerts tabs. It pushes content down and never overlaps it.
- AC-SH-16: With 2 queued writes the banner reads "2 changes waiting to sync.". After reconnect and flush it reads "Synced 2 changes." for 4 s, then disappears.
- AC-SH-17: An anonymous account sees the amber guest banner with the verbatim copy. The "Add an email to save them" link opens the claim flow (G13).
- AC-SH-18: An anonymous account with `lastActiveAt` 80 days ago sees the red variant reading "10 days left.".
- AC-SH-19: A registered user with `emailVerified=false` sees the verify banner. A correct code clears it. A wrong code shows the server error text under the form.
- AC-SH-20: Banners do not render on the Family tab or the Account screen.
- AC-SH-21: Calendar, Dashboard, Groceries and Alerts paint a white canvas. Tasks, Family, Account and Sign-in paint slate-50.

### 2.2 Calendar (`/calendar`)

Sources:

- `routes/(calendar)/calendar/+page.svelte`
- `components/calendar/{Calendar,CalendarToolbar,MonthView,MonthDays,MonthDayCell,DayActionSheet,DayEventsModal,ListView,WeekView,WeekHeader,WeekHourGrid,WeekAllDayRow,DayView,DayHeader,DayAllDayList,DayHourGrid,EventModal*,EventFormModal,Event*Fields,EventQuickAdd,ChecklistSection,TaskDetailModal,TaskDetailBar,BulkEditBar,FirstRunCard,DailyVerseCard,CalendarKey,ExitSelectionAsk}.svelte`
- `components/calendar/MODALS_SPEC.md`

**Layout tree**

```
Column (white canvas, pb 112)
├─ [FirstRunCard]  (no events + not dismissed)          FirstRunCard.svelte
├─ [warning alert] "Couldn't load {x, y} just now — everything else is up to date."  +page.svelte:551-555
├─ [not-found alert] "Event not found — it may have been deleted, or you don't have access to it."
└─ CalendarCard  (mx 12, rounded-3xl, slate-200 border, white, shadow-sm)   Calendar.svelte:471-475
    ├─ CalendarToolbar (px16 py12, gap 8, bottom rule)                       CalendarToolbar.svelte:185
    │   ├─ Row A (full width, centred): DateNav pill = [Month YYYY ▾][Today][‹][›]   (DayNav.svelte:48-52)
    │   ├─ Row B: [View toggle: ▦ ▥ ☰ (icons only)] [Add +] [Select] … [≡ actions 44dp]
    │   └─ Row C: Search field "Search events, places, notes…" [+ "N of M" + Clear when query]
    └─ Body (p 12; month swipe area)
        ├─ ["Downloading this month…"]
        ├─ [DailyVerseCard]                     (if verse visible)
        ├─ one of: FilterEmpty | SearchEmpty | AssigneeEmpty | MonthView | WeekView | DayView | ListView
        └─ CalendarKey (legend)
FAB 64dp (bottom 96, end 24) — hidden in selection mode
BulkEditBar (selection mode, bottom 56, width −24)
Sheets: MiniMonthPicker (popover) · Actions menu (top sheet) · Filters (bottom sheet) · DayActionSheet ·
        DayEventsModal · EventModal (detail) · EventFormModal (create/edit) · TaskDetailModal · ExitSelectionAsk
```

**Toolbar** (`CalendarToolbar.svelte:185-560`)

- DateNav is one pill: `rounded-xl border-slate-200 bg-white shadow-sm`, 40 dp high.
  - Leading segment: the month label button, `px-3 py-2.5`, 18 sp bold tracking-tight slate-900, text `MMMM yyyy`.
  - **Today** (`px-3.5`, 14 sp semibold slate-700). Opacity 50% when already on the current period, and it stays enabled (`DayNav.svelte`).
  - ‹ and › are 44 × 40, slate-500, with labels "Previous period" / "Next period".
- Mini picker (on label tap): `w-64` popover, `rounded-xl shadow-xl p-4`.
  - Year row: ‹ year › with labels "Previous year" / "Next year".
  - 3 × 4 grid of `MMM` buttons. Current month is `bg-primary-600 text-white`.
- View toggle: track `rounded-xl bg-slate-100 p-1 shadow-sm`; segments `h-10 px-3 rounded-lg`. Selected `bg-white slate-900 shadow-sm`; else slate-500.
  - On phone the labels are screen-reader only. Content descriptions: Month / Week / List.
  - **There is no Day button.** Day is reached from the day sheet, the cell tap in selection mode, or a dashboard link.
- **Add** toggle (range-select mode, #047) and **Select** toggle: `h-10 rounded-xl border px-3`, icon only on phone. On → `border-primary-300 bg-primary-50 text-primary-700`. Off → `border-slate-200 text-slate-400`. Titles: "Add by dragging a time range" / "Select events to edit in bulk".
- Actions ≡ (44 dp, `rounded-xl border shadow-sm`, label "Calendar actions") opens a **top sheet** (`fixed left-2 right-2 top-2 rounded-2xl shadow-2xl`, scrim slate-900/30).
  - Close ✕ "Close calendar actions".
  - Rows (`min-h-11 text-base slate-700 rounded-lg`): **Filters** (only when there is something to filter), **Import**, **Print**, **Day dashboard**, **Calendar settings** (`:130-137`).
  - Android: Import and Print open the web page in a Custom Tab (Q5). Day dashboard → Dashboard tab at the current date. Calendar settings → Account › Calendar.
- Filters sheet (`:615-805`):
  - Bottom sheet `rounded-t-3xl max-h-88vh`, grab handle 40 × 4 slate-300, title "Filters", ✕ "Close calendar filter".
  - Section "CALENDARS" (11 sp semibold uppercase tracking-wide slate-400) with **Hide all** / **Show all**.
  - Calendar rows: colour dot 12 dp, name, and a 28 × 16 switch (on = primary-600). Off rows: `bg-slate-50`, line-through slate-400, dot 30% opacity.
  - Footnote: "Hidden calendars drop their events and their due tasks from every view. This is a reading filter — new events still go to your default calendar."
  - Section "ASSIGNEE" with **Show everyone** when any are hidden. Rows: 24 dp avatar (avatar palette), name, count. Off → "–".
  - Empty: "Nobody has anything on this calendar yet, so there is nobody to filter by. The people who put something here will show up."
  - Footnote: "Switched-off people drop their events and their due tasks from every view. The number is what is left on the calendar now, so a 0 is why the grid is empty."
  - The badge on the Filters trigger is the hidden count, `bg-slate-700` 18 dp.
  - Hidden calendar and assignee sets persist **per user** (web: localStorage keyed by user id, `Calendar.svelte:310-330`; Android: DataStore).
- Search filters all views by title, location and notes. While searching it shows "{n} of {total}" or "No matches", and a **Clear** button.

**Month view** (`MonthView.svelte`, `MonthDays.svelte`, `MonthDayCell.svelte`)

- Weekday header: `Sun…Sat`, rotated so it starts on **Monday when `settings.weekStart == 'monday'`** (`MonthView.svelte:28-34`). Text 12 sp semibold uppercase tracking-wide slate-500, padding 8.
- 7 columns, **gap 0 on phone** (`sm:gap-2` is off). Leading and trailing days of the adjacent months are drawn.
- Cell (`MonthDayCell.svelte:81-90`): **fixed height 72 dp**, radius 14, border, `px-2 pt-2 pb-2.5`.
  - Today: `border-primary-300 bg-primary-50/40` + inset 1 dp `ring-primary-200`.
  - Other month: `border-slate-100 bg-slate-50/50`.
  - Weekend (Sat/Sun, this month): vertical gradient `#f8f6f3 → white`.
  - Else white.
  - The whole cell is the tap target ("Open {date}").
- Content flows in wrap order:
  - Day disc 28 dp, 13 sp bold. Today: primary-600 fill, white text. Other month slate-400. Else slate-600.
  - Up to **3 event chips**: min height 18, `rounded-md bg-white px-1`, 11 sp medium, `chipShell(density:'glyph')` style, plus the ChipKindMark, the title truncated, then the creator and attendance badges. RSVP badge 9 sp.
  - Up to **2 task chips**: dashed border, slate-600, red-600 when overdue, recurring icon.
  - Excess is clipped. A separate row shows "+{n} more": 18 sp medium slate-600, min 32 × 44, opening DayEventsModal.
  - The per-cell + and dashboard tools are hover-only and **absent on phone** (`:103-158`).
  - Chips are not individually tappable on phone (`inert`); the cell tap wins. In **selection mode** chips become toggles (checkbox square 12 dp, primary ring when selected).
- Cell tap (not selection) → **DayActionSheet**. In selection mode → Day view (`MonthDays.svelte:96-108`).
- Swipe left/right on the body changes month (§1.7).
- The visible month loads through `GET /api/events?from&to`. Each month loads once. "Downloading this month…" shows while it loads.

**DayActionSheet** (`DayActionSheet.svelte`)

- Bottom sheet, `rounded-t-2xl`, max 92% height, scrim black/40.
- Grab handle 40 × 6 slate-200; drag the handle down > 100 px to close. Escape and scrim tap also close.
- Header `px-4 py-3`, bottom rule: "EEEE, MMMM d", 18 sp bold slate-900, ✕ 44 dp "Close".
- When the day has events: a list capped at 30% of the viewport height, divided rows `px-4 py-3`, each with:
  - ChipKindMark (word density)
  - title 14 sp medium slate-800
  - RSVP pill "{icon} {label}", creator badge, attendance badge
  - "{start} – {end}" 12 sp slate-500 and " · by {creator}"
  - a chevron
  - Tapping a row closes the sheet and opens EventModal.
- Four action rows (`rounded-xl border p-4 py-3.5 text-sm medium slate-700`, 36 dp icon disc):
  - **Add event**: disc primary-100 / primary-700. Opens EventFormModal pre-dated.
  - **Open Day Dashboard**
  - **View this day's events**: opens DayEventsModal.
  - **Open Day View**
  - The last three have slate-100 / slate-600 discs.

**DayEventsModal** (`DayEventsModal.svelte`)

- Title: the formatted date, 20 sp bold.
- Event cards, then a "TASKS" kicker with task rows reading "Completed" or "Due task — tap for details".
- Close label: "Close day events overlay".

**List view** (`ListView.svelte`)

- Shows the current month, grouped by day.
- Sticky day heading: 14 sp semibold slate-500 (primary-600 when today), "EEEE, MMMM d", plus a "Today" pill (`bg-primary-100 text-primary-700 text-xs`).
- Event card: `rounded-xl border-slate-200 bg-white p-4 gap-4`.
  - 4 × 48 colour bar in `chipColor(event)`.
  - Title in medium slate-900.
  - RSVP, creator and attendance pills.
  - Meta row 14 sp slate-500: calendar dot and name when there are 2+ calendars, ChipKindMark word, clock "start - end", pin with location (max 150 dp, truncated).
  - Chevron.
- Task card: dashed, `bg-slate-50`, title slate-700, ChipKindMark, purple "🔁 every {n} {unit}s".
- Empty: the `todo-list` illustration at 96 dp and 80% opacity, plus "A whole month of nothing. Suspicious. Add something fun?" (`:100`).

**Week view** (`WeekView.svelte` etc.)

- On a phone the grid keeps a **700 dp minimum width with horizontal scroll** (`WeekView.svelte:333-335`). Swipe does not change week (#048).
- Hour rows are 60 dp; the grid is 24 × 60.
- Event blocks: `rounded bg-white px-1 py-0.5` 12 sp, laid out by lane.
- All-day row above (`WeekAllDayRow.svelte`).
- Range-select popover: "−15", "+15", "Create", "✕".

**Day view** (`DayView.svelte`, `DayHeader.svelte`, `DayHourGrid.svelte`)

- Header: Back 44 dp bordered button, then "EEEE, MMMM d" 20 sp semibold slate-900, then the "Today" pill.
- All-day list, then the hour grid: **56 dp per hour** (`DayView.svelte:55`), hour labels 10 sp medium slate-400.
- On open, auto-scrolls to the current hour − 1 (today) or 07:00 (`DayHourGrid.svelte:48-54`).
- Red now-line (`bg-red-400`).
- Event blocks `rounded-md border-slate-200 bg-white shadow-sm`, 11 sp semibold.
- Range-select on touch (`src/lib/utils/rangeSelect.ts:104-151`):
  - Default: a **long-press** (450 ms, `rangeSelect.ts:45`) selects a one-hour block from the pressed minute. A finger move of more than 10 px before the press fires cancels it as a scroll.
  - **Add** mode: a drag selects at once, and the grid stops scrolling (`touch-action:none`).
  - Either way the popover offers −15 / +15 / Create / ✕, each 44 dp. The end never comes closer than 15 min to the start.
- Drag-to-move an event is HTML5 `draggable` (`DayHourGrid.svelte:174`), so it is **desktop-only**, and there is no move gesture on a phone. Errors from moves elsewhere appear as a red 12 sp line.
- Empty: "Nothing scheduled. A free day is a gift — or add something fun." plus a primary **Add event** button.
- Back returns to the previous view.

**Empty states (all views)** (`Calendar.svelte:547-665`)

- Every calendar hidden:
  - Kicker "FILTERED"; h2 "Every calendar is hidden".
  - Body: "{names} is/are hidden. Nothing is drawn until you turn one back on — your events and due tasks are all still here."
  - Button **Show all calendars**.
- Search empty:
  - Kicker "SEARCHING"; "Nothing matches “{q}”".
  - Body: "Nothing on this calendar matches those words. Everything is still here — only the view is narrowed."
  - Button **Clear search**.
- Assignee empty:
  - Kicker "FILTERED".
  - Title: "Nothing for {name} in this view" / "Nothing left in this view", with the matching body text.
  - Button **Show everyone**.
- Layout for all three: icon 48 dp slate-300, kicker 11 sp semibold, title 18 sp medium slate-700, body 14 sp slate-500, button `rounded-lg bg-primary-600 px-4 py-2.5`.
- First run (`FirstRunCard.svelte` + `EmptyState.svelte`):
  - `rounded-2xl bg-primary-50/50 px-6 py-8`, calendar-note illustration 112 dp.
  - "Blank calendar!" with "Add your first thing — or start from ✨ Smart tasks."
  - Button **Browse ✨ Smart tasks** → Tasks tab.
  - ✕ dismiss.

**Loading**: a skeleton of the card. A 40 × 256 bar, then a 7 × 6 grid of 72 dp `rounded-[14px] bg-slate-100` pulsing cells with gap 6 (`+page.svelte:532-544`).

**Error**: red alert "Couldn't load your events." with a **Retry** link (`+page.svelte:603-610`).

**EventModal** (event detail; `EventModal.svelte` + parts)

- Bottom sheet `rounded-t-2xl` with grab handle, swipe to close.
- Header: 12 dp colour dot, title 18 sp bold truncated, purple "🔁 Repeats {rule}", export menu (**Add to Google** / **Add to .ics**), ✕.
- Detail list:
  - icon tiles 32 dp `rounded-lg bg-slate-100`
  - "EEEE, MMMM d, yyyy", then "All day" pill or "h:mm a - h:mm a"
  - calendar name
  - "Created by {name}"
  - location
  - "Reminder: {text}"
  - description in a `rounded-xl bg-slate-50 p-4` box
- Recurrence card: "This is a repeating event".
- **Your RSVP** segmented control: **Going** (green-600) / **Maybe** (yellow-500) / **Can't go** (red-600), each with a count pill. Hint "tap again to clear".
- Attendee groups "Who is going". Loading skeleton: 3 + 2 pill bars.
- Checklist section: "Add a task..." / **Done**.
- Footer bar:
  - Delete (icon, red), Duplicate (icon, bordered), Edit (icon, primary, flex).
  - Confirm panels: "Delete this event?" / "Delete the whole series?" / "Delete just this one?", plus attached-task warning "⚠️ {n} attached task(s) will also be deleted.", buttons **Delete**/"Deleting…" and **Cancel**.
  - Duplicate panel: "Duplicate this event?" / 'A copy titled "{t} (copy)" will be created.'
- Copy source: `EventModalBar.svelte`.

**EventFormModal** (create/edit; `EventFormModal.svelte`, `EventModalShell.svelte`, MODALS_SPEC.md)

- Bottom sheet with a **gradient header** primary-500 → primary-600 (`EventModalShell.svelte`).
  - Title: "Create New Event" / "Add Task" / "Edit Event".
  - Subtitle primary-100: "Type naturally, we'll fill in the rest" / "A completable item — no event needed".
- Create mode has an **Event | Task** segmented control.
- Event, create:
  - **Quick Add** (placeholder "Lunch Friday at noon with John", spinner, **Clear**).
  - Multi-detect panel: "{n} events detected" + **Create {n} events** / **Just the first**.
  - Parse failure: "Couldn't check that with the parser just now — fill the fields below manually."
  - "Parsed wrong? Report this phrase".
  - **Event Title\*** with ✓ when detected.
  - **Description**.
  - **Show More** / **Show Less**.
  - All day / Multi-day pill toggles.
  - Repeat select (Doesn't repeat / Daily / Weekly / Monthly / Yearly + "every N unit(s)").
  - Reminder select (No reminder / 15 min / 30 min / 1 hour / 2 hours / 1 day before).
  - Start Date / End Date; Start Time / End Time with "End must be after start".
  - Location (LocationSearch).
  - Attendees (AttendantPicker).
  - Calendar picker (only with 2+ calendars).
  - Checklist.
- Task tab: Task Title\* (placeholder 'e.g., Pay water bill — or try "#private tomorrow @family"'), Visibility select, Due Date, Category.
- Edit: all fields, plus a "This event repeats — save changes for: This event only / All events in series" card.
- Action bar: [Delete (edit)] Cancel, Clear (create event), and primary **Create** / **Add Task** / **Update** ("Creating..." / "Adding..." / "Updating..."). Disabled until valid.
- Quick Add appears only when AI parsing is enabled in settings (MODALS_SPEC.md "Quick Add visibility").

**FAB** (`+page.svelte:628-643`)

- 64 dp circle, primary-600, white + 32 dp stroke 2.5, `shadow-xl shadow-primary-400/50`, bottom 96, end 24, press scale 0.95.
- Label "Quick Add Event". Opens EventFormModal in create mode, dated today.

**TaskDetailModal** (task chip tap): "Task Details", the title, chips (Family, visibility, priority), and the TaskDetailBar: **Skip occurrence**, **Delete** → "Yes, delete" / **Cancel**, primary **Mark complete** ("Working…").

**Bulk selection** (`BulkEditBar.svelte`; `+page.svelte:181-280`)

- Select toggles selection mode and hides the FAB.
- Bar: `fixed bottom-14 left/right 12 rounded-xl border p-3 shadow-xl`.
- Left: "{n} selected" pill (primary-50 / primary-700).
- Phone collapses the tools behind **More tools** / **Less tools**: Calendar… select, Location… + **Set**, "+ Attendant…" + **Add**, the smart instruction "e.g. 'move all to next friday'" + **✨ Smart…**.
- Always visible: **Delete** (red outline), **Done**.
- Delete confirm: "Delete {n} event(s)? Attached checklists go too." **Yes, delete** / **Cancel**.
- Smart plan panel: "PLANNED CHANGES — REVIEW, THEN APPLY", bullet list; past-date warning "Some of these changes move events to past dates." **Apply anyway** / **Go back**; **Discard** / **Apply {n} change(s)**.
- Toasts:
  - "Deleted {n} event(s)."
  - "Moved {n} event(s) to {cal}."
  - "Location updated on {n} event(s)."
  - "Attendant added to {n} event(s)."
  - "Applied {n} change(s) to your events."
- Moving an event while in selection mode first asks via ExitSelectionAsk.

**Toasts** (`+page.svelte:470-490`): "Event deleted." / "Couldn't delete the event — try again." / "Couldn't delete the event — check your connection and try again."

**Data/API**

| Need                                                                           | Endpoint                                                | Status                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------- |
| events in range (expanded, RSVP, attendance, creator)                          | `GET /api/events?from=&to=`                             | exists                                       |
| create / update / delete (+ `scope`, `occurrenceDate`)                         | `POST /api/events`, `PUT/DELETE /api/events/{id}`       | exists                                       |
| RSVP                                                                           | `GET/POST /api/events/{id}/rsvp`                        | exists                                       |
| bulk + smart plan (`ops`, `dryRun`, `plan`)                                    | `POST /api/events/bulk`                                 | exists                                       |
| parse NL                                                                       | `POST /api/parse-event`                                 | exists                                       |
| report phrase                                                                  | `POST /api/report-phrase`                               | exists                                       |
| checklist                                                                      | `GET /api/tasks?eventId=`, `POST/PUT/DELETE /api/tasks` | exists                                       |
| ICS export                                                                     | `GET /api/events/{id}/ics`                              | exists                                       |
| location suggestions                                                           | `GET /api/location-search`                              | exists                                       |
| attendee suggestions                                                           | `GET /api/family/member-search?q=`                      | exists                                       |
| calendar list + colours (personal + family)                                    | —                                                       | **GAP G2**                                   |
| settings (weekStart, defaultView, defaultCalendarId, autoParse/AI flags, zone) | —                                                       | **GAP G3**                                   |
| family roster                                                                  | —                                                       | **GAP G4** (in `/api/me` or `/api/families`) |
| due tasks with calendarId                                                      | `GET /api/tasks` (lacks `eventCalendarId`)              | **GAP G5** (add field)                       |
| sponsored events                                                               | —                                                       | **GAP G6**                                   |
| daily verse                                                                    | —                                                       | **GAP G7**                                   |
| task categories                                                                | `GET /api/task-categories`                              | exists                                       |

**Current Android gap**:

- Default view is List; the web phone opens on **Month** (`calendarView.ts:51-90`, #119).
- The grid is hard-wired to Monday-first. It draws no adjacent-month days and no chip titles (dots and bars only), shows no "+N more", has no 72 dp fixed cells, and has a gap of 4 (web 0).
- Missing:
  - week and day grids, and the real list view
  - DayActionSheet, DayEventsModal
  - EventModal (detail, RSVP, delete, duplicate, export, checklist)
  - EventFormModal (the current QuickAddPanel is a different form with different copy)
  - FAB
  - search, filters, mini picker, Today, swipe-nav
  - selection and bulk, range-add
  - daily verse, sponsored events, legend, first-run card
  - calendar colours, weekStart
  - every empty, loading and error state above
- Toolbar copy "Prev" / "Next" and the "List / Month" text toggle differ from the web.

**Acceptance**

- AC-CAL-1: On first open on a phone with no `?view` deep link, the Month view shows, even if the stored or default view is week or day.
- AC-CAL-2: With `weekStart=monday` the header reads Mon…Sun. With `sunday` it reads Sun…Sat.
- AC-CAL-3: Adjacent-month days render in slate-50/50 cells with slate-400 discs.
- AC-CAL-4: Every cell is exactly 72 dp tall whatever its event count. A day with 6 events and 3 tasks shows 3 event chips, 2 task chips and "+4 more".
- AC-CAL-5: Today's cell has a primary-300 border, a primary-50/40 wash and a primary-600 disc with white text. Weekend cells of the current month show the #f8f6f3 → white gradient.
- AC-CAL-6: An event chip shows its kind mark and its truncated title in 11 sp. A task chip is dashed, and red text when overdue.
- AC-CAL-7: Tapping a cell (not in selection mode) opens the DayActionSheet titled "EEEE, MMMM d", with the day's events and the 4 action rows in the order Add event, Open Day Dashboard, View this day's events, Open Day View.
- AC-CAL-8: Dragging the sheet handle down 101 dp closes it; 99 dp springs back in 150 ms.
- AC-CAL-9: Tapping "+N more" opens DayEventsModal with every event and task of that day.
- AC-CAL-10: A horizontal fling of 61 dp on the month body (with dy < dx/1.5) changes month; left goes to next. The same fling in week view does not.
- AC-CAL-11: The month label opens the mini picker. Picking "Mar" shows March of the shown year. Year arrows change the year.
- AC-CAL-12: "Today" is at 50% opacity on the current month and returns to today's month from any other month.
- AC-CAL-13: The view toggle shows three icon-only segments (Month, Week, List) with the selected one white on slate-100. There is no Day segment.
- AC-CAL-14: The ≡ actions menu lists Filters, Import, Print, Day dashboard, Calendar settings. Each row is ≥ 44 dp.
- AC-CAL-15: Filters is a bottom sheet titled "Filters" with CALENDARS and ASSIGNEE sections and both footnotes verbatim.
- AC-CAL-16: Hiding a calendar removes its events and due tasks from every view. The trigger badge shows the hidden count. The choice survives an app restart.
- AC-CAL-17: Hiding every calendar replaces the grid with the "Every calendar is hidden" empty state; "Show all calendars" restores it.
- AC-CAL-18: Typing "dentist" in search narrows every view, shows "N of M" and Clear. With no hits the "Nothing matches “dentist”" state shows.
- AC-CAL-19: List view groups by day with sticky headings and a Today pill. An empty month shows the todo-list illustration and the verbatim "A whole month of nothing…" line.
- AC-CAL-20: Week view on a 390 dp screen scrolls horizontally inside a 700 dp-wide grid, and the page does not scroll horizontally.
- AC-CAL-21: Day view opens scrolled to (now − 1 h) for today and 07:00 otherwise, at 56 dp per hour, with the red now-line on today.
- AC-CAL-22: Day view with no items shows "Nothing scheduled. A free day is a gift — or add something fun." and an Add event button that opens the create form for that date.
- AC-CAL-23: In Add mode, dragging over 09:00–10:00 in Day view shows the range popover. "+15" extends the end to 10:15. "Create" opens the form with 09:00–10:15. Outside Add mode, a long-press at 14:00 selects 14:00–15:00. A press that moves more than 10 px scrolls instead.
- AC-CAL-24: Tapping an event opens EventModal with the date line, time, calendar name, location, reminder and description as given.
- AC-CAL-25: RSVP "Going" turns the segment green-600 with white text and increments its count. Tapping again clears it to undecided. The server gets `POST /api/events/{id}/rsvp`.
- AC-CAL-26: Delete on a recurring occurrence asks "Delete just this one?" or "Delete the whole series?" according to the chosen scope. Confirming sends `DELETE` with that scope and toasts "Event deleted.".
- AC-CAL-27: Duplicate asks "Duplicate this event?" and creates "{title} (copy)".
- AC-CAL-28: The FAB is a 64 dp primary circle at bottom-end above the tab bar. It opens "Create New Event" with today's date, and it is absent in selection mode.
- AC-CAL-29: Quick Add "Lunch Friday at noon with John" fills title, date and start time, and marks them ✓ (via `/api/parse-event`). A parser failure shows the amber fallback line.
- AC-CAL-30: Create stays disabled until Title and Date are set and end is not before start. With an invalid end the hint "End must be after start" shows.
- AC-CAL-31: The Task tab in the create form posts `POST /api/tasks` and closes. A `#private` tag in the title overrides the visibility select.
- AC-CAL-32: Selection mode: chips toggle with a checkbox square. The bar shows "{n} selected" and Delete / Done, with "More tools" revealing Calendar, Location, Attendant and ✨ Smart.
- AC-CAL-33: Bulk delete of 3 asks "Delete 3 events? Attached checklists go too." and toasts "Deleted 3 events.".
- AC-CAL-34: A smart instruction shows the purple plan list. A plan that moves events into the past shows the red warning with "Apply anyway" / "Go back".
- AC-CAL-35: While a month's range loads, "Downloading this month…" shows above the grid.
- AC-CAL-36: First load shows the pulsing skeleton. A load failure shows "Couldn't load your events." with Retry.
- AC-CAL-37: A partial failure (e.g. tasks) shows the amber "Couldn't load tasks just now — everything else is up to date." while events still render.
- AC-CAL-38: With the verse enabled, the amber DailyVerseCard ("DAILY VERSE", italic text, reference) renders above the grid.
- AC-CAL-39: Sponsored events (when the user has opted in) render with the amber #f59e0b colour and the "ad" kind mark.
- AC-CAL-40: A brand-new user with no events sees the "Blank calendar!" first-run card. ✕ hides it permanently.

### 2.3 Day Dashboard (`/calendar/dashboard?date=`)

Sources: `routes/(calendar)/calendar/dashboard/+page.svelte`, `components/dashboard/{DayDashboard,DashboardInfoBand,TodayGlanceCard,TopPrioritiesCard,CompletedTodayCard,FamilyTaskBoardCard,KidsScheduleCard,GroceriesCard}.svelte`, `src/lib/dashboardModules.ts:21-33`. The `DashboardPrototype` variants are dev-only and are not cloned.

**Layout tree** (white canvas, gutter 8, cards stacked with gap 16)

```
Header (wrap, gap 12)
 ├─ "Day Dashboard" (20 bold) / "{cccc, LLLL d}[ · today]" (14 slate-500)
 ├─ DayNav period="day" (Today ‹ ›)
 ├─ [Open Day View] (bordered rounded-lg)   [Back to Calendar] (bordered)
[load-warnings amber card]
[DashboardInfoBand — verse]      (module 'verse')
TodayGlanceCard                  (module 'glance')
TopPrioritiesCard                (module 'top3')
CompletedTodayCard               (module 'completed')
FamilyTaskBoardCard              (module 'board', needs family)
KidsScheduleCard                 (module 'kids', needs family)
GroceriesCard                    (module 'groceries')
```

**Cards and copy.** Every card is `rounded-2xl border-slate-200 bg-white p-4 shadow-sm` with an h2 in 14 sp semibold slate-900.

- **Glance**:
  - Title "Today at a Glance" / "Day at a Glance", plus the date label (12 sp slate-400).
  - All-day rows: `rounded-lg border-slate-100 bg-slate-50/60`, kind mark, title, RSVP pill.
  - Timed rows: a 56 dp right-aligned time column (12 sp semibold tabular; end time 10 sp slate-400), kind mark, title, RSVP and attendance badges, and a cyan "Family" chip for family-source events.
  - Empty: dashed box "No events scheduled today" / "No events scheduled on this day" + "Open day view →".
  - Row tap opens EventModal (from Lane 2).
- **Top-3 Priorities**:
  - "All clear" note when empty: "All clear — nothing needs you right now." + "View all tasks →".
  - Groups "ONE-OFF (n)" and "RECURRING (n)", numbered rows.
  - Each row: check circle 24 dp "Mark done: {title}"; title; "→ {assignee}" amber pill or member name; Family (indigo) or 🔒 Private / 🌐 Public chip; category chip; due pill (dueTone); priority segmented **Low / Normal / High** (44 dp min, current = its tone).
  - Footer "View all tasks →".
- **Completed today**:
  - "Completed today" / "Completed this day".
  - Empty: "Nothing checked off yet — your wins will land here." / "Nothing was completed this day."
  - Otherwise: "{n} win(s)" with n at 24 sp bold emerald-600, and rows with an emerald check and time.
- **Family Task Board**:
  - "{open} open · {n}-week streak" or "Start a streak — check off today's tasks 🔥", plus "Board →".
  - Quick-add MentionInput, placeholder 'Add a family task… try "saturday for Dad"', with ? help and **Add**; a compact CategoryField below.
  - Empty line: "No open family tasks — enjoy the calm 👪."
  - Per-member groups: avatar 20 dp, NAME, "· n". Members with nothing assigned show "nothing assigned".
  - Rows: check, priority dot, title, category, due.
- **Kids' Schedule**:
  - Empty: "No kids' events today — free afternoon!" / "No kids' events this day" + "View family →".
  - Groups per child: avatar 24 dp, name; event rows with the title, uppercase time and location.
- **Groceries**:
  - "{n} open".
  - Empty: "Nothing on the list yet." + "Open the list →".
  - Per scope (Family / Mine): "{LABEL} →" link, "{n} open", store chips, and the first 3 names (`NAMED = 3`, `GroceriesCard.svelte:16`) + ", +k more".
- Load warnings: "Couldn't load {labels} just now — everything else is up to date." The verse failure label is "today's verse".

**States**:

- Loading: 3 pulsing `h-44 rounded-2xl bg-slate-100` blocks, then 3 `h-56` blocks.
- Error: red "Couldn't load the dashboard." + **Retry**.
- A module switched off (user, or family master switch) does not render.

**Interactions**:

- Checking a task: `PUT /api/tasks/{id}` (toggleComplete). The row leaves optimistically, then the dashboard refetches.
- Priority: `PUT {priority}`.
- Board quick-add: `POST /api/tasks` with `familyId` and the @mention assignee.
- ‹ › Today move the date.
- Open Day View → Calendar tab, Day view at that date. Back to Calendar → Calendar tab.

**Data/API**: the whole loader (`dashboard/+page.server.ts:362-405`) is page-only → **GAP G8** `GET /api/dashboard?date=`. Mutations use the existing `/api/tasks`.

**Current Android gap**: the screen does not exist.

**Acceptance**

- AC-DB-1: The Dashboard tab shows the header "Day Dashboard" with the date line "Tuesday, November 3 · today" on today, and DayNav, Open Day View and Back to Calendar.
- AC-DB-2: ‹ shows yesterday and drops "· today". Today returns.
- AC-DB-3: Cards render in the order verse, Glance, Top-3, Completed, Board, Kids, Groceries, single column, with 16 dp gaps.
- AC-DB-4: A user with no family sees no Board or Kids card.
- AC-DB-5: A module switched off in Account › Dashboard is absent.
- AC-DB-6: Glance with no events shows the dashed "No events scheduled today" box and "Open day view →".
- AC-DB-7: Timed rows show the start time over the end time in a 56 dp column.
- AC-DB-8: Top-3 empty shows "All clear — nothing needs you right now.". Otherwise it groups One-off and Recurring with counts.
- AC-DB-9: Tapping a Top-3 check marks the task done (`PUT /api/tasks/{id}`). The row disappears, and Completed today increments without a full reload flash.
- AC-DB-10: Priority "High" on a row sends `priority:'high'` and highlights High.
- AC-DB-11: Completed today with 2 completions shows "2 wins" in emerald.
- AC-DB-12: Board quick-add "take out bins saturday for Dad" creates a family task assigned to Dad, due Saturday.
- AC-DB-13: A member with no tasks still appears with "nothing assigned".
- AC-DB-14: Groceries with 7 family items shows "7 open", store chips and 3 names + ", +4 more" (`NAMED = 3`, `GroceriesCard.svelte:16`).
- AC-DB-15: Loading shows the 6 pulse blocks. Failure shows "Couldn't load the dashboard." with Retry.

### 2.4 Tasks (`/calendar/tasks`)

Sources:

- `routes/(calendar)/calendar/tasks/+page.svelte`
- `components/tasks/{TasksHeader,AddTaskCard,TasksMainList,TaskToolbar,TaskRow,TaskCompletedRow,AssignmentsCard,TaskCategoryManager,EditTaskDialog,CategoryField,CategoryChip}.svelte`
- `components/{MentionInput,TaskQuickAddHelp,TaskQuickAddPreview}.svelte`
- `src/lib/utils/{taskQuickAdd,taskUrgency,taskSort,taskRecurrence,priorityTone}.ts`

**Layout tree** (slate-50 canvas, gutter 12, max width 896)

```
TasksHeader card:  "Tasks" (20 bold) / "{n} task(s) open · {m} completed" (12 slate-400)
[load warnings amber]
AddTaskCard (mt16):  "New task" / "Type a task, or paste a list"  [?]
   MentionInput "Buy milk tomorrow @maya  ·  or paste a list"
   preview line / bulk list
   [Today][Tomorrow][Next week] [date] More/Less ………… [Add|Add N|Confirm N]
   (More) Category · "Who can see this" Private|Public
   ▸ ✨ Smart tasks  (collapsible template groups)
[action error red strip with ✕]
TasksMainList card:  "Your tasks" / "Filter, search, and sort your list"
   "Filter  {n} tasks | {n} of {m} match “q”"
   [Open][Mine][Created by me][Done] | [Every scope][Public][Private][Family]  [Search…] Sort[Urgency▾]
   [# Filter by #tag…]
   time chips: [All n][Overdue n][Today n][Up next n][Done n]
   "Showing … · Filtering by #… · Searching “…”"   (sky-600)
   ONE-OFF (n) rows… · RECURRING (n) rows…
   "All caught up 🎉 / Nothing open right now"
   footer: "· n completed this week"  … Clear completed → "Delete all completed?" Yes, delete / No
AssignmentsCard (if any):  "Assignments  n waiting"  TO ACCEPT (n) · YOU ASKED FOR (n)
TaskCategoryManager:  "Categories · n"  Manage/Hide  → rename/delete rows
EditTaskDialog (modal)
```

**Row anatomy** (`TaskRow.svelte`)

- Container `rounded-lg border px-2.5 py-2 gap-2.5`. Normal `border-slate-100 bg-slate-50/60`; late `border-red-200 bg-red-50`.
- Check circle 20 dp, border-2 slate-300, hit area +8, label "Complete task".
- Title 14 sp medium slate-900, truncated; tap → Edit.
- **One meta line, 20 dp high, no wrap, overflow clipped** (`TaskRow.svelte:168`). Slots in this order, joined by "·" slate-300:
  - due text (bold red-700 when late)
  - "N days late" chip
  - one of: "↻ every {n} {unit}[s][ · done N×]" purple-500, the event title (primary-500 with icon), or the note
  - category chip (teal)
  - #tag chips (sky)
  - priority dot + label (non-normal only)
  - Family chip (indigo)
  - "unassigned"
- Trailing area:
  - Accept/Decline pills, when the task is assigned to me and pending.
  - Otherwise the assignee pill (16 dp avatar, first name, amber "pending").
  - Skip ↻ (recurring): "Skip to next occurrence".
  - Delete trash → inline "Delete?" **Yes** / **No**.
- Completed row (`TaskCompletedRow.svelte`): filled primary-500 check ("Mark incomplete"), line-through slate-400 title, (event), due pill, "every {unit}", muted category and tag chips, delete.
- Empty state (`TasksMainList.svelte`):
  - Icon, then `CHIP_EMPTY[chip]` title and hint (`:86-101`), e.g. "No tasks yet" / "Add your first task above".
  - With filters active: "No matching tasks" / "Try another chip, or clear the search and filters".
  - Time filter with no rows: "Nothing {label} right now. **Show all {n}**".

**Toasts**:

- `"{title}" marked done.`
- `Deleted "{title}".`
- "Completed tasks cleared — fresh start."
- `Accepted "{t}" — it's on your list.` / `Declined "{t}" — sent back to the requester.`
- `Added "{title}".`
- `Couldn't add "{t}" — check your connection.`
- the edit-save message from `saveTaskEdit`
- category rename/delete: `Deleted "{c}" — its tasks are now uncategorized.`

**Interactions**:

- Optimistic complete: the row flips to done at once, the celebrate pop plays, it rolls back with a toast on failure. A recurring task rolls its due date forward (server `toggleComplete`).
- Sort and tag filter persist (`familyplanz:tasksSortBy`, `familyplanz:tagFilter`).
- Owner view: Open / Mine (assignedTo = me) / Created by me (userId = me) / Done (`TaskToolbar.svelte:12-46`).
- Scope chips: Every scope / Public / Private / Family.
- Time chips: from `taskUrgency.ts:21-27`.
- Paste a multi-line list → bulk mode: a checklist of parsed rows (Create / ✕ per row), "Add N" → "Confirm N" → "Adding… k/N".
- Unknown @member blocks the add: "Unknown member @x — check the spelling or pick someone from your family." (bulk variant: "… — fix the spelling before adding.").
- Smart tasks: template groups from `SMART_EVENT_TEMPLATES` / `CATEGORY_META` (imported by `AddTaskCard.svelte`). Tap → creates the task.
- EditTaskDialog fields:
  - Title \*, Notes, Tags (comma), Category
  - Due date, Priority (Low/Normal/High), Repeats + "Every N unit(s)"
  - "Who can see this" (owner only)
  - "Assign to" (Unassigned / Me / members), with "They'll see it as pending until they accept."
  - Hint "Completing it rolls the due date forward automatically."
  - Cancel / Save ("Saving…")
- Category manager: Rename (inline Save / Cancel) and Delete ("Tasks become uncategorized." **Delete** / **Keep**).
- Native-only (kept, §0.5): the Focus action and the "Focusing now" note on rows (#290). They sit in the trailing area before the trash icon.

**Data/API**:

- The web list is `myTasks` (personal + accepted assignments) plus `pendingAssignments` + `requestedByMe` (`tasks/+page.server.ts`; `server/db/actions/tasks/{queries.ts:174,assignment.ts:16,33}`).
- `GET /api/tasks` returns `getTasksForUser` (personal + all family), a **different set** → **GAP G9** `GET /api/tasks/sections`.
- Mutations exist:
  - `POST /api/tasks`
  - `PUT /api/tasks/{id}` (`toggleComplete`, `undoComplete`, `advanceToNext`, `assignmentStatus`, all fields)
  - `DELETE /api/tasks/{id}`
  - `DELETE /api/tasks/completed`
  - `GET/POST /api/task-categories`, `PATCH/DELETE /api/task-categories/{id}`
- Quick-add parsing is **client-side** (`taskQuickAdd.ts`). Port it to Kotlin with the same test vectors (`taskQuickAdd.test.ts`).

**Current Android gap**:

- The list source is `GET /api/tasks` (wrong set).
- Header is "Family Planz" + Stop focus + cog, instead of the TasksHeader card.
- AddTaskBar ("Add a task", Due date, priority chips) instead of AddTaskCard: no paste-list, no quick-date chips, no More, no Smart tasks, no mention preview.
- No toolbar, view/scope/time chips, search, sort, tag filter, One-off/Recurring groups or completed rows.
- No inline delete, skip occurrence, EditTaskDialog, Clear completed, AssignmentsCard or Category manager.
- The meta line **wraps** (web: one line, clipped).
- Empty state uses `FpEmptyState` (primary wash). The web Tasks empty is an icon with text on white inside the list card.

**Acceptance**

- AC-TK-1: The header card reads "Tasks" and "3 tasks open · 5 completed" for 3 open / 5 done.
- AC-TK-2: The list shows exactly the union of my personal tasks and the family tasks I accepted, i.e. `myTasks`. A family task assigned to someone else is absent unless "Created by me" applies to it.
- AC-TK-3: Typing "Buy milk tomorrow @maya" previews "Buy milk · due Tue Nov 4", plus an assignee preview. Add creates the task, toasts 'Added "Buy milk".' and clears the field.
- AC-TK-4: Pasting 3 lines switches to bulk: "3 tasks parsed", per-row Create/✕, and "Add 3" → "Confirm 3" → adds all three.
- AC-TK-5: "@zed" with no member Zed shows the red unknown-member line and disables Add.
- AC-TK-6: Today, Tomorrow and Next week set the due date. "More" reveals Category and the Private/Public select.
- AC-TK-7: ✨ Smart tasks expands; the first category opens by default. Tapping a template creates it.
- AC-TK-8: The owner chips Open, Mine, Created by me and Done filter as defined in `TaskToolbar.svelte:12-46`. The selected chip is slate-900 with white text.
- AC-TK-9: The time chips show counts. A non-zero Overdue chip that is not selected is red-tinted. Selecting Today shows only today's tasks.
- AC-TK-10: Search "milk" shows "1 of 8 match “milk”" in the Filter line.
- AC-TK-11: Sort persists across app restarts. Its options are Urgency, Due date, Priority, Created, Title A–Z.
- AC-TK-12: Tag filter "gro" matches #groceries (prefix). ✕ clears it.
- AC-TK-13: Rows are grouped "ONE-OFF (n)" then "RECURRING (n)".
- AC-TK-14: A task 3 days overdue renders a red-50 row, a bold red due text and a "3 days late" chip.
- AC-TK-15: The meta line never exceeds one 20 dp line: a task with 6 tags clips and does not wrap.
- AC-TK-16: Tapping the check completes the task within 100 ms (optimistic), plays the 1.02 pop and toasts '"X" marked done.'. A server failure restores the row and shows the error.
- AC-TK-17: A completed row shows a filled primary-500 check and a struck-through title. Tapping the check un-completes.
- AC-TK-18: Trash → "Delete?" Yes deletes and toasts 'Deleted "X".'. No cancels.
- AC-TK-19: Skip on a recurring task advances its due date to the next occurrence (`advanceToNext`).
- AC-TK-20: Tapping a title opens Edit Task with every field pre-filled. Save sends only the changed fields and toasts the result.
- AC-TK-21: A task assigned to me and pending shows "✓ Accept" / "✕ Decline". Accept toasts 'Accepted "X" — it's on your list.'.
- AC-TK-22: The Assignments card lists TO ACCEPT and YOU ASKED FOR with Pending / Accepted / Declined status pills. It is hidden when both are empty.
- AC-TK-23: "Clear completed" → "Delete all completed?" → Yes deletes every completed task and toasts "Completed tasks cleared — fresh start.".
- AC-TK-24: Categories · n → Manage → Rename "Work" to "Job" updates every chip. Delete asks first and toasts.
- AC-TK-25: With no tasks the list shows "No tasks yet / Add your first task above". With filters and no hits: "No matching tasks".
- AC-TK-26: The Focus action (#290) still works on open rows and does not displace Accept/Decline.

### 2.5 Groceries (`/calendar/groceries`)

Sources: `routes/(calendar)/calendar/groceries/+page.svelte`, `src/lib/data/groceries.ts` (`SCOPE_FILTERS:389-393`, `STORE_COLOURS:156-200`, `parseGroceryQuickAdd`, `groupGroceriesByStore`).

**Layout tree** (white canvas, gutter 16, py 24; one column on phone, `min-[950px]` is off)

```
"Groceries" (24 bold)
Scope chips [All n][Family n][Mine n]          (slate-900 selected)
[No family yet — join or create one to use the shared list.]
Search "Search items or stores…" (+✕) → "Searching “q”"
Add form:  [Quick-add, e.g. “milk 2”][Add (primary-600)]   "Add to" [Family (shared)|Mine (private)]
           "Store Memory: [Aldi]"   [Store (optional, comma = alternates)]
CHECKED OFF (n) card (session-local)  ✓ rows + Mine/Family tag
STORE COLOURS card  [Everyone|Just me]  rows: dot · store · colour select (6 swatches + Auto)
                    "{n} store(s), 6 swatches. …collision note…"
Items by store:  per store a rounded-2xl card
   bar (store tint): ● Store · "{n} items · {total} total[ · shares {Colour} with …]"  [Colour]
   rows: □ · name ×qty · [MINE|FAMILY] · store chips (primary ring-2, "or", alternates ring-1) · ✎ ⇄ ✕
   inline store edit: "stores, comma-separated" Save / Cancel
```

**Copy**:

- Empty: "No items match “q”." / "Your list is empty. Add the first item." / "The family list is empty. Add the first item." / "No family list yet — join or create a family to use the shared list." / "Both lists are empty. Add the first item."
- Store-colours empty: "No shops yet. Type one on an item and it turns up here with a colour of its own."
- Toasts (`groceries/+page.svelte:214-436`):
  - `Added "{x}" to Mine|Family[ — {store}].`
  - `Checked off "{x}".` with **Undo**
  - `Put "{x}" back on the list.`
  - `Stores updated for "{x}".`
  - `Moved "{x}" to Mine|Family.`
  - `Removed "{x}" — store memory kept.`
  - `{store} is back to its own default colour.`

**Interactions**:

- Typing an item name asks the server for a store suggestion after a debounce (`GET /api/groceries?scope&suggest=1&name=`).
- Check off: optimistic. The item moves to Checked off, and the toast offers Undo.
- ⇄ moves the item between scopes.
- Colour select: `PATCH /api/groceries/colours` with `{store, color, scope}`.

**Data/API**:

- `GET /api/groceries?scope=mine|family`, `POST /api/groceries` `{scope,input,stores}`, `PATCH/DELETE /api/groceries/{id}` `{op,scope,stores,target}`, `GET/PATCH /api/groceries/colours`: all exist.
- `hasFamily` → G1 (`familyId` in `/api/me`).

**Style note (Q2, fixed in #292)**: the page used to use `gray-*`, `bg-black` and an unstyled `border` input. It now uses the §1 tokens: `slate-*` for text, hairlines and borders, `bg-primary-600` (hover `primary-700`) on the Add button, `border-slate-300 bg-white` inputs with `focus:border-primary-500`, `border-slate-200` cards, and `hover:border-primary-500` on checkboxes and chips. Do not add `Gray.*` or `Black` tokens.

**Current Android gap**: the screen does not exist.

**Acceptance**

- AC-GR-1: The Shop tab shows "Groceries", scope chips All / Family / Mine with counts, search, and the add form.
- AC-GR-2: "milk 2" + Add creates "milk ×2" in the chosen scope and toasts 'Added "milk 2" to Family.'.
- AC-GR-3: With a remembered store, "Store Memory: [Aldi]" appears. Tapping it fills the store field.
- AC-GR-4: Items group by primary store. Each group bar wears the store tint and shows "{n} items · {total} total".
- AC-GR-5: Checking an item moves it to "CHECKED OFF (1)" and toasts with Undo. Undo restores it.
- AC-GR-6: ⇄ on a Mine item moves it to Family and toasts 'Moved "x" to Family.'.
- AC-GR-7: ✎ opens the inline store editor. Save "Aldi, Lidl" shows Aldi as the primary chip, then "or Lidl".
- AC-GR-8: ✕ deletes and toasts 'Removed "x" — store memory kept.'.
- AC-GR-9: Store colours: picking "Blue" for Aldi re-tints Aldi's group and chips. Two stores on one swatch get the "shares … with …" note.
- AC-GR-10: A user without a family sees "Mine (private)" only in Add to, and the no-family line under the chips.
- AC-GR-11: Every empty-state string above appears for its condition.

### 2.6 Alerts (`/calendar/notifications`)

Sources: `routes/(calendar)/calendar/notifications/+page.svelte`, `src/lib/utils/notificationTypes.ts`.

**Layout tree** (white canvas, gutter 16, one column on phone)

```
"Alerts" (24 bold) / "{n} unread" | "You're all caught up"
actions: [Delete read alerts] → "Delete n read alert(s)?" [Delete them][Keep them]  ·  [Mark all read]
filter chips (h36, primary-600 selected): All n · Needs you n · Unread n
section "Needs you n" — card list (divided, rounded-xl, shadow-sm)
section "Just news n"
row: unread dot 8 · glyph disc 32 (tone) · "**{actor}** {message}" · [type pill] · relative time
(no side cards: the three developer-note cards were removed on the web, #292)
```

**Copy**:

- Empty: 🔔, "No alerts yet", then "When family members assign you tasks, accept, decline, or complete them — or add you to their family — you'll see it here."
- Filter empty: "Nothing matches this filter."
- Type labels (`notificationTypes.ts` `LABELS`): Asked you / Accepted / Declined / Completed / Added to family / Update.
- Toasts: "Everything marked as read." / "Couldn't mark everything read — try again." / "Deleted {n} read alert(s)." / "Couldn't delete those alerts — try again." / "Couldn't mark that alert read — opening it anyway."
- Side cards ("Five types, one table" / "Never pruned" / "Where it is reachable"): **removed on the web (#292, Q3 resolved as drop)**. Do not build them.

**Interactions**:

- A row tap marks the alert read (optimistic: unread → read styling, badge −1), then opens `link`.
- Map web links to native destinations:
  - `/calendar/tasks…` → Tasks
  - `/family…` → Family
  - `/calendar/event/{id}` → EventModal
  - `/calendar…?date=` → Calendar at that date
  - unknown → Custom Tab
- Unread rows carry a `primary-50 → transparent` horizontal gradient.

**Data/API**: `GET /api/notifications` (`{notifications, unreadCount}`) and `POST /api/notifications` `{id}` | `{all:true}` | `{pruneRead:true}` exist.

**Current Android gap**: no screen. Push notifications open nothing in-app.

**Acceptance**

- AC-AL-1: The Alerts tab title row shows "Alerts" and "{n} unread", or "You're all caught up" at 0.
- AC-AL-2: Rows split into "Needs you" (assignment_pending, assignment_declined) and "Just news".
- AC-AL-3: Each row shows the unread dot, the tone disc with its glyph (? ✓ ✕ ✓ +), bold actor, message, type pill and relative time.
- AC-AL-4: The filter chips All / Needs you / Unread change the visible rows. A filter with no hits shows "Nothing matches this filter.".
- AC-AL-5: Tapping an unread row marks it read (`POST {id}`), decrements the tab badge and navigates to the mapped destination.
- AC-AL-6: "Mark all read" posts `{all:true}` and toasts "Everything marked as read.".
- AC-AL-7: "Delete read alerts" asks "Delete 3 read alerts?". "Delete them" posts `{pruneRead:true}` and toasts "Deleted 3 read alerts.".
- AC-AL-8: The empty account shows the 🔔 empty card with the verbatim copy.

### 2.7 Families (`/family`)

Source: `routes/(family)/family/+page.svelte`, `+page.server.ts:22-158`.

**Layout tree** (slate-50, gutter 12; the rail stacks below the main column on phone)

```
Breadcrumbs: Calendar › Family
Hero card: "Families" / "{n} famil(y|ies) you belong to" / plan pill "{used} of {limit} famil(y|ies) on your plan"
           [Create New Family] | [Upgrade to add families] (at limit → /pricing)
"Your families" card / "Open a family to see members and settings"
   per family: rounded-3xl orange-100 card, orange-50/70→white gradient, p-28, colour glow blob
      avatar 44 (family colour, initial, 800) · name 20/800 · "Family · settings, members and modules"
      dl: MEMBERS n | CREATED date | COLOUR ● #HEX / Not set | OPEN TASKS n   (10/700 uppercase widest)
      roster strip: up to 5 (`ROSTER_STRIP_CAP`, `:24`) 36dp overlapping avatars · "A, B, C +k more" | "No names yet — add a member and this strip fills in."
      [Open family](primary) [Members] [Add a member](canInvite) [Family tasks]   (slate-100, 44dp)
Empty: icon · "No families yet" · "Create a family, then invite the people you share plans with." · [Create Your First Family]
Invitations card: "Get a join link to send, or manage the codes your family already has"
   per invitable family: name · "Join link, good for 10 people" · [Invite by link] → link field + [Copy]/Copied
   errors: mint error (red) · "Copy failed — select the link above and copy it manually."
   rows: "View family invitations ›" · "Family Tasks ›"
Rail (below): per family "MEMBERS  Manage →" rows (32dp avatar, name, memberType, role pill)
```

**Data/API**: the loader and the `mintInvite` action are page-only → **GAP G10a** (`GET /api/families`). Minting can use the existing `POST /api/family/invite` `{familyId, expiresInDays, maxUses}`, but "good for 10 people" needs `maxUses:10` (match the web's `generateInviteCode` defaults).

**Current Android gap**: absent.

**Acceptance**

- AC-FM-1: The Family tab shows the breadcrumb, the "Families" hero and "1 of 2 families on your plan".
- AC-FM-2: At the plan limit the hero CTA is "Upgrade to add families" and opens /pricing in a Custom Tab.
- AC-FM-3: Each family card shows MEMBERS / CREATED / COLOUR / OPEN TASKS with the server values. A colour-less family shows "Not set".
- AC-FM-4: The roster strip shows at most 5 avatars (`ROSTER_STRIP_CAP = 5`) with overlap −8 dp, and "+k more" when there are more members.
- AC-FM-5: Card buttons route to Family detail, detail#members, Add member (only when the user can invite) and Family tasks.
- AC-FM-6: "Invite by link" mints a 10-use code, shows the full join URL and Copy. Copy shows "Copied".
- AC-FM-7: A user with no families sees the "No families yet" empty card with "Create Your First Family".

### 2.8 Family detail (`/family/[familyId]`)

Source: `routes/(family)/family/[familyId]/+page.svelte` (1090 lines; constants `BAND`, `BAND_HEAD`, `BAND_TITLE` at `:62-64`); `+page.server.ts:50-331`.

**Layout tree** (slate-50; bands `rounded-2xl border p-4 shadow-sm`; titles 12 sp semibold uppercase tracking-wide slate-500)

```
Hero (`:308`): family name h1, "You: {role}", [Add member](admin), settings jump
Members band (`:362`): count vs plan, quick links Family Tasks · Groceries, [Add member]
   member rows: avatar, name, role pill, memberType; admin: inline memberType select (Parent/Child/Member);
   role editor (member/admin/[creator]) Edit/Cancel; Remove → confirm; per-row "Actions for {name}" → member sheet
Recent Activity (`:590`) — feed | "No activity yet — complete something to get things moving."
Family Settings (admin, `:621`): name, colour swatches ("Set colour {name}") + hex, help text;
   DAY DASHBOARD MODULES (`:682`) master switches + explanation
Invitations (admin, `:711`)
Rail (below): Shared data (Family tasks · Family calendar) · Active invitation (code, uses, expiry,
   "Send this link to someone" | "No active invitation. Mint a link to bring somebody into this family." [Get a join link])
   · Plan (tier, AI used/limit, families, members, retention, export) · "Children are users" note + "See the form"
Member actions sheet (bottom sheet): memberType select, role select, "Remove member" + confirm
```

Copy: verbatim from `[familyId]/+page.svelte:300-1090`. Errors come from the action `fail()` strings (`+page.server.ts:156-289`), e.g. "Cannot remove the family creator", "Cannot change your own role", "Only the creator can promote to creator".

**Data/API**:

- Page-only → **GAP G10b**:
  - `GET /api/families/{id}`
  - `PATCH /api/families/{id}`
  - `PATCH /api/families/{id}/members/{userId}`
  - `DELETE /api/families/{id}/members/{userId}`
  - `PUT /api/families/{id}/modules/{module}`
- Activity → part of G10b.
- Invite code: `POST /api/family/invite`.

**Acceptance**

- AC-FD-1: Opening a family shows the hero, Members, Recent Activity and the rail bands in the order above, single column.
- AC-FD-2: A plain member sees no Add member, no role/type editors, no Family Settings and no Invitations band.
- AC-FD-3: An admin changes a member's type to Child; the pill updates. On server error the server's message shows inline.
- AC-FD-4: A creator can promote to creator; an admin cannot (no option).
- AC-FD-5: Removing a member asks for confirmation, then removes the row. Removing the creator is not offered.
- AC-FD-6: The member actions sheet opens from the row's actions button and closes on scrim tap or ✕.
- AC-FD-7: Family Settings saves the name and colour. The family colour then tints the family calendar chips in the Calendar tab after refresh.
- AC-FD-8: Switching a Day Dashboard module off hides that card for every member's dashboard.
- AC-FD-9: Active invitation shows the code, "{used}/{max}" and the expiry. Without one it shows the "No active invitation…" copy and (admin) "Get a join link".
- AC-FD-10: An empty activity feed shows "No activity yet — complete something to get things moving.".

### 2.9 Family invitations (`/family/invitations`)

Source: `routes/(family)/family/invitations/+page.svelte` (h1 "Family Invitations" `:159`), loader `+page.server.ts`.

**Contents**:

- Family switcher (from `memberships`) and "Back to Family".
- Non-manager: "Only the family creator or an admin can manage invitations."
- Codes list with an "Active code" label, link, Copy, and the copy-failure line.
- Empty: "Create an invitation to invite new members to your family."
- NEW CODE form: "Valid for", "Max uses", "A use is spent when the link is opened, not when somebody joins."
- REVOKE: "Revoking kills the link for anyone who has not used it yet. …"
- "Add a member" link.

**Data/API**:

- Create, revoke and lookup exist: `POST/DELETE/GET /api/family/invite`. The page already uses them (`:84,117`).
- The list is page-only → G10c `GET /api/families/{id}/invite-codes`.

**Acceptance**

- AC-FI-1: A manager sees every code for the chosen family with its uses and expiry. A member sees the refusal line.
- AC-FI-2: New code with "Valid for 7 days, Max uses 5" creates one (`POST /api/family/invite`), and it appears at the top.
- AC-FI-3: Revoke deletes the code (`DELETE /api/family/invite {code}`), and the row disappears.
- AC-FI-4: The family switcher changes the listed codes.

### 2.10 Create family and add member

Sources: `family/create/+page.svelte` (h1 "Create a Family" `:58`; "One family holds the shared calendar, the tasks and the groceries." `:60`; name placeholder "The Smiths" `:160`; colour help `:194`; "WHAT HAPPENS NEXT" `:239-258`; Upgrade Now `:74`), `create/+page.server.ts` (`default` action: name, color, memberIds); `family/[familyId]/members/add/+page.svelte` (tabs **Find someone** `:95` / **Invite by email** `:104` / **Create a child** `:113`; success "Invite sent" `:60` / "Member Added!" `:66` + "Return to Family"); `components/family/{MemberSearchTab,MemberInviteTab,MemberChildTab,CreateFamilyMemberPicker}.svelte`.

Child-tab copy:

- "email for the child's account"
- "Each child needs their own email address for their account."
- parental consent checkbox `MemberChildTab.svelte:118`

**Data/API**:

- Create is page-only → **G10d** `POST /api/families`.
- Add-member endpoints exist but live **outside `/api`** (`/family/{id}/members/add/{direct,email,email/link,child}`), so Bearer is not honoured → **G10e**: aliases under `/api/families/{id}/members/*`.
- Search: `GET /api/family/member-search?q=&exclude=` exists.

**Acceptance**

- AC-FC-1: Create a Family with name "The Smiths" and a colour creates the family and its calendar, then opens its detail.
- AC-FC-2: At the family limit the form is replaced by the limit notice with "Upgrade Now".
- AC-FC-3: Find someone: typing ≥ 2 characters lists verified users. Add shows "Member Added!" and "Return to Family".
- AC-FC-4: Invite by email sends the email and shows "Invite sent". The link variant shows a copyable link.
- AC-FC-5: Create a child requires first name, last name, a unique email and the consent tick. Server errors ("A valid email is required", "This child is already a member of the family") show inline.

### 2.11 Family tasks (`/family/tasks`)

Source: `family/tasks/+page.svelte` (h1 "Family Tasks" `:211`), `components/tasks/{FamilyTasksList,FamilyOpenTaskRow,FamilyTaskRow,FamilyTaskAddForm,FamilyTaskFilterBar,FamilyCompletedTaskList}.svelte`, `utils/{familyTaskGroups,familyTaskList,familyTaskActions}.ts`.

**Contents**:

- Board grouped by assignee: per-member headed card, h3 15 sp extrabold at `:312`.
- Filter bar, add form (`POST /api/tasks` with familyId), completed list.
- A "Public tasks" tab: members' personal public tasks.

**Data/API**:

- Loader page-only → **G11** `GET /api/families/{id}/tasks` → `{tasks, publicTasks, familyRoster}`.
- Mutations: `/api/tasks`.

**Acceptance**

- AC-FT-1: Opening Family tasks shows one group per member, including members with no tasks.
- AC-FT-2: Adding "mow lawn @Dad" creates a family task assigned to Dad, pending acceptance.
- AC-FT-3: The Public tasks view lists only other members' public personal tasks, never private ones.
- AC-FT-4: Completing a row moves it to the completed list (optimistic, rollback on error).

### 2.12 Account (`/account`)

Sources:

- `routes/(calendar)/account/+page.svelte`
- `components/account/*`
- section list `accountSections.ts:15-26` (**10** sections)
- loader `+page.server.ts:153-197`
- actions `:208-592`

**Layout tree** (slate-50, `px-4 py-8`; reached from menu › Settings, so it is not a tab)

```
Breadcrumbs Calendar › Account
"Account Settings" (24 bold) / "Manage your account settings and preferences" / "‹ Back to Calendar"
Rail card (rounded 20, p16): "SETTINGS" (11/700/uppercase/.08em slate-400)
   rows (rounded 10, 14 semibold): Profile · Your families · Notifications · Calendar · Dashboard ·
   Plan & usage · Email · Security · API Tokens · Danger Zone · Report a Bug   (active primary-50/700)
Identity card: 40dp blush avatar (#FED5CF/#c45e38, 700) · name · email | "No email yet · Save your calendar"
[success green / error red banner]
Section card (rounded 20, p24): one section at a time (hash-addressable)
```

Sections (copy from each component):

- **Profile Information**: First Name, Last Name. → `updateProfile`.
- **Your families**: list with role and member count. Empty: "You belong to no families yet. Create one to share calendars, chores and the kids' schedule."
- **Notifications**: per-preference toggles (`setNotificationPreference`) + "See the alerts".
- **Calendar Settings**:
  - Week start (Sunday/Monday), Time Zone, Default view (Day / Week / Month / List / Dashboard (Day Dashboard)), Default calendar ("None (use first available)"), colour, sync to family calendar.
  - SMART EVENT CREATION toggle.
  - DAILY VERSE toggle + translation.
  - SPONSORSHIP toggle with the consent trail ("No ad consent recorded yet — the trail begins when the setting is first changed.").
  - → `saveCalendarSettings`.
- **Dashboard modules**: per-module switches (labels from `dashboardModules.ts:21-33`), plus the Meals note.
- **Subscription** ("Plan & usage"): plan, limits table, Family Master upsell, "See Plans & Pricing", "Join Waitlist".
- **Email Address**: Email field. → `updateEmail` (verification).
- **Security**: "Log out from all devices except the current one. This will invalidate all other sessions." → `logoutAllDevices`.
- **API Tokens**: explanation, name "Token name (e.g. TaskFocus laptop)", create (shown once), list, Revoke.
- **Export your data 👪** (download via `GET /api/account/export`) and **Danger Zone** → Delete Account → "Enter your user ID to confirm" → `deleteAccount`.

**Data/API**: all page loads and form actions → **GAP G3** (settings), **G14** (profile, email, sessions, tokens, delete, dashboard modules, notification prefs, subscription). Export exists.

**Current Android gap**: absent. The cog on Tasks currently signs out.

**Acceptance**

- AC-AC-1: Menu › Settings opens Account with the rail listing the 10 sections plus Report a Bug in the order given, and the identity card below.
- AC-AC-2: Tapping a rail row shows that section's card. The deep links `account#calendar` (from the Calendar actions menu) and `#api` open those sections.
- AC-AC-3: Profile saves first and last name. The navbar menu and the identity card update.
- AC-AC-4: Calendar settings: changing Week start to Monday makes the month grid start on Monday (AC-CAL-2).
- AC-AC-5: Default view saves through G3 and round-trips: re-opening Account › Calendar shows the saved value. What the app opens on for `dashboard` follows the ruling on Q6.
- AC-AC-6: Turning the daily verse off removes it from the Calendar and the Dashboard.
- AC-AC-7: The sponsorship toggle records consent, and the trail lists the new row with a timestamp.
- AC-AC-8: Dashboard modules: switching off "Kids' Schedule" hides that card for this user only.
- AC-AC-9: Email change shows the server's verification message in the green banner.
- AC-AC-10: "Log out all devices" leaves the current app token working and revokes the others.
- AC-AC-11: API Tokens: creating "Laptop" shows the plaintext once. Revoke removes it. The Android token itself appears as "Android — {device}".
- AC-AC-12: Delete Account requires typing the exact user id. On success the app returns to sign-in.
- AC-AC-13: An anonymous account's identity card reads "No email yet · Save your calendar" and links to claim.

### 2.13 Sign-in and sign-up (`/login`, `/signup` on mobile)

Sources: `(marketing)/login/+page.svelte`, `(marketing)/signup/+page.svelte`, `components/auth/{AuthCard,AuthInput,ModeToggle}.svelte`, `(marketing)/login/loginMessages.ts`.

**Layout tree** (slate-50, `px-4 pt-10 pb-16`, centred)

```
[Mark 20dp primary + "Family Planz" 18/700 slate-800]  (link home)
AuthCard (max 448, rounded-2xl, border, white, p-32, shadow-sm)
  h1 "Welcome Back" | "Create Account" (30/700 tight)
  sub "Don't have an account? Sign up or start planning with no account needed." |
      "Already have an account? Log in …"
  [notice green] [error red with icon]
  ModeToggle (slate-100 track rounded-xl p4; 44dp segments): Password | Email Link
  Password: Email · Password ("Forgot your password?" right) · [Login | Logging in...]
  Email Link: Email · [Send Login Link | Sending...]
  Code step: blue tile icon · "Check Your Email" · "We've sent a login code to {email}" ·
             "Login code" (centred) · [Login] · "Didn't receive the code? Resend" + "Sent again ✓"
  ─────
  [Start planning — no account needed]  (pill, slate-300 border, 48dp)
  "Creates a private calendar on this device. Add an email later to sync."
Signup adds: First Name · Last Name · Email · Password · Confirm Password · [Create Account | Creating Account...];
             Email-link: First/Last/Email · [Send Verification Link]; code step "Verify Code | Verifying..."
```

**Android adaptation**: "Email Link" sends an **8-digit code**, not a clickable link (`/api/mobile/auth/email`). Keep the web labels and show the code step. "Forgot your password?" → G12 or a Custom Tab (Q7).

**Data/API**:

- Login (password / code) and guest exist (`/api/mobile/auth/*`).
- Password **sign-up** has no mobile endpoint → **G12**.
- Forgot password → **G12**.

**Current Android gap**:

- Copy differs everywhere: "Email me a code", "Use password instead", "Create an account" / "I already have an account", "Continue without an account", "Wrong email?", the "{n}-digit code" label.
- No Password | Email Link toggle. No signup name fields. No password signup.
- Header is "Family Planz" in titleMedium inverseSurface, not 18/700 slate-800 with a 20 dp Mark.
- The "Advanced → API token" block is native-only and is kept (§0.5).

**Acceptance**

- AC-AU-1: Signed out, the app shows the login card titled "Welcome Back" with the verbatim subline and the Password | Email Link toggle, Password first.
- AC-AU-2: A wrong password shows the red alert with the server's "Email or password is incorrect".
- AC-AU-3: Email Link → "Send Login Link" → "Check Your Email" step naming the email. An 8-digit code + Login signs in. Resend shows "Sent again ✓".
- AC-AU-4: "Sign up" switches to "Create Account" with name fields. Email-link signup verifies with "Verify Code".
- AC-AU-5: Password signup (after G12) creates the account and lands on Calendar with the verify banner (AC-SH-19).
- AC-AU-6: "Start planning — no account needed" creates a guest session and lands on Calendar with the guest banner.
- AC-AU-7: The submit button is a 48 dp primary-600 pill. Disabled state is slate-200 / slate-500.

### 2.14 Secondary pages (from the menu)

| Page                         | Web source                                                               | Android v1      | API                                                             |
| ---------------------------- | ------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------- |
| Task Stats `/calendar/stats` | `stats/+page.svelte` ("Task stats", "Recently completed", "This month")  | native screen   | **G15** `GET /api/stats` (loader `stats/+page.server.ts:42-53`) |
| Archive `/calendar/archive`  | `archive/+page.svelte`                                                   | native screen   | **G16** `GET /api/archive` (loader `:134-138`, plan gate)       |
| Report a Bug `/report-bug`   | `report-bug/+page.svelte` ("Report a Bug" / "Thanks — report submitted") | native form     | `POST /api/bug-report` exists                                   |
| Import `/calendar/import`    | file upload + preview                                                    | Custom Tab (Q5) | —                                                               |
| Print `/calendar/print`      | fridge print                                                             | Custom Tab (Q5) | —                                                               |
| Admin, Bug Reports           | admin only                                                               | Custom Tab      | —                                                               |

- AC-SP-1: Menu › Task Stats shows the streak, "Recently completed" and "This month" from G15.
- AC-SP-2: Menu › Archive lists past events within the plan's retention, or the plan-gate copy.
- AC-SP-3: Menu › Report a Bug submits to `/api/bug-report` with the current screen as `from`, and shows "Thanks — report submitted".
- AC-SP-4: Import, Print, Admin and Bug Reports open the web page in a Custom Tab, signed in (see Q5 on how a web session is obtained).

---

## 3. Server API gaps (proposed contracts)

All of these:

- live under `/api/` (so Bearer works)
- use `requireUserJson`
- return `401 {"error":"Unauthorized"}` / `500 {"error":"…"}` as in the universal table (`task-api-spec.md:21-31`)
- reuse the loader's own server functions (no second query dialect)
- are documented in `docs/guides/task-api-spec.md` by Lane 0
- ship with `*.server.test.ts` beside each route

| #    | Method + path                                                                                                    | Request                                                                                                                                                                                                                                                         | Response (modelled on)                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Used by                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| G1   | `GET /api/me` (**extend**, additive)                                                                             | —                                                                                                                                                                                                                                                               | `{id, firstName, lastName, email: string\|null (null = anonymous), emailVerified, isAnonymous, roles: string[], lastActiveAt, familyId: string\|null}` (`calendar/+layout.server.ts:6-30`, `isAnonymousAccount`)                                                                                                                                                                                                                                                                           | shell banners, groceries `hasFamily`, admin menu               |
| G2   | `GET /api/calendars`                                                                                             | —                                                                                                                                                                                                                                                               | `{calendars:[{id, name, color, kind:'personal'\|'family'}]}`. Personal first, named "Personal Calendar", colour `settings.color ?? '#fa8072'`. Family calendar named `family.name`, colour `family.color ?? '#e0ffff'` (`calendar/+page.server.ts:106,141-231`)                                                                                                                                                                                                                            | calendar chips, filters, form picker                           |
| G3   | `GET /api/me/settings`, `PATCH /api/me/settings`                                                                 | PATCH: any subset of `{weekStart, timeZone, color, defaultView, defaultCalendarId, syncEventsToFamilyCalendar, autoParseEventDetails, showDailyVerse, verseTranslation, showAdsAsEvents}` (fields of `saveCalendarSettings`, `account/+page.server.ts:209-320`) | `{settings:{…}, verseTranslations:[{id,label,attribution}], consentHistory:[{decision, recordedAt}]}` (`account/+page.server.ts:144-187`). PATCH with only `timeZone` replaces the non-API `/calendar/setUserDefaultTimeZone` (`calendar/+layout.svelte:17-47`)                                                                                                                                                                                                                            | calendar, account                                              |
| G4   | `GET /api/family/roster`                                                                                         | `?familyId` (default: mine)                                                                                                                                                                                                                                     | `{familyId, members:[{userId, firstName, lastName, email, role, memberType}]}` (`getFamilyRoster`)                                                                                                                                                                                                                                                                                                                                                                                         | calendar filters, attendee picker, tasks @mention, edit dialog |
| G5   | `GET /api/tasks` (**extend**)                                                                                    | —                                                                                                                                                                                                                                                               | add `eventCalendarId: string\|null` per task (`calendar/+page.server.ts:244-263`)                                                                                                                                                                                                                                                                                                                                                                                                          | due-task chips per calendar                                    |
| G6   | `GET /api/sponsored-events?month=YYYY-MM`                                                                        | —                                                                                                                                                                                                                                                               | `{events:[Event & {isAd:true, color:'#f59e0b'}]}`; `[]` unless `shouldServeAds(settings)` (`calendar/+page.server.ts:188-198,320`)                                                                                                                                                                                                                                                                                                                                                         | calendar                                                       |
| G7   | `GET /api/daily-verse?date=YYYY-MM-DD`                                                                           | —                                                                                                                                                                                                                                                               | `{verse:{reference, text, attribution}\|null}`. `null` unless `dashboardVisibility(...).needs('verse')` (`calendar/+page.server.ts:199-215`)                                                                                                                                                                                                                                                                                                                                               | calendar, dashboard                                            |
| G8   | `GET /api/dashboard?date=YYYY-MM-DD`                                                                             | —                                                                                                                                                                                                                                                               | `{zone, dayISO, isToday, meId, familyId, modules, dailyVerse, taskCategories, data:{userTasks, familyTasks, familyMembers, dayEvents, top3, glance:{doneToday, openToday, weekStreak}, completedToday, kidsSchedule, familyGroceries, mineGroceries}, warnings:string[]}`. This is the dashboard loader verbatim (`dashboard/+page.server.ts:362-405`), with the streamed promise resolved. Extract the loader body into `src/lib/server/services/dashboardData.ts` and call it from both. | dashboard                                                      |
| G9   | `GET /api/tasks/sections`                                                                                        | —                                                                                                                                                                                                                                                               | `{myTasks:[Task+tags], pendingAssignments:[…], requestedByMe:[…], warnings:string[]}` (`tasks/+page.server.ts:41-64`)                                                                                                                                                                                                                                                                                                                                                                      | tasks                                                          |
| G10a | `GET /api/families`                                                                                              | —                                                                                                                                                                                                                                                               | `{families:[{id,name,color,createdAt,memberCount,openTasks,members:[{firstName,userId}],canInvite,role}], roster:[{familyId,userId,firstName,lastName,role,memberType}], activeInvites:[{familyId,code,useCount,maxUses,expiresAt}], plan:{used,limit}}` (`family/+page.server.ts:22-102`)                                                                                                                                                                                                 | families list, account › families                              |
| G10b | `GET /api/families/{id}`                                                                                         | —                                                                                                                                                                                                                                                               | `{family, members, currentUserRole, currentUserId, activity, moduleSwitches, hiddenDashboardModules, activeInvite, inviteCreatedBy, planUsage}` (`[familyId]/+page.server.ts:50-117`). 403 when not a member.                                                                                                                                                                                                                                                                              | family detail                                                  |
|      | `PATCH /api/families/{id}`                                                                                       | `{name?, color?}`                                                                                                                                                                                                                                               | `{success:true, family}`; errors from `updateFamily`                                                                                                                                                                                                                                                                                                                                                                                                                                       |                                                                |
|      | `PATCH /api/families/{id}/members/{userId}`                                                                      | `{role?: 'creator'\|'admin'\|'member', memberType?: 'parent'\|'child'\|'member'}`                                                                                                                                                                               | `{success:true}`; same 400/403 messages as `updateRole` / `setMemberType` (`:183-251`)                                                                                                                                                                                                                                                                                                                                                                                                     |                                                                |
|      | `DELETE /api/families/{id}/members/{userId}`                                                                     | —                                                                                                                                                                                                                                                               | `{success:true}`; `403 "Cannot remove the family creator"` (`:161-181`)                                                                                                                                                                                                                                                                                                                                                                                                                    |                                                                |
|      | `PUT /api/families/{id}/modules/{module}`                                                                        | `{enabled:boolean}`                                                                                                                                                                                                                                             | `{success:true}` (`toggleDashboardModule`, `:270-290`)                                                                                                                                                                                                                                                                                                                                                                                                                                     |                                                                |
| G10c | `GET /api/families/{id}/invite-codes`                                                                            | —                                                                                                                                                                                                                                                               | `{canManageInvites, codes:[{code,useCount,maxUses,expiresAt,createdBy,createdAt}]}` (`invitations/+page.server.ts`)                                                                                                                                                                                                                                                                                                                                                                        | invitations                                                    |
| G10d | `POST /api/families`                                                                                             | `{name, color?, memberIds?:string[]}`                                                                                                                                                                                                                           | `201 {family:{id,…}}`; `403` at limit with the `canCreateFamily` reason (`create/+page.server.ts:55-157`)                                                                                                                                                                                                                                                                                                                                                                                  | create family                                                  |
| G10e | `POST /api/families/{id}/members/{direct\|email\|email/link\|child}`                                             | the bodies of the existing `/family/{id}/members/add/*` handlers                                                                                                                                                                                                | the same responses                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | add member                                                     |
| G11  | `GET /api/families/{id}/tasks`                                                                                   | —                                                                                                                                                                                                                                                               | `{tasks, publicTasks, familyRoster, taskCategories}` (`family/tasks/+page.server.ts:8-46`)                                                                                                                                                                                                                                                                                                                                                                                                 | family tasks                                                   |
| G12  | `POST /api/mobile/auth/signup`                                                                                   | `{firstName,lastName,email,password,deviceName?}`                                                                                                                                                                                                               | `200 {token, user}` with `emailVerified:false` + code sent (mirrors `/signup/password`)                                                                                                                                                                                                                                                                                                                                                                                                    | sign-up                                                        |
|      | `POST /api/mobile/auth/forgot`                                                                                   | `{email}`                                                                                                                                                                                                                                                       | `200 {sent:true}` always (no enumeration, #245)                                                                                                                                                                                                                                                                                                                                                                                                                                            | sign-in                                                        |
|      | `POST /api/me/verify-email`, `POST /api/me/verify-email/resend`                                                  | `{code}` / —                                                                                                                                                                                                                                                    | `{success:true}` / `400 {"error":"Invalid code"}` (mirrors `/signup/password/{verify,resend}`)                                                                                                                                                                                                                                                                                                                                                                                             | verify banner                                                  |
| G13  | `POST /api/me/claim`                                                                                             | `{email}`                                                                                                                                                                                                                                                       | `{sent:true}`. Sends the web claim link (`claim/+page.server.ts` `request` action)                                                                                                                                                                                                                                                                                                                                                                                                         | guest banner, identity card                                    |
| G14  | `PATCH /api/me/profile`                                                                                          | `{firstName,lastName}`                                                                                                                                                                                                                                          | `{success:true,user}` (`updateProfile`)                                                                                                                                                                                                                                                                                                                                                                                                                                                    | account                                                        |
|      | `POST /api/me/email`                                                                                             | `{email}`                                                                                                                                                                                                                                                       | `{success:true,message}` (`updateEmail`)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                                |
|      | `POST /api/me/sessions/revoke-others`                                                                            | —                                                                                                                                                                                                                                                               | `{success:true, revoked:n}`. Keeps the calling token (`logoutAllDevices`)                                                                                                                                                                                                                                                                                                                                                                                                                  |                                                                |
|      | `GET /api/me/api-tokens`, `POST /api/me/api-tokens {name}` → `{token, record}`, `DELETE /api/me/api-tokens/{id}` | —                                                                                                                                                                                                                                                               | (`listTokensForUser`, `createApiToken`, `revokeApiToken`)                                                                                                                                                                                                                                                                                                                                                                                                                                  |                                                                |
|      | `DELETE /api/me`                                                                                                 | `{confirmation: userId}`                                                                                                                                                                                                                                        | `{success:true}` (`deleteAccount`)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                |
|      | `PUT /api/me/dashboard-modules`                                                                                  | `{hidden: string[]}`                                                                                                                                                                                                                                            | `{success:true}` (`saveDashboardModules`)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |                                                                |
|      | `GET /api/me/notification-preferences`, `PUT /api/me/notification-preferences/{id}`                              | `{value:boolean}`                                                                                                                                                                                                                                               | (`setNotificationPreference`)                                                                                                                                                                                                                                                                                                                                                                                                                                                              |                                                                |
|      | `GET /api/me/subscription`                                                                                       | —                                                                                                                                                                                                                                                               | `{subscription, planLimits, aiUsage, planPricing}` (`account/+page.server.ts:188-191`)                                                                                                                                                                                                                                                                                                                                                                                                     |                                                                |
| G15  | `GET /api/stats`                                                                                                 | —                                                                                                                                                                                                                                                               | `{stats, streak, completionIso, todayIso, month, doneBy, roster}` (`stats/+page.server.ts:42-53`)                                                                                                                                                                                                                                                                                                                                                                                          | stats                                                          |
| G16  | `GET /api/archive`                                                                                               | —                                                                                                                                                                                                                                                               | `{events, archiveAllowed, …gate}` (`archive/+page.server.ts:60-138`)                                                                                                                                                                                                                                                                                                                                                                                                                       | archive                                                        |

Already sufficient, no change: `/api/events*`, `/api/parse-event`, `/api/report-phrase`, `/api/tasks*` (except G5), `/api/task-categories*`, `/api/groceries*`, `/api/notifications`, `/api/family/{invite,join,member-search,search}`, `/api/location-search`, `/api/bug-report`, `/api/account/export`, `/api/devices`, `/api/taskfocus/commands*`, `/api/mobile/auth/*`.

---

## 4. Implementation lanes

Six lanes; only S1a is a hard sequencing point. File ownership is exclusive: a lane edits only its own paths. A change another lane needs goes through that lane, or into the lane's own package.

Package root: `apps/android/app/src/main/kotlin/com/familyplanz/app/` (below: `app/`). Tests mirror it under `app/src/test/kotlin/...`.

| Lane                                  | Owns (exclusive)                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Delivers                                                                                                                                        | Depends on                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L0 Server APIs**                    | `src/routes/api/{me,calendars,family/roster,sponsored-events,daily-verse,dashboard,tasks/sections,families,stats,archive}/**`, `src/routes/api/mobile/auth/{signup,forgot}/**`, edits to `src/routes/api/{me,tasks}/+server.ts` (G1, G5), new `src/lib/server/services/{dashboardData,familyData,accountData}.ts` (loader bodies extracted), the matching `+page.server.ts` files **only** to call the extracted service (no behaviour change), `docs/guides/task-api-spec.md` | G1–G16 with tests. Web parity: the existing page tests stay green.                                                                              | none; start now                                                                                                                                                                                                                                                                                                                         |
| **L1 Shell + theme**                  | `app/ui/theme/**`, `app/ui/FpComponents.kt`, `app/ui/FamilyPlanzHost.kt`, `app/ui/PhoneTab.kt` (→ 6 destinations), new `app/ui/shell/**` (Navbar, MobileMenu, NotificationBell, BottomNav, Toaster host, OfflineBanner, BannerStack, FpSheet, Scrim, Motion), new `app/ui/nav/**` (routes, deep-link mapping for alert links), `app/MainActivity.kt`, `app/res/drawable/ic_fp_*` (icons), `docs/guides/android-design-tokens.md`, `WebThemeTest`                               | §1 tokens; §2.1; shared `FpSheet` (handle, 100 px swipe-close), `FpToast` (6 s, stack 4, action), `FpKicker`, filter-chip and banner components | **S1a** (first, small PR): split `AppViewModel` into `SessionViewModel` (session, snack, guest flags; owned by L1) + `TasksViewModel` (owned by L3); add entry stubs `ui/{calendar,dashboard,tasks,groceries,alerts,family,account}/*Entry.kt` with `@Composable fun XEntry(nav: AppNav)`. After S1a merges, every other lane branches. |
| **L2 Calendar**                       | `app/ui/calendar/**` (move `CalendarScreen`, `CalendarMonthGrid`, `CalendarToolbar`, `CalendarViewModel`, `QuickAdd*`, `CalendarActions` here), new event detail / form / day sheet / bulk, `app/data/{EventSource,EventDto,QuickParseDto,CalendarSource}.kt`, `app/domain/{CalendarEvent,EventDraft}.kt`, a port of `chipVocabulary.ts` / `eventChip.ts` to `ui/calendar/chips/**`                                                                                            | §2.2, and `EventSheet` (EventModal) as a public composable for L4                                                                               | S1a; L0 G2, G3, G4, G5, G6, G7 (develop against fakes until merged)                                                                                                                                                                                                                                                                     |
| **L3 Tasks**                          | `app/ui/tasks/**` (move `TaskListScreen`, `TaskRow*`, `AddTaskBar`→`AddTaskCard`, `TaskCreation`, `CategoryPicker`, `Focus*`, `TaskActions`), `TasksViewModel`, `app/data/{TaskApi,TaskSource,TaskDto,TaskCache,TaskRepository,TaskCategorySource}.kt`, `app/domain/{Task,FocusTime}.kt`, a port of `taskQuickAdd.ts` / `taskUrgency.ts` / `taskSort.ts` / `taskRecurrence.ts` to `domain/tasks/**`                                                                            | §2.4; public `TaskRowCompact` and `MentionField` for L4 and L5                                                                                  | S1a; L0 G9, G4                                                                                                                                                                                                                                                                                                                          |
| **L4 Dashboard + Groceries + Alerts** | `app/ui/{dashboard,groceries,alerts}/**`, `app/data/{DashboardSource,GrocerySource,NotificationSource}.kt`, `app/push/ActivityNotifier.kt` (tap → in-app route only)                                                                                                                                                                                                                                                                                                           | §2.3, §2.5, §2.6                                                                                                                                | S1a; L0 G1, G7, G8; L2 `EventSheet` (dashboard row tap); L3 `MentionField` (board quick-add)                                                                                                                                                                                                                                            |
| **L5 Family + Account + Auth**        | `app/ui/{family,account}/**`, `app/ui/SignIn*.kt` (→ `ui/auth/**`), `app/data/{AccountSource,AuthApi,AuthSource,FamilySource}.kt`, secondary pages `app/ui/secondary/**` (Stats, Archive, Report a Bug, Custom Tab launcher)                                                                                                                                                                                                                                                   | §2.7–2.14                                                                                                                                       | S1a; L0 G1, G3, G10a–e, G11, G12, G13, G14, G15, G16                                                                                                                                                                                                                                                                                    |

**Ordering**:

1. L0 and L1-S1a start in parallel.
2. L2, L3, L4 and L5 start after S1a. They use fakes for any L0 endpoint that has not merged; each lane owns its fakes in its test tree.
3. L1 continues the shell in parallel, and must land `FpSheet` / `FpToast` / tokens before the other lanes' UI polish passes.
4. L4 picks up L2's `EventSheet` and L3's `MentionField` when they merge. Until then it uses placeholders.

**Shared-file rule**:

- `FamilyPlanzHost.kt`, theme files and `FpComponents.kt` belong to L1. Others request additions in L1's lane notes.
- `FamilyPlanzApp.kt` (DI) is L1. Each lane registers its sources through a per-lane `XModule.kt` in its own package, wired by one line in S1a.

**Per-lane definition of done**: every `AC-*` for the lane's screens is covered by a test (Robolectric / Compose UI test, or a server test for L0); `:app:mobileGate :app:assembleRelease` green; detekt clean; no existing test edited without cause; screenshots at 390 dp and 320 dp attached for owner review (#130 rule 3).

---

## 5. Open questions for the owner

- **Q1. Native-only features.** TaskFocus Start/Stop focus (#290), the notification-permission banner (#286), local reminders and push are not on the website. Keep them (this spec's default), or drop them for a strict clone?
- **Q2. Web departures from the style guide.** **Resolved (#292):** Groceries now uses slate/primary tokens on the web; clone the fixed page. (The guest/merge banner emoji ✅ ⚠️ are unchanged: clone literally.)
- **Q3. Alerts side cards.** **Resolved (#292):** dropped on the web; Android does not build them.
- **Q4. Logo tap.** On the web it goes to the marketing home `/`. On Android: Calendar tab (default), or open the website?
- **Q5. Web-only pages.** Import (.ics upload), Print, Admin and Bug Reports: open in a Custom Tab (default), or build native? A Custom Tab needs a web session, and the `fp_` token cannot mint a cookie today, so the user would sign in again in the tab. Is that acceptable, or should L0 add a one-time token-to-session exchange?
- **Q6. Default view = Dashboard.** On the web, `/calendar` redirects to the Dashboard for these users, but the Calendar _tab_ bypasses that (`?dashboardView=1`). Should the Android app _open_ on the Dashboard tab for these users (web first-visit behaviour), or always open on Calendar?
- **Q7. Forgot password.** Native flow via G12 `forgot` + an in-app reset-code screen, or a Custom Tab to `/forgot-password`?
