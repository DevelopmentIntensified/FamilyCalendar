package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask

/** One person row in the filter sheet (`AssigneeRef` + its live count). */
data class Assignee(val id: String, val name: String, val isViewer: Boolean, val count: Int = 0)

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
	val names = namesOf(all, members)
	val ids = idsOf(all, members)
	val counts = (visible.first.mapNotNull { it.person() } + visible.second.mapNotNull { it.person() })
		.groupingBy { it }
		.eachCount()
	return ids.map { id ->
		val viewer = id == viewerId
		Assignee(id, if (viewer) "You" else names[id] ?: "A member", viewer, counts[id] ?: 0)
	}.sortedWith(compareBy<Assignee>({ !it.isViewer }, { it.name }, { it.id }))
}

private fun namesOf(all: Pair<List<CalendarEvent>, List<CalendarTask>>, members: List<Pair<String, String>>): Map<String, String> {
	val names = linkedMapOf<String, String>()
	all.first.forEach { e -> userOf(e)?.let { p -> e.creatorName?.trim()?.takeIf { it.isNotEmpty() }?.let { names.putIfAbsent(p, it) } } }
	all.second.forEach { t -> userOf(t)?.let { p -> t.assigneeFirstName?.trim()?.takeIf { it.isNotEmpty() }?.let { names[p] = it } } }
	members.forEach { (id, name) -> if (id.isNotBlank() && name.isNotBlank()) names[id] = name.trim() }
	return names
}

private fun idsOf(all: Pair<List<CalendarEvent>, List<CalendarTask>>, members: List<Pair<String, String>>): Set<String> {
	val ids = linkedSetOf<String>()
	members.forEach { (id, _) -> if (id.isNotBlank()) ids += id }
	all.first.mapNotNullTo(ids) { userOf(it) }
	all.second.mapNotNullTo(ids) { userOf(it) }
	return ids
}

private fun userOf(event: CalendarEvent): String? = event.person()

private fun userOf(task: CalendarTask): String? = task.person()
