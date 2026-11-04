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

	// #292 §1.2 additions (Tailwind 3.4.19 default palette).

	/** red-800: urgent guest banner / error text (`calendar/+layout.svelte:250`). */
	val Red800 = Color(0xFF991B1B)

	/** amber-300 / -500 / -600 / -900: offline banner (`OfflineBanner.svelte:63`), sponsored events, guest hint. */
	val Amber300 = Color(0xFFFCD34D)
	val Amber500 = Color(0xFFF59E0B)
	val Amber600 = Color(0xFFD97706)
	val Amber900 = Color(0xFF78350F)

	/** green-50/100/200/600/800: success banner (`calendar/+layout.svelte:151`), RSVP Going. */
	val Green50 = Color(0xFFF0FDF4)
	val Green100 = Color(0xFFDCFCE7)
	val Green200 = Color(0xFFBBF7D0)
	val Green600 = Color(0xFF16A34A)
	val Green800 = Color(0xFF166534)

	/** yellow-500: RSVP Maybe (`EventRsvpRow.svelte`). */
	val Yellow500 = Color(0xFFEAB308)

	/** blue-100/800, emerald-800, orange-800: notification tones (`notificationTypes.ts` TONES). */
	val Blue100 = Color(0xFFDBEAFE)
	val Blue800 = Color(0xFF1E40AF)
	val Emerald50 = Color(0xFFECFDF5)
	val Emerald500 = Color(0xFF10B981)
	val Emerald800 = Color(0xFF065F46)
	val Emerald900 = Color(0xFF064E3B)
	val Orange50 = Color(0xFFFFF7ED)
	val Orange500 = Color(0xFFF97316)
	val Orange800 = Color(0xFF9A3412)
	val Orange900 = Color(0xFF7C2D12)

	/** sky / violet / amber steps for the grocery store swatches (`groceries.ts:156-200`). */
	val Sky50 = Color(0xFFF0F9FF)
	val Sky500 = Color(0xFF0EA5E9)
	val Sky900 = Color(0xFF0C4A6E)
	val Violet50 = Color(0xFFF5F3FF)
	val Violet500 = Color(0xFF8B5CF6)
	val Violet900 = Color(0xFF4C1D95)

	/** cyan-50/600: Family source chip (`TodayGlanceCard.svelte`). */
	val Cyan50 = Color(0xFFECFEFF)
	val Cyan600 = Color(0xFF0891B2)

	/** purple-400: recurring glyph (`MonthDayCell.svelte:276`). */
	val Purple400 = Color(0xFFC084FC)
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

	/** Account avatar wash `bg-[#FED5CF]` (`theme.css:62`; `AccountSidebar.svelte:120`). */
	val Blush = Color(0xFFFED5CF)
}

/** Default calendar colours when a calendar has none (`calendar/+page.server.ts:106,145`). */
object CalendarDefaults {
	val Personal = Color(0xFFFA8072)
	val Family = Color(0xFFE0FFFF)

	/** Sponsored events (`calendar/+page.server.ts:320`, amber-500). */
	val Sponsored = Accent.Amber500
}

/** One banner tone: `border-X bg-X text-X` (`calendar/+layout.svelte:149-263`, `OfflineBanner.svelte:63`). */
@Immutable
data class BannerTone(val border: Color, val surface: Color, val content: Color)

/** `notificationTypes.ts` TONES, keyed by the raw `type` column; unknown → slate-100/600. */
object NotifTones {
	val pending = ChipTone(Accent.Blue100, Accent.Blue800)
	val positive = ChipTone(Accent.Emerald100, Accent.Emerald800)
	val declined = ChipTone(Accent.Red100, Accent.Red800)
	val family = ChipTone(Accent.Orange100, Accent.Orange800)
	val unknown = ChipTone(Slate.S100, Slate.S600)

	fun of(type: String?): ChipTone = when (type) {
		"assignment_pending" -> pending
		"assignment_accepted", "task_completed" -> positive
		"assignment_declined" -> declined
		"added_to_family" -> family
		else -> unknown
	}
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

/** System-bar scrims (Activity code wants ARGB ints): app.html theme-color, and the white tab bar. */
val STATUS_BAR_ARGB: Int = Primary.P600.toArgb()
val SURFACE_ARGB: Int = Color.White.toArgb()
