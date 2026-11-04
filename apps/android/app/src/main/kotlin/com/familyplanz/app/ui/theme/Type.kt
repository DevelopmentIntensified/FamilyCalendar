package com.familyplanz.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/*
 * The site loads no webfont: theme.css --mp-font is the platform sans stack
 * (ui-sans-serif, system-ui, …, Roboto), which on Android IS Roboto — so
 * FontFamily.Default is the faithful choice, not a fallback. Sizes and
 * weights are the Tailwind steps the app pages use (issue 291).
 */
private val Sans = FontFamily.Default

private fun style(size: Int, line: Int, weight: FontWeight, tracking: Double = 0.0) = TextStyle(
	fontFamily = Sans,
	fontSize = size.sp,
	lineHeight = line.sp,
	fontWeight = weight,
	letterSpacing = tracking.em,
)

/** Tailwind `tracking-tight`. */
private const val TIGHT = -0.025

val FpTypography = Typography(
	// marketing display: --mp-display-weight 800, --mp-display-tracking -0.03em
	displaySmall = style(36, 40, FontWeight.ExtraBold, -0.03),
	// login h1: text-3xl font-bold tracking-tight
	headlineMedium = style(30, 36, FontWeight.Bold, TIGHT),
	// section h2: text-2xl font-bold
	headlineSmall = style(24, 32, FontWeight.Bold),
	// page header ("Tasks", navbar wordmark): text-xl font-bold
	titleLarge = style(20, 28, FontWeight.Bold, TIGHT),
	// dialog / "Check your email": text-lg font-semibold
	titleMedium = style(18, 28, FontWeight.SemiBold),
	// card h2 ("New task"): text-sm font-semibold
	titleSmall = style(14, 20, FontWeight.SemiBold),
	// inputs, primary submit: text-base
	bodyLarge = style(16, 24, FontWeight.Normal),
	// body copy, task title (font-medium applied at the call site): text-sm
	bodyMedium = style(14, 20, FontWeight.Normal),
	// hints: text-xs
	bodySmall = style(12, 16, FontWeight.Normal),
	// buttons: text-sm font-semibold
	labelLarge = style(14, 20, FontWeight.SemiBold),
	// labels / secondary buttons: text-xs font-medium
	labelMedium = style(12, 16, FontWeight.Medium),
	// bottom-nav label, task meta line: text-[11px] font-medium
	labelSmall = style(11, 16, FontWeight.Medium),
)

/** Chip text: TaskRow's `text-[0.625rem]` pills (10px). */
val FpChipText = style(10, 12, FontWeight.Medium)

/** Month-cell day disc: `text-[13px] font-bold`. */
val FpDayDiscText = style(13, 16, FontWeight.Bold)

// ---- #292 §1.3 additions ----

/** Family card name: `text-xl font-extrabold tracking-tight` 20/28/800. */
val FpTitleLargeHeavy = style(20, 28, FontWeight.ExtraBold, TIGHT)

/** Calendar month label: `text-lg font-bold tracking-tight` 18/28/700 (`CalendarToolbar.svelte`). */
val FpTitleMediumBold = style(18, 28, FontWeight.Bold, TIGHT)

/** TaskRow meta line: `text-[0.6875rem]` with `leading-5` (11/20/500). */
val FpMetaText = style(11, 20, FontWeight.Medium)

/** RSVP badge in a month chip, assignee initial: `text-[9px] font-bold`. */
val FpMicroText = style(9, 12, FontWeight.Bold)

/** Bottom-nav / bell badge: `text-[10px] font-semibold leading-none` (`BottomNav.svelte:164`). */
val FpBadgeText = style(10, 10, FontWeight.SemiBold)

/** Navbar wordmark: `text-xl font-bold` 20/28/700, no tracking (`Navbar.svelte:82`). */
val FpWordmarkText = style(20, 28, FontWeight.Bold)

/** Uppercase kicker: 11/700, `tracking-[0.08em]` (`AccountSidebar.svelte:67`). [FpKicker] upper-cases the text. */
val FpKickerText = style(11, 16, FontWeight.Bold, 0.08)

/** Kicker with `tracking-widest` (0.1em) (`family/+page.svelte` `dt`). */
val FpKickerWideText = style(11, 16, FontWeight.Bold, 0.1)
