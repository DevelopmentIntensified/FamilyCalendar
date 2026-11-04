package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask

/*
 * The three reading filters (Calendar.svelte:350-420), applied above every
 * view so month, week, day and list never disagree: calendars, then search,
 * then people. Ports of calendarFilter / calendarSearch / calendarAssignees.
 */

/** One person row in the filter sheet (`AssigneeRef` + its live count). */
data class Assignee(val id: String, val name: String, val isViewer: Boolean, val count: Int = 0)

/** A sponsored row belongs to no calendar, so no calendar or person filter can hide it. */
private fun CalendarEvent.isAdRow() = isAd || calendarId.isBlank()

fun visibleEventsByCalendar(events: List<CalendarEvent>, hidden: Set<String>): List<CalendarEvent> =
	if (hidden.isEmpty()) events else events.filter { it.isAdRow() || it.calendarId !in hidden }

fun visibleTasksByCalendar(tasks: List<CalendarTask>, hidden: Set<String>): List<CalendarTask> =
	if (hidden.isEmpty()) tasks else tasks.filter { it.calendarId == null || it.calendarId !in hidden }

fun normaliseQuery(query: String): String = query.trim().replace(Regex("\\s+"), " ").lowercase()

/** Every term must appear in title, description or location (calendarSearch.ts). */
fun eventsBySearch(events: List<CalendarEvent>, query: String): List<CalendarEvent> {
	val q = normaliseQuery(query)
	if (q.isEmpty()) return events
	val terms = q.split(' ')
	return events.filter { e ->
		val hay = listOfNotNull(e.title, e.description, e.location).joinToString(" ").lowercase()
		terms.all { hay.contains(it) }
	}
}

fun tasksBySearch(tasks: List<CalendarTask>, query: String): List<CalendarTask> {
	val q = normaliseQuery(query)
	if (q.isEmpty()) return tasks
	val terms = q.split(' ')
	return tasks.filter { t ->
		val hay = listOfNotNull(t.title, t.notes).joinToString(" ").lowercase()
		terms.all { hay.contains(it) }
	}
}

private fun CalendarEvent.person(): String? = if (isAdRow()) null else ownerId.trim().ifEmpty { null }

private fun CalendarTask.person(): String? = if (calendarId == null) null else assignedTo?.trim()?.ifEmpty { null }

fun eventsByAssignee(events: List<CalendarEvent>, hidden: Set<String>): List<CalendarEvent> =
	if (hidden.isEmpty()) events else events.filter { e -> e.person()?.let { it !in hidden } ?: e.isAdRow() }

fun tasksByAssignee(tasks: List<CalendarTask>, hidden: Set<String>): List<CalendarTask> =
	if (hidden.isEmpty()) tasks else tasks.filter { t -> t.person()?.let { it !in hidden } ?: (t.calendarId == null) }

/**
 * `assigneeRoster` + `assigneeCounts`: the family roster plus everyone with
 * something here; the viewer first as "You", then by name. Counts come from
 * the already-filtered rows, so a 0 is why the grid is empty.
 */
fun assigneeRows(
	all: Pair<List<CalendarEvent>, List<CalendarTask>>,
	visible: Pair<List<CalendarEvent>, List<CalendarTask>>,
	viewerId: String?,
	members: List<Pair<String, String>>,
): List<Assignee> {
	val names = linkedMapOf<String, String>()
	all.first.forEach { e -> e.person()?.let { p -> e.creatorName?.trim()?.takeIf { it.isNotEmpty() }?.let { names.putIfAbsent(p, it) } } }
	all.second.forEach { t -> t.person()?.let { p -> t.assigneeFirstName?.trim()?.takeIf { it.isNotEmpty() }?.let { names[p] = it } } }
	members.forEach { (id, name) -> if (id.isNotBlank() && name.isNotBlank()) names[id] = name.trim() }
	val ids = linkedSetOf<String>()
	members.forEach { (id, _) -> if (id.isNotBlank()) ids += id }
	all.first.mapNotNullTo(ids) { it.person() }
	all.second.mapNotNullTo(ids) { it.person() }
	val counts = (visible.first.mapNotNull { it.person() } + visible.second.mapNotNull { it.person() }).groupingBy { it }.eachCount()
	return ids.map { id ->
		val viewer = id == viewerId
		Assignee(id, if (viewer) "You" else names[id] ?: "A member", viewer, counts[id] ?: 0)
	}.sortedWith(compareBy<Assignee>({ !it.isViewer }, { it.name }, { it.id }))
}
