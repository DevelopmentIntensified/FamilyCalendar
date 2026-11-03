package com.familyplanz.app.domain.tasks

import java.time.LocalDate

/*
 * Port of src/lib/utils/dateResolution.ts (issue 114): the two shared rules
 * every parser reads — which YEAR a bare month-day belongs to, and which
 * cadence a phrase names. Pure calendar arithmetic, no zone.
 */

/** Recurrence storage words, as the server stores them. */
object CadenceFrequency {
	const val DAILY = "daily"
	const val WEEKLY = "weekly"
	const val MONTHLY = "monthly"
	const val YEARLY = "yearly"
}

enum class CadenceUnit(val frequency: String) {
	DAY(CadenceFrequency.DAILY),
	WEEK(CadenceFrequency.WEEKLY),
	MONTH(CadenceFrequency.MONTHLY),
	YEAR(CadenceFrequency.YEARLY),
}

/** `every N units`; "every other week" is `WEEK, 2`. */
data class Cadence(val unit: CadenceUnit, val every: Int)

/** A matched cadence phrase plus the span a caller strips from the title. */
data class CadenceMatch(val cadence: Cadence, val range: IntRange)

/**
 * THE rollover rule: an explicit year wins; otherwise the date rolls to next
 * year only when strictly before today. The day clamps to the month length,
 * and a clamped day never rolls. Null when month/day name no real date.
 */
fun resolveMonthDay(today: LocalDate, month: Int, day: Int, explicitYear: Int?): LocalDate? {
	if (month !in 1..12 || day !in 1..31) return null
	val year = explicitYear ?: today.year
	val clamped = minOf(day, java.time.YearMonth.of(year, month).lengthOfMonth())
	val resolved = LocalDate.of(year, month, clamped)
	return when {
		explicitYear != null || clamped != day -> resolved
		month < today.monthValue || (month == today.monthValue && clamped < today.dayOfMonth) -> resolved.plusYears(1)
		else -> resolved
	}
}

/** Days from one weekday to the next occurrence of another, 1..7 (Sunday = 0). */
fun daysUntilWeekday(from: Int, to: Int): Int {
	val delta = ((to - from) % 7 + 7) % 7
	return if (delta == 0) 7 else delta
}

private const val UNIT_ALT = "days|weeks|months|years|day|week|month|year|wks|wk|mos|mo|yrs|yr"

/** Any unit spelling → the canonical unit. */
fun cadenceUnit(token: String): CadenceUnit? = when (token.lowercase().removeSuffix("s")) {
	"day" -> CadenceUnit.DAY
	"week", "wk" -> CadenceUnit.WEEK
	"month", "mo" -> CadenceUnit.MONTH
	"year", "yr" -> CadenceUnit.YEAR
	else -> null
}

private class CadenceStep(pattern: String, val cadence: (MatchResult) -> Cadence) {
	val re = Regex(pattern, RegexOption.IGNORE_CASE)
}

private val QUARTER = Cadence(CadenceUnit.MONTH, 3)
private val HALF_YEAR = Cadence(CadenceUnit.MONTH, 6)

/** THE cadence phrase table, longest phrase first (dateResolution.ts CADENCE_STEPS). */
private val CADENCE_STEPS = listOf(
	CadenceStep("""\b(?:repeats?\s+)?every\s+other\s+($UNIT_ALT)\b""") {
		Cadence(cadenceUnit(it.groupValues[1]) ?: CadenceUnit.WEEK, 2)
	},
	CadenceStep("""\b(?:repeats?\s+)?every\s+(\d+)\s+($UNIT_ALT)\b""") {
		Cadence(cadenceUnit(it.groupValues[2]) ?: CadenceUnit.WEEK, maxOf(1, it.groupValues[1].toInt()))
	},
	CadenceStep("""\b(?:repeats?\s+)?every\s+quarter\b|\bquarterly\b|\bper\s+quarter\b|/\s*quarter\b""") { QUARTER },
	CadenceStep("""\b(?:repeats?\s+)?every\s+($UNIT_ALT)\b""") {
		Cadence(cadenceUnit(it.groupValues[1]) ?: CadenceUnit.DAY, 1)
	},
	CadenceStep(
		"""\b(?:biannually|bi-?annually|semi-?annually|twice\s+(?:a|per)\s+year|every\s+half\s+year)\b""",
	) { HALF_YEAR },
	CadenceStep("""\b(?:repeats?\s+)?(?:daily|nightly)\b""") { Cadence(CadenceUnit.DAY, 1) },
	CadenceStep("""\b(?:repeats?\s+)?weekly\b""") { Cadence(CadenceUnit.WEEK, 1) },
	CadenceStep("""\b(?:repeats?\s+)?monthly\b""") { Cadence(CadenceUnit.MONTH, 1) },
	CadenceStep("""\b(?:repeats?\s+)?(?:yearly|annually)\b""") { Cadence(CadenceUnit.YEAR, 1) },
)

/** The first cadence phrase in [text], or null. */
fun matchCadence(text: String): CadenceMatch? {
	for (step in CADENCE_STEPS) {
		val match = step.re.find(text) ?: continue
		return CadenceMatch(step.cadence(match), match.range)
	}
	return null
}
