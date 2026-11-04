@file:Suppress("MatchingDeclarationName")
package com.familyplanz.app.domain.tasks

/*
 * Port of src/lib/utils/taskBulk.ts: a pasted list becomes one record per
 * task. Plain lists stay one per line; Canvas/LMS dumps (type, title,
 * "Due …", score lines) join into single records with the term year pinned.
 */

@Suppress("MatchingDeclarationName")
data class TaskRecord(val text: String, val tag: String)

private val BULLET_RE = Regex("""^[\s•\-*›]+""")
private val NUMBERED_RE = Regex("""^\d+[.)\]]\s*""")
private val CANVAS_TYPE = Regex("""^(assignment|quiz|discussion topic)$""", RegexOption.IGNORE_CASE)
private val CANVAS_SECTION = Regex("""^(overdue|upcoming|past)\s+assignments$""", RegexOption.IGNORE_CASE)
private val CANVAS_DUE = Regex("""^due\s+""", RegexOption.IGNORE_CASE)
private val CANVAS_SCORE = Regex("""(?:\d+\s*/\s*)?\d+\s*pts""", RegexOption.IGNORE_CASE)
private val CANVAS_DUE_YEAR = Regex("""(due\s+[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?)(?!\s*\d{4})""", RegexOption.IGNORE_CASE)
private val LINE_BREAKS = Regex("""\r?\n+""")

private fun cleanLine(s: String): String = s.replace(BULLET_RE, "").replace(NUMBERED_RE, "").trim()

private class CanvasJoin(private val year: Int) {
	val out = mutableListOf<TaskRecord>()
	private val title = mutableListOf<String>()
	private var type = ""
	private var section = ""

	fun line(line: String) {
		when {
			CANVAS_SECTION.matches(line) -> section = line.split(Regex("""\s""")).first().lowercase()
			CANVAS_TYPE.matches(line) -> type = line
			CANVAS_SCORE.containsMatchIn(line) -> Unit
			CANVAS_DUE.containsMatchIn(line) -> flush(line)
			else -> title += line
		}
	}

	private fun flush(rawDue: String) {
		if (title.isEmpty() && rawDue.isEmpty()) return
		val due = rawDue.replace(CANVAS_DUE_YEAR) { "${it.groupValues[1]} $year" }
		out += TaskRecord(
			text = (title + due).filter { it.isNotEmpty() }.joinToString(" "),
			tag = listOf(if (section == "past") "past" else "", type).filter { it.isNotEmpty() }.joinToString(" · "),
		)
		title.clear()
		type = ""
	}

	fun finish(): List<TaskRecord> {
		if (title.isNotEmpty()) out += TaskRecord(title.joinToString(" "), type)
		return out
	}
}

/** One record per task in [raw]; [year] pins Canvas "Due Sep 10" lines to the term year. */
fun splitTaskRecords(raw: String, year: Int): List<TaskRecord> {
	val lines = raw.split(LINE_BREAKS).map(::cleanLine).filter { it.isNotEmpty() }
	if (lines.none { CANVAS_DUE.containsMatchIn(it) }) return lines.map { TaskRecord(it, "") }
	val join = CanvasJoin(year)
	lines.forEach(join::line)
	return join.finish()
}
