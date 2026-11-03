package com.familyplanz.app.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb

/*
 * The website's palette, transcribed (issue 291). Sources, so a web change has
 * one place to land here too:
 *   - tailwind.config.js `primary` ramp (DEFAULT #dd5822 = app.html theme-color)
 *   - Tailwind's own slate ramp (the config's `secondary` is slate verbatim)
 *   - the Tailwind accent families the task/calendar components reach for
 *     (red, amber, emerald, teal, sky, indigo, purple — see TaskRow.svelte,
 *     priorityTone.ts, CategoryChip.svelte)
 *   - src/lib/marketing/theme.css brand tints (terracotta mark, blue ink)
 * Token table: docs/guides/android-design-tokens.md.
 */

/** Tailwind `primary-*` (tailwind.config.js). */
object Primary {
	val P50 = Color(0xFFFEF7F0)
	val P100 = Color(0xFFFDEDE0)
	val P200 = Color(0xFFFAD9BF)
	val P300 = Color(0xFFF5BE92)
	val P400 = Color(0xFFEE9459)
	val P500 = Color(0xFFE87539)
	val P600 = Color(0xFFDD5822)
	val P700 = Color(0xFFB8441C)
	val P800 = Color(0xFF943A1E)
	val P900 = Color(0xFF793420)
	val P950 = Color(0xFF421A0C)
}

/** Tailwind `slate-*` (== the config's `secondary-*`). */
object Slate {
	val S50 = Color(0xFFF8FAFC)
	val S100 = Color(0xFFF1F5F9)
	val S200 = Color(0xFFE2E8F0)
	val S300 = Color(0xFFCBD5E1)
	val S400 = Color(0xFF94A3B8)
	val S500 = Color(0xFF64748B)
	val S600 = Color(0xFF475569)
	val S700 = Color(0xFF334155)
	val S800 = Color(0xFF1E293B)
	val S900 = Color(0xFF0F172A)
}

/** The Tailwind accent steps the web task/calendar surfaces use. */
object Accent {
	val Red50 = Color(0xFFFEF2F2)
	val Red100 = Color(0xFFFEE2E2)
	val Red200 = Color(0xFFFECACA)
	val Red400 = Color(0xFFF87171)
	val Red500 = Color(0xFFEF4444)
	val Red600 = Color(0xFFDC2626)
	val Red700 = Color(0xFFB91C1C)
	val Amber50 = Color(0xFFFFFBEB)
	val Amber100 = Color(0xFFFEF3C7)
	val Amber200 = Color(0xFFFDE68A)
	val Amber700 = Color(0xFFB45309)
	val Amber800 = Color(0xFF92400E)
	val Emerald100 = Color(0xFFD1FAE5)
	val Emerald700 = Color(0xFF047857)
	val Teal100 = Color(0xFFCCFBF1)
	val Teal800 = Color(0xFF115E59)
	val Sky100 = Color(0xFFE0F2FE)
	val Sky700 = Color(0xFF0369A1)
	val Indigo100 = Color(0xFFE0E7FF)
	val Indigo700 = Color(0xFF4338CA)
	val Purple100 = Color(0xFFF3E8FF)
	val Purple500 = Color(0xFFA855F7)

	// avatarColor.ts PALETTE (bg-X-100 text-X-700)
	val Rose100 = Color(0xFFFFE4E6)
	val Rose700 = Color(0xFFBE123C)
	val Violet100 = Color(0xFFEDE9FE)
	val Violet700 = Color(0xFF6D28D9)
	val Fuchsia100 = Color(0xFFFAE8FF)
	val Fuchsia700 = Color(0xFFA21CAF)
	val Lime100 = Color(0xFFECFCCB)
	val Lime700 = Color(0xFF4D7C0F)
	val Orange100 = Color(0xFFFFEDD5)
	val Orange700 = Color(0xFFC2410C)
}

/** avatarColor.ts PALETTE, same order (the hash indexes into it). */
val AvatarTones: List<ChipTone> = listOf(
	ChipTone(Accent.Rose100, Accent.Rose700),
	ChipTone(Accent.Amber100, Accent.Amber700),
	ChipTone(Accent.Emerald100, Accent.Emerald700),
	ChipTone(Accent.Sky100, Accent.Sky700),
	ChipTone(Accent.Violet100, Accent.Violet700),
	ChipTone(Accent.Fuchsia100, Accent.Fuchsia700),
	ChipTone(Accent.Lime100, Accent.Lime700),
	ChipTone(Accent.Orange100, Accent.Orange700),
)

/** avatarColor(id): sum of UTF-16 code units mod palette size, exactly as the web hashes. */
fun avatarTone(id: String): ChipTone = AvatarTones[id.sumOf { it.code } % AvatarTones.size]

/** src/lib/marketing/theme.css brand tints (the app-icon art). */
object Brand {
	val Terracotta = Color(0xFFC45E38)
	val TerracottaDeep = Color(0xFFA14D32)
	val Paper = Color(0xFFF8F6F3)
	val Peach = Color(0xFFF1B598)
	val Blue = Color(0xFFBEDAE3)
	val BlueInk = Color(0xFF366D7E)
	val Mint = Color(0xFFC4E9DA)
	val MintInk = Color(0xFF2D5866)
}

/** Material3 roles mapped from the web palette. Light only: the site has no dark mode. */
val FpLightColorScheme: ColorScheme = lightColorScheme(
	primary = Primary.P600,
	onPrimary = Color.White,
	primaryContainer = Primary.P50,
	onPrimaryContainer = Primary.P700,
	inversePrimary = Primary.P300,
	secondary = Slate.S700,
	onSecondary = Color.White,
	secondaryContainer = Slate.S100,
	onSecondaryContainer = Slate.S700,
	tertiary = Brand.BlueInk,
	onTertiary = Color.White,
	tertiaryContainer = Brand.Blue,
	onTertiaryContainer = Brand.MintInk,
	background = Slate.S50,
	onBackground = Slate.S900,
	surface = Color.White,
	onSurface = Slate.S900,
	surfaceVariant = Slate.S100,
	onSurfaceVariant = Slate.S500,
	surfaceTint = Color.White,
	inverseSurface = Slate.S800,
	inverseOnSurface = Color.White,
	error = Accent.Red600,
	onError = Color.White,
	errorContainer = Accent.Red50,
	onErrorContainer = Accent.Red700,
	outline = Slate.S300,
	outlineVariant = Slate.S200,
	scrim = Slate.S900,
	surfaceBright = Color.White,
	surfaceDim = Slate.S100,
	surfaceContainerLowest = Color.White,
	surfaceContainerLow = Slate.S50,
	surfaceContainer = Color.White,
	surfaceContainerHigh = Color.White,
	surfaceContainerHighest = Slate.S100,
)

/** One chip/pill tone: fill + ink (web `bg-X-100 text-X-700`). */
@Immutable
data class ChipTone(val container: Color, val content: Color)

/**
 * Roles the Material scheme has no slot for: the web chip vocabulary
 * (TaskRow.svelte meta slots), due/overdue tones (priorityTone.ts dueTone),
 * the priority dots, and the calendar chip rail (chipVocabulary.ts).
 */
@Immutable
data class FpColors(
	val category: ChipTone = ChipTone(Accent.Teal100, Accent.Teal800),
	val tag: ChipTone = ChipTone(Accent.Sky100, Accent.Sky700),
	val family: ChipTone = ChipTone(Accent.Indigo100, Accent.Indigo700),
	val late: ChipTone = ChipTone(Accent.Red100, Accent.Red700),
	val dueToday: ChipTone = ChipTone(Accent.Amber100, Accent.Amber700),
	val due: ChipTone = ChipTone(Slate.S100, Slate.S600),
	val pending: ChipTone = ChipTone(Accent.Amber100, Accent.Amber700),
	val assignee: ChipTone = ChipTone(Slate.S100, Slate.S600),
	val recurring: ChipTone = ChipTone(Accent.Purple100, Accent.Purple500),
	val focus: ChipTone = ChipTone(Primary.P50, Primary.P700),
	val accept: ChipTone = ChipTone(Accent.Emerald100, Accent.Emerald700),
	val decline: ChipTone = ChipTone(Accent.Red100, Accent.Red700),
	val priorityHigh: Color = Accent.Red500,
	val priorityNormal: Color = Slate.S300,
	val priorityLow: Color = Slate.S200,
	/** Row surface: `border-slate-100 bg-slate-50/60`; late rows `border-red-200 bg-red-50`. */
	val rowSurface: Color = Slate.S50,
	val rowBorder: Color = Slate.S100,
	val lateRowSurface: Color = Accent.Red50,
	val lateRowBorder: Color = Accent.Red200,
	val lateText: Color = Accent.Red700,
	/** chipColor() fallback when an event has no calendar colour. */
	val chipRail: Color = Slate.S400,
	val taskChipBorder: Color = Slate.S300,
	val overdueChipBorder: Color = Accent.Red400,
	/** MonthDayCell: today = primary-300 border on primary-50 wash; weekend = paper wash. */
	val todayCellBorder: Color = Primary.P300,
	val todayCellSurface: Color = Primary.P50,
	val weekendCellSurface: Color = Brand.Paper,
	val otherMonthCellSurface: Color = Slate.S50,
	val otherMonthCellBorder: Color = Slate.S100,
	/** Text ramp: titles slate-900, body slate-600, meta slate-400, separators slate-300. */
	val textStrong: Color = Slate.S900,
	val textBody: Color = Slate.S600,
	val textMuted: Color = Slate.S400,
	val separator: Color = Slate.S300,
	/** Guest / info note: the login page's `bg-[#BEDAE3]/40` info card. */
	val infoSurface: Color = Brand.Blue.copy(alpha = 0.4f),
	val infoContent: Color = Slate.S700,
	/** Warning card (TasksHeader: amber-50 / amber-200 / amber-800). */
	val warnSurface: Color = Accent.Amber50,
	val warnBorder: Color = Accent.Amber200,
	val warnContent: Color = Accent.Amber800,
	/** Status bar = app.html theme-color. */
	val statusBar: Color = Primary.P600,
)

/** System-bar scrims (Activity code wants ARGB ints): app.html theme-color, and the white tab bar. */
val STATUS_BAR_ARGB: Int = Primary.P600.toArgb()
val SURFACE_ARGB: Int = Color.White.toArgb()
