@file:Suppress("TooManyFunctions")
package com.familyplanz.app.domain.tasks

import com.familyplanz.app.domain.TaskPriority
import java.time.LocalDate

/*
 * Port of src/lib/utils/taskQuickAdd.ts: one field captures the whole task.
 * Phrases are stripped from the title as they are consumed, in the web's
 * order: priority → cadence → date → #public/#private → @handles / assignee
 * → #tags. Dates are calendar days; the caller lands them at 23:59 local.
 * Test vectors: TaskQuickAddTest mirrors taskQuickAdd.test.ts.
 */

/** A family roster member the quick-add can be pointed at. */
data class QuickAddMember(val userId: String, val firstName: String, val lastName: String) {
	val fullName: String get() = listOf(firstName, lastName).filter { it.isNotBlank() }.joinToString(" ")
}

data class TaskQuickAddResult(
	val title: String,
	/** Target calendar day, or null when the input carries no date phrase. */
	val due: LocalDate?,
	val priority: TaskPriority,
	val assignedTo: String?,
	/** `#tag` tokens, lowercased, deduped, sorted. */
	val tags: List<String>,
	val recurrenceFrequency: String?,
	val recurrenceInterval: Int?,
	val visibility: String,
	val visibilityExplicit: Boolean,
	val familyTask: Boolean,
	/** An `@name` that matched nobody (or two people), with its `@`. */
	val unknownMember: String?,
) {
	/** True when the preview chips have anything to show (TaskQuickAddPreview `hasInfo`). */
	val hasInfo: Boolean
		get() = due != null || priority != TaskPriority.NORMAL || assignedTo != null || tags.isNotEmpty() ||
			recurrenceFrequency != null || visibilityExplicit || familyTask || unknownMember != null
}

private val WEEKDAY_FULL = listOf("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
private val WEEKDAY_SHORT = listOf("sun", "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat")
private const val WEEKDAY_TOKEN =
	"(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)"
private const val MONTH_NAME_TOKEN =
	"(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|" +
		"oct|october|nov|november|dec|december)"
private val MONTH_INDEX: Map<String, Int> = buildMap {
	listOf(
		"january", "february", "march", "april", "may", "june",
		"july", "august", "september", "october", "november", "december",
	).forEachIndexed { i, name -> put(name, i + 1) }
	listOf("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
		.forEachIndexed { i, name -> put(name, i + 1) }
	put("sept", 9)
}

private val I = setOf(RegexOption.IGNORE_CASE)
private val DATE_RE = Regex("""\b(today|tomorrow|${(WEEKDAY_FULL + WEEKDAY_SHORT).joinToString("|")})\b""", I)
private val PRIORITY_RE = Regex(
	"""\b(high\s*-?\s*priority|low\s*-?\s*priority|priority\s*[:=]?\s*(high|low)|not\s+urgent|urgent|asap)\b""",
	I,
)
private val LOW_RE = Regex("""(low|not\s+urgent)""")
private val TAG_RE = Regex("""#[\p{L}\p{N}_-]+""")
private val VISIBILITY_RE = Regex("""#(public|private)\b""", I)
private val AT_TOKEN_RE = Regex("""@([\p{L}\p{N}_-]+)""")
private val NEXT_WEEKDAY_RE = Regex("""\bnext\s+($WEEKDAY_TOKEN)\b""", I)
private val MONTH_DATE_RE = Regex("""\b(?:due\s+)?$MONTH_NAME_TOKEN\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b""", I)
private val CLOCK_RE = Regex("""\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b""", I)
private val DUE_WORD_RE = Regex("""\bdue\b""", I)
private val RELATIVE_RE = Regex("""\b(?:in\s+(\d+|a|an)\s+(days?|weeks?|months?|years?)|next\s+(week|month|year))\b""", I)
private const val DAY_ALT = "sunday|monday|tuesday|wednesday|thursday|friday|saturday"
private val EVERY_OTHER_DAY_RE = Regex("""\bevery\s+other\s+($DAY_ALT)\b""", I)
private val EVERY_DAY_RE = Regex("""\bevery\s+($DAY_ALT)\b""", I)
private val LEADING_JUNK_RE = Regex("""^[\s:,\-–—;]+""")
private val MULTI_SPACE_RE = Regex("""\s{2,}""")

/** `assign to` before `assign`, so the longer phrase wins at the same spot. */
private val ASSIGNEE_TRIGGERS = listOf("@", "assign to", "assign", "task", "for", "to")
private const val WORD_END = """(?=$|\s|[^\w])"""

private fun String.cut(range: IntRange): String = removeRange(range)

/** JS `getDay()`: Sunday = 0. */
private fun LocalDate.jsDay(): Int = dayOfWeek.value % 7

/** Next occurrence of a weekday token from [today]; today itself rolls a week. */
private fun nextWeekday(today: LocalDate, token: String): LocalDate {
	val target = WEEKDAY_FULL.indexOfFirst { it.startsWith(token.lowercase().take(3)) }
	if (target == -1) return today
	return today.plusDays(daysUntilWeekday(today.jsDay(), target).toLong())
}

private fun shift(base: LocalDate, n: Long, unit: String): LocalDate = when (unit.lowercase().removeSuffix("s")) {
	"month" -> base.plusMonths(n)
	"year" -> base.plusYears(n)
	"week" -> base.plusWeeks(n)
	else -> base.plusDays(n)
}

/** The roster-matched assignee phrase (trigger + name) and where it sits. */
data class TaskAssigneeMatch(val userId: String, val index: Int, val length: Int)

private fun assigneePhraseRe(trigger: String, name: String): Regex {
	val esc = Regex.escape(name)
	return if (trigger == "@") {
		Regex("""(^|\s)@\s*$esc$WORD_END""", I)
	} else {
		Regex("""(^|\s)$trigger\s+$esc$WORD_END""", I)
	}
}

/** Earliest roster-matched assignee phrase; ties go to the longest. Null = nothing to strip. */
@Suppress("NestedBlockDepth")
fun findTaskAssignee(input: String, members: List<QuickAddMember>): TaskAssigneeMatch? {
	var best: TaskAssigneeMatch? = null
	for (trigger in ASSIGNEE_TRIGGERS) {
		for (member in members) {
			val variants = listOf(
				if (member.firstName.isNotEmpty() && member.lastName.isNotEmpty()) "${member.firstName} ${member.lastName}" else "",
				member.firstName,
				member.lastName,
			).filter { it.isNotEmpty() }.toSet()
			for (name in variants) {
				val match = assigneePhraseRe(trigger, name).find(input) ?: continue
				val candidate = TaskAssigneeMatch(member.userId, match.range.first, match.value.length)
				val current = best
				@Suppress("ComplexCondition")
				if (current == null || candidate.index < current.index ||
					(candidate.index == current.index && candidate.length > current.length)
				) {
					best = candidate
				}
			}
		}
	}
	return best
}

private data class Recurrence(val frequency: String?, val interval: Int?, val due: LocalDate?, val remaining: String)

private fun weekdayAnchor(title: String, re: Regex, today: LocalDate, every: Int): Recurrence? {
	val m = re.find(title) ?: return null
	return Recurrence(CadenceFrequency.WEEKLY, every, nextWeekday(today, m.groupValues[1]), title.cut(m.range))
}

private fun parseRecurrence(title: String, today: LocalDate): Recurrence =
	weekdayAnchor(title, EVERY_OTHER_DAY_RE, today, 2)
		?: weekdayAnchor(title, EVERY_DAY_RE, today, 1)
		?: matchCadence(title)?.let { Recurrence(it.cadence.unit.frequency, it.cadence.every, null, title.cut(it.range)) }
		?: Recurrence(null, null, null, title)

/** First date phrase that resolves: next-weekday → month+day → relative → bare word. */
@Suppress("ReturnCount")
private fun resolveDate(title: String, today: LocalDate): Pair<LocalDate, IntRange>? {
	NEXT_WEEKDAY_RE.find(title)?.let { return nextWeekday(today, it.groupValues[1]) to it.range }
	MONTH_DATE_RE.find(title)?.let { md ->
		val month = MONTH_INDEX.getValue(md.groupValues[1].lowercase())
		val year = md.groupValues[3].takeIf { it.isNotEmpty() }?.toInt()
		val due = resolveMonthDay(today, month, md.groupValues[2].toInt(), year) ?: today
		return due to md.range
	}
	RELATIVE_RE.find(title)?.let { rel ->
		val amount = rel.groupValues[1]
		if (rel.groupValues[2].isNotEmpty()) {
			val n = if (amount.equals("a", true) || amount.equals("an", true)) 1L else amount.toLong()
			return shift(today, n, rel.groupValues[2]) to rel.range
		}
		if (rel.groupValues[3].isNotEmpty()) return shift(today, 1, rel.groupValues[3]) to rel.range
	}
	DATE_RE.find(title)?.let { bare ->
		val due = when (val token = bare.groupValues[1].lowercase()) {
			"today" -> today
			"tomorrow" -> today.plusDays(1)
			else -> nextWeekday(today, token)
		}
		return due to bare.range
	}
	return null
}

private data class AtHit(val userId: String?, val length: Int)

/** Greedy longest roster match for the `@handle` at [at]; a tie between two members is ambiguous. */
private fun matchAtHandle(title: String, at: Int, members: List<QuickAddMember>): AtHit? {
	val rest = title.substring(at)
	val hits = mutableListOf<AtHit>()
	for (m in members) {
		val candidates = listOf("${m.firstName} ${m.lastName}".trim(), m.firstName, m.lastName)
			.filter { it.isNotEmpty() }
			.map { it.lowercase() }
			.toSet()
		for (candidate in candidates) {
			val cm = Regex("""^@\s*${Regex.escape(candidate)}$WORD_END""", I).find(rest) ?: continue
			hits += AtHit(m.userId, cm.value.length)
		}
	}
	if (hits.isEmpty()) return null
	val longest = hits.maxOf { it.length }
	val winners = hits.filter { it.length == longest }.map { it.userId }.toSet()
	return if (winners.size == 1) AtHit(winners.first(), longest) else AtHit(null, longest)
}

private fun stripCuts(input: String, cuts: List<Pair<Int, Int>>): String {
	var out = input
	for ((at, len) in cuts.sortedBy { it.first }.asReversed()) {
		out = out.removeRange(at, minOf(out.length, at + len))
	}
	return out
}

/** Lowercase, strip `#`, dedupe and sort raw tag matches. */
fun normalizeQuickAddTags(matches: List<String>): List<String> =
	matches.map { it.removePrefix("#").lowercase().trim() }.filter { it.isNotEmpty() }.distinct().sorted()

private class Scoping(var visibility: String = "public", var explicit: Boolean = false)

private fun applyVisibility(title: String, scoping: Scoping): String {
	val matches = VISIBILITY_RE.findAll(title).toList()
	if (matches.isEmpty()) return title
	scoping.explicit = true
	scoping.visibility = matches.last().groupValues[1].lowercase()
	return stripCuts(title, matches.map { it.range.first to it.value.length })
}

private class Handles(var assignedTo: String? = null, var family: Boolean = false, var unknown: String? = null)

/** `@family` / `@name` handles; returns the title with each consumed handle cut out. */
private fun applyHandles(title: String, members: List<QuickAddMember>, out: Handles): Pair<String, Boolean> {
	val ats = AT_TOKEN_RE.findAll(title).toList()
	val cuts = ats.map { am ->
		val token = am.groupValues[1]
		val at = am.range.first
		if (token.equals("family", ignoreCase = true)) {
			out.family = true
			at to am.value.length
		} else {
			val hit = matchAtHandle(title, at, members)
			if (hit?.userId != null) {
				out.assignedTo = hit.userId
			} else {
				out.unknown = "@$token"
			}
			at to (hit?.length ?: am.value.length)
		}
	}
	return stripCuts(title, cuts) to ats.isNotEmpty()
}

/** Parse one quick-add line. [today] is the local calendar day relative dates count from. */
fun parseTaskQuickAdd(raw: String, today: LocalDate, members: List<QuickAddMember> = emptyList()): TaskQuickAddResult {
	var title = raw.trim()

	var priority = TaskPriority.NORMAL
	PRIORITY_RE.find(title)?.let { pm ->
		priority = if (LOW_RE.containsMatchIn(pm.value.lowercase())) TaskPriority.LOW else TaskPriority.HIGH
		title = title.cut(pm.range)
	}

	val recurrence = parseRecurrence(title, today)
	if (recurrence.frequency != null) title = recurrence.remaining

	var due: LocalDate? = null
	val resolved = resolveDate(title, today)
	if (resolved != null) {
		due = resolved.first
		title = title.cut(resolved.second).replace(CLOCK_RE, "").replace(DUE_WORD_RE, "")
	} else if (recurrence.due != null) {
		due = recurrence.due
	}

	val scoping = Scoping()
	title = applyVisibility(title, scoping)

	val handles = Handles()
	if (members.isNotEmpty()) {
		val (cut, sawAt) = applyHandles(title, members, handles)
		title = cut
		if (!sawAt) {
			findTaskAssignee(title, members)?.let { match ->
				handles.assignedTo = match.userId
				title = title.removeRange(match.index, match.index + match.length)
			}
		}
	}

	val tags = normalizeQuickAddTags(TAG_RE.findAll(title).map { it.value }.toList())
	title = title.replace(TAG_RE, "")
		.replace(LEADING_JUNK_RE, "")
		.replace(MULTI_SPACE_RE, " ")
		.trim()
	if (title.isEmpty()) title = raw.trim()

	return TaskQuickAddResult(
		title = title,
		due = due,
		priority = priority,
		assignedTo = handles.assignedTo,
		tags = tags,
		recurrenceFrequency = recurrence.frequency,
		recurrenceInterval = recurrence.interval,
		visibility = scoping.visibility,
		visibilityExplicit = scoping.explicit,
		familyTask = handles.family,
		unknownMember = handles.unknown,
	)
}
