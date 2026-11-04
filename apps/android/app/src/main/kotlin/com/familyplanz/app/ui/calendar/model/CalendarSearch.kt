package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask

/** calendarSearch.ts: every term must appear in the row's text, whatever the order. */
fun normaliseQuery(query: String): String = query.trim().replace(Regex("\\s+"), " ").lowercase()

private fun matches(texts: List<String?>, terms: List<String>): Boolean {
	val hay = texts.filterNotNull().joinToString(" ").lowercase()
	return terms.all { hay.contains(it) }
}

fun eventsBySearch(events: List<CalendarEvent>, query: String): List<CalendarEvent> {
	val terms = normaliseQuery(query).split(' ').filter { it.isNotEmpty() }
	if (terms.isEmpty()) return events
	return events.filter { matches(listOf(it.title, it.description, it.location), terms) }
}

fun tasksBySearch(tasks: List<CalendarTask>, query: String): List<CalendarTask> {
	val terms = normaliseQuery(query).split(' ').filter { it.isNotEmpty() }
	if (terms.isEmpty()) return tasks
	return tasks.filter { matches(listOf(it.title, it.notes), terms) }
}
