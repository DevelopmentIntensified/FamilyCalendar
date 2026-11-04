package com.familyplanz.app.ui.calendar.chips

import androidx.compose.ui.graphics.Color
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.Slate

/*
 * Port of src/lib/utils/chipVocabulary.ts + eventChip.ts (#068, #111): the one
 * chip vocabulary every calendar view speaks. Shape carries the kind, colour
 * carries the calendar. Nothing here keys off a hue.
 */

enum class ChipKind { TIMED, ALL_DAY, TASK, SPONSORED }

enum class ChipDensity { GLYPH, WORD }

/** `ChipGlyph.name`. */
enum class GlyphShape { DOT, BAR, RING, BAG }

/** `CHIP_GLYPH_PX`, `CHIP_GAP_PX`, `CHIP_RAIL_PX`. */
const val CHIP_GLYPH_DP = 10
const val CHIP_GAP_DP = 2
const val CHIP_RAIL_DP = 3

data class ChipGlyph(val shape: GlyphShape, val width: Int, val height: Int, val stroke: Int)

data class ChipTreatment(
	val kind: ChipKind,
	val glyph: ChipGlyph,
	/** The kind's word for views with room for it. */
	val word: String,
	/** Announced when a glyph view drops the word ('' for timed). */
	val a11y: String,
)

private val TREATMENTS: Map<ChipKind, ChipTreatment> = mapOf(
	ChipKind.TIMED to ChipTreatment(ChipKind.TIMED, ChipGlyph(GlyphShape.DOT, 6, 6, 0), "", ""),
	ChipKind.ALL_DAY to ChipTreatment(ChipKind.ALL_DAY, ChipGlyph(GlyphShape.BAR, 10, 5, 0), "All day", "All day"),
	ChipKind.TASK to ChipTreatment(ChipKind.TASK, ChipGlyph(GlyphShape.RING, 9, 9, 2), "Task", "Task"),
	ChipKind.SPONSORED to ChipTreatment(ChipKind.SPONSORED, ChipGlyph(GlyphShape.BAG, 9, 9, 0), "Ad", "Sponsored"),
)

fun chipTreatment(kind: ChipKind): ChipTreatment = TREATMENTS.getValue(kind)

/** An ad outranks all-day: an all-day sponsored event is still an ad. */
fun chipKindOf(allDay: Boolean, isAd: Boolean): ChipKind = when {
	isAd -> ChipKind.SPONSORED
	allDay -> ChipKind.ALL_DAY
	else -> ChipKind.TIMED
}

fun chipKindOf(event: CalendarEvent): ChipKind = chipKindOf(event.allDay, event.isAd)

fun chipWord(kind: ChipKind, density: ChipDensity): String =
	if (density == ChipDensity.WORD) chipTreatment(kind).word else ""

fun chipA11y(kind: ChipKind, density: ChipDensity): String =
	if (density == ChipDensity.WORD) "" else chipTreatment(kind).a11y

/** `chipColor`: the event's colour, else slate-400 (#94a3b8). */
fun chipColor(hex: String?): Color = parseHex(hex) ?: Slate.S400

/** `#rgb` / `#rrggbb` → Color; null when unreadable. */
fun parseHex(hex: String?): Color? {
	val raw = hex?.trim()?.removePrefix("#") ?: return null
	val full = if (raw.length == 3) raw.map { "$it$it" }.joinToString("") else raw
	return full.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { Color(0xFF000000 or it) }
}

/** `calendarNameFor`: only when 2+ calendars make it worth naming. */
fun calendarNameFor(calendarId: String, calendars: List<Pair<String, String>>): String =
	if (calendars.size < 2) "" else calendars.firstOrNull { it.first == calendarId }?.second.orEmpty()

/** `rsvpVisual`: null for undecided / unknown. Labels are the web's; no glyphs (the pill carries the word). */
data class RsvpVisual(val label: String, val tone: ChipTone, val dim: Boolean)

fun rsvpVisual(status: String?): RsvpVisual? = when (status) {
	"going" -> RsvpVisual("Going", ChipTone(Accent.Emerald100, Accent.Emerald700), false)
	"maybe" -> RsvpVisual("Maybe", ChipTone(Accent.Amber100, Accent.Amber700), false)
	"declined" -> RsvpVisual("Can't go", ChipTone(Slate.S200, Slate.S500), true)
	else -> null
}
