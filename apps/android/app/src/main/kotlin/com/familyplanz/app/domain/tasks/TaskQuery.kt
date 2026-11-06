package com.familyplanz.app.domain.tasks

import com.familyplanz.app.domain.Task

/*
 * #292 L3: the Tasks main list's query, as one pure step. Mirrors
 * `TasksMainList.svelte:120-186` (scope chip, then search + tag, then the
 * owner axis, then the time jump bar) and `TaskToolbar.svelte:88-101`
 * (counts and the "N of M match" line). The clock comes in as [TaskClock], so
 * every rule here is a table test.
 */

/** `TaskToolbar.svelte:43-46` owner axis, in the approved order. */
enum class OwnerView(val label: String) {
	OPEN("Open"),
	MINE("Mine"),
	CREATED("Created by me"),
	DONE("Done"),
}

/** `TaskToolbar.svelte:9-14` scope axis (a different question from the owner axis). */
enum class ScopeChip(val label: String) {
	EVERY("Every scope"),
	PUBLIC("Public"),
	PRIVATE("Private"),
	FAMILY("Family"),
}

/** Everything the toolbar and jump bar hold; the sort and tag survive a restart. */
data class TaskQuery(
	val view: OwnerView = OwnerView.OPEN,
	val scope: ScopeChip = ScopeChip.EVERY,
	val time: TimeFilter = TimeFilter.ALL,
	val search: String = "",
	val tag: String = "",
	val sort: TaskSortKey = TaskSortKey.URGENCY,
) {
	val searchActive: Boolean get() = search.trim().isNotEmpty()

	val tagActive: Boolean get() = tag.trim().isNotEmpty()

	/** Any control narrowed the list (the empty state names the filters when so). */
	val filtered: Boolean
		get() = view != OwnerView.OPEN || scope != ScopeChip.EVERY || time != TimeFilter.ALL || searchActive || tagActive

	/** Scope/owner/time reached a non-default setting (the sky "Showing …" line). */
	val showingActive: Boolean
		get() = view != OwnerView.OPEN || scope != ScopeChip.EVERY || time != TimeFilter.ALL
}

/** What the list renders after [query] ran: rows, counts and the match line. */
data class TaskMatch(
	val rows: List<Task>,
	/** Rows left after search/tag/scope, before the owner and time axes (the "% of %"). */
	val total: Int,
	val counts: Map<UrgencyBucket, Int>,
) {
	val matched: Int get() = rows.size
}

/** One labelled band of the flat list (`TasksMainList.svelte:290`). */
data class TaskGroup(val label: String, val tasks: List<Task>)

private fun scopeAllows(task: Task, scope: ScopeChip): Boolean = when (scope) {
	ScopeChip.EVERY -> true
	ScopeChip.FAMILY -> task.familyId != null
	ScopeChip.PUBLIC -> task.familyId == null && task.visibility != "private"
	ScopeChip.PRIVATE -> task.familyId == null && task.visibility == "private"
}

private fun matchesSearch(task: Task, needle: String): Boolean = needle.isEmpty() ||
	task.title.contains(needle, ignoreCase = true) ||
	task.notes?.contains(needle, ignoreCase = true) == true

private fun matchesTag(task: Task, needle: String): Boolean {
	if (needle.isEmpty()) return true
	return task.tags.any { tag -> tag.removePrefix("#").startsWith(needle, ignoreCase = true) }
}

private fun inOwnerView(task: Task, view: OwnerView, meId: String?): Boolean = when (view) {
	// Web ruling (TasksMainList.svelte:135): Open is unfiltered, finished work sorts last;
	// Done is the bucket that shows finished work alone.
	OwnerView.OPEN -> true
	// The prototype's own predicate (tasks.html:167); the label no longer lies (TaskToolbar.svelte:16-42).
	OwnerView.MINE -> meId != null && task.assignedTo == meId
	OwnerView.CREATED -> meId != null && task.userId == meId
	OwnerView.DONE -> task.completed
}

/**
 * The whole list pipeline. `total` counts the owner axis' universe before
 * search/tag/time cut it down, so "1 of 8 match …" reads as it does on the
 * web (AC-TK-10: eight open tasks, one hit).
 */
fun applyTaskQuery(tasks: List<Task>, query: TaskQuery, meId: String?, clock: TaskClock): TaskMatch {
	val needle = query.search.trim()
	val tag = query.tag.trim().removePrefix("#")
	val inScope = tasks.filter { scopeAllows(it, query.scope) }
	val inView = inScope.filter { inOwnerView(it, query.view, meId) }
	val bucket = query.time.bucket
	val rows = inView
		.filter { matchesSearch(it, needle) && matchesTag(it, tag) && (bucket == null || urgencyBucket(it, clock) == bucket) }
		.sortedWith { a, b -> sortFlatTasks(a, b, query.sort, clock) }
	return TaskMatch(rows = rows, total = inView.size, counts = bucketCounts(inView, clock))
}

/** `TaskToolbar.svelte:99`: the live count under "Filter". */
fun TaskMatch.matchLine(query: TaskQuery): String {
	val needle = query.search.trim()
	return if (needle.isEmpty()) "$matched tasks" else "$matched of $total match \u201c$needle\u201d"
}

/** One-off band first (what needs you now), recurring second; empty bands are dropped. */
fun groupRows(rows: List<Task>): List<TaskGroup> {
	val split = splitByRecurrence(rows)
	return listOf(TaskGroup("ONE-OFF", split.oneOff), TaskGroup("RECURRING", split.recurring))
		.filter { it.tasks.isNotEmpty() }
}

/** `TasksHeader.svelte`: "3 tasks open · 5 completed". */
fun headerLine(open: Int, completed: Int): String {
	val openLabel = if (open == 1) "1 task open" else "$open tasks open"
	return "$openLabel \u00b7 $completed completed"
}

/** The list's empty state: filters active name the filters, else the first-run copy. */
data class TaskEmptyState(val title: String, val hint: String)

fun emptyState(match: TaskMatch, query: TaskQuery): TaskEmptyState = if (query.filtered || match.total > match.matched) {
	TaskEmptyState("No matching tasks", "Try another chip, or clear the search and filters")
} else {
	TaskEmptyState("No tasks yet", "Add your first task above")
}

/** The jump bar's counts: the "All" chip reads the whole matched set. */
fun TaskMatch.timeCount(filter: TimeFilter): Int = filter.bucket?.let { counts[it] } ?: matched
