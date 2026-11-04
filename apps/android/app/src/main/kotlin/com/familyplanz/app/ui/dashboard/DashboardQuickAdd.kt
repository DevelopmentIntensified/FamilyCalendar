package com.familyplanz.app.ui.dashboard

import com.familyplanz.app.data.FamilyMemberDto
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters

/**
 * The Family Task Board's quick-add, a trimmed port of
 * `src/lib/utils/taskQuickAdd.ts`: it strips a date, a priority, an assignee
 * phrase and `#tag`s out of one line, leaving the title.
 *
 * Only what the dashboard card offers is ported (no recurrence, no
 * visibility markers, no month names): the board creates a family task
 * assigned to someone, due a day, and nothing else.
 */
data class BoardQuickAdd(
	val title: String,
	/** `null` when the line named no day. */
	val dueDate: LocalDate? = null,
	/** `low` | `normal` | `high`. */
	val priority: String = "normal",
	/** The roster member the phrase named, or null. */
	val assignedTo: String? = null,
	/** An `@handle`/`for Name` that matched nobody, with its `@` kept for the message. */
	val unknownMember: String? = null,
	val tags: List<String> = emptyList(),
)

/** Trigger words that may precede a member's name. */
private val ASSIGNEE_TRIGGERS = listOf("assign to", "assign", "@", "task", "for", "to")

private val WEEKDAYS = mapOf(
	"monday" to DayOfWeek.MONDAY, "mon" to DayOfWeek.MONDAY,
	"tuesday" to DayOfWeek.TUESDAY, "tue" to DayOfWeek.TUESDAY, "tues" to DayOfWeek.TUESDAY,
	"wednesday" to DayOfWeek.WEDNESDAY, "wed" to DayOfWeek.WEDNESDAY,
	"thursday" to DayOfWeek.THURSDAY, "thu" to DayOfWeek.THURSDAY, "thurs" to DayOfWeek.THURSDAY,
	"friday" to DayOfWeek.FRIDAY, "fri" to DayOfWeek.FRIDAY,
	"saturday" to DayOfWeek.SATURDAY, "sat" to DayOfWeek.SATURDAY,
	"sunday" to DayOfWeek.SUNDAY, "sun" to DayOfWeek.SUNDAY,
)

/** `TASK_QUICK_ADD_PRIORITY_RE`: one pattern, first match wins, then the word decides the tone. */
private val PRIORITY_RE = Regex(
	"\\b(high\\s*-?\\s*priority|low\\s*-?\\s*priority|priority\\s*[:=]?\\s*(high|low)|not\\s+urgent|urgent|asap)\\b",
	RegexOption.IGNORE_CASE,
)
private val LOW_WORDS_RE = Regex("(low|not\\s+urgent)", RegexOption.IGNORE_CASE)
private val TODAY_RE = Regex("\\btoday\\b", RegexOption.IGNORE_CASE)
private val TOMORROW_RE = Regex("\\btomorrow\\b", RegexOption.IGNORE_CASE)
private val NEXT_WEEKDAY_RE = Regex("\\bnext\\s+(\\w+)\\b", RegexOption.IGNORE_CASE)
private val WEEKDAY_RE =
	Regex("\\b(${WEEKDAYS.keys.sortedByDescending { it.length }.joinToString("|")})\\b", RegexOption.IGNORE_CASE)
private val TAG_RE = Regex("#[\\p{L}\\p{N}_-]+")
private val SPACES_RE = Regex("\\s+")

/** Parse one board quick-add line against the family [members]. */
fun parseBoardQuickAdd(input: String, members: List<FamilyMemberDto>, today: LocalDate = LocalDate.now()): BoardQuickAdd {
	var text = input
	val who = takeAssignee(text, members) { stripped -> text = stripped }
	val (assignedTo, unknownMember) = who
	val due = dueFrom(text, today)
	val priorityMatch = PRIORITY_RE.find(text)
	val priority = when {
		priorityMatch == null -> "normal"
		LOW_WORDS_RE.containsMatchIn(priorityMatch.value.lowercase()) -> "low"
		else -> "high"
	}
	if (priorityMatch != null) text = text.removeRange(priorityMatch.range)
	text = stripDatePhrases(text, today)
	val tags = TAG_RE.findAll(text).map { it.value.drop(1).lowercase() }.distinct().sorted().toList()
	return BoardQuickAdd(
		title = text.replace(TAG_RE, " ").replace(SPACES_RE, " ").trim(),
		dueDate = due,
		priority = priority,
		assignedTo = assignedTo,
		unknownMember = unknownMember,
		tags = tags,
	)
}

/** The day a line names: today, tomorrow, "next <weekday>", or a bare weekday. */
internal fun dueFrom(text: String, today: LocalDate): LocalDate? {
	if (TODAY_RE.containsMatchIn(text)) return today
	if (TOMORROW_RE.containsMatchIn(text)) return today.plusDays(1)
	val next = NEXT_WEEKDAY_RE.find(text)?.groupValues?.get(1)?.lowercase()?.let(WEEKDAYS::get)
	if (next != null) return today.with(TemporalAdjusters.next(next))
	val bare = WEEKDAY_RE.find(text)?.groupValues?.get(1)?.lowercase()?.let(WEEKDAYS::get)
	return bare?.let { today.with(TemporalAdjusters.next(it)) }
}

/** The same line with its date words taken out. */
private fun stripDatePhrases(text: String, today: LocalDate): String {
	var out = text
	if (dueFrom(out, today) == null) return out
	out = out.replace(TODAY_RE, " ").replace(TOMORROW_RE, " ")
	out = NEXT_WEEKDAY_RE.replace(out) { m ->
		if (WEEKDAYS[m.groupValues[1].lowercase()] != null) " " else m.value
	}
	return out.replace(WEEKDAY_RE, " ")
}

/** Assignee phrase → (userId, unknown handle); [consume] receives the stripped text. */
private fun takeAssignee(text: String, members: List<FamilyMemberDto>, consume: (String) -> Unit): Pair<String?, String?> {
	val named = members
		.filter { it.firstName.isNotBlank() }
		.firstNotNullOfOrNull { member ->
			assigneePatterns(member.firstName.trim()).firstNotNullOfOrNull { pattern ->
				pattern.find(text)?.let { match -> member.userId to match }
			}
		}
	if (named != null) {
		consume(text.removeRange(named.second.range))
		return named.first to null
	}
	val handle = Regex("(^|\\s)@\\s*([\\p{L}\\p{N}_-]+)").find(text) ?: return null to null
	consume(text.removeRange(handle.range))
	return null to "@${handle.groupValues[2]}"
}

/** Triggers a member name may follow, longest trigger first so "assign to" beats "assign". */
private fun assigneePatterns(name: String): List<Regex> = ASSIGNEE_TRIGGERS.map { trigger ->
	val esc = Regex.escape(name)
	if (trigger == "@") {
		Regex("(^|\\s)@\\s*$esc(?=$|\\s|[^\\w])", RegexOption.IGNORE_CASE)
	} else {
		Regex("(^|\\s)$trigger\\s+$esc(?=$|\\s|[^\\w])", RegexOption.IGNORE_CASE)
	}
}
