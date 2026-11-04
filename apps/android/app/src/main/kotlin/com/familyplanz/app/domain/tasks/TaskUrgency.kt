@file:Suppress("TooManyFunctions")
package com.familyplanz.app.domain.tasks

import com.familyplanz.app.domain.Task
import java.text.Collator
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit
import java.util.Locale

/*
 * Ports of taskUrgency.ts, taskSort.ts and taskRecurrence.ts: one bucket per
 * task, one comparator, the "N days late" chip, and the one-off/recurring
 * split. Pure: the clock comes in as [TaskClock].
 */

/** The local "now" every urgency rule reads (the web reads `new Date()`). */
data class TaskClock(val now: Instant, val zone: ZoneId) {
	val today: LocalDate get() = now.atZone(zone).toLocalDate()

	companion object {
		fun system(): TaskClock = TaskClock(Instant.now(), ZoneId.systemDefault())
	}
}

/** A due value as an instant: ISO datetime, or a bare `YYYY-MM-DD` read as that local midnight. */
fun dueInstant(due: String?, zone: ZoneId): Instant? {
	if (due.isNullOrBlank()) return null
	return try {
		OffsetDateTime.parse(due).toInstant()
	} catch (_: DateTimeParseException) {
		try {
			LocalDate.parse(due.take(10)).atStartOfDay(zone).toInstant()
		} catch (_: DateTimeParseException) {
			null
		}
	}
}

/** The local calendar day a due value falls on. */
fun dueLocalDate(due: String?, zone: ZoneId): LocalDate? = dueInstant(due, zone)?.atZone(zone)?.toLocalDate()

/** priorityTone.ts isOverdue: before the start of today. */
fun isOverdue(due: String?, clock: TaskClock): Boolean = dueLocalDate(due, clock.zone)?.isBefore(clock.today) == true

/** priorityTone.ts isDueToday. */
fun isDueToday(due: String?, clock: TaskClock): Boolean = dueLocalDate(due, clock.zone) == clock.today

enum class UrgencyBucket { OVERDUE, TODAY, UPNEXT, DONE }

/** The jump bar's filter: all, or one bucket (taskUrgency.ts TIME_FILTERS, in bar order). */
enum class TimeFilter(val label: String, val bucket: UrgencyBucket?) {
	ALL("All", null),
	OVERDUE("Overdue", UrgencyBucket.OVERDUE),
	TODAY("Today", UrgencyBucket.TODAY),
	UPNEXT("Up next", UrgencyBucket.UPNEXT),
	DONE("Done", UrgencyBucket.DONE),
}

/** A finished task is `DONE` whatever its date says. */
fun urgencyBucket(task: Task, clock: TaskClock): UrgencyBucket = when {
	task.completed -> UrgencyBucket.DONE
	isOverdue(task.dueDate, clock) -> UrgencyBucket.OVERDUE
	isDueToday(task.dueDate, clock) -> UrgencyBucket.TODAY
	else -> UrgencyBucket.UPNEXT
}

/** Whole days late; 0 when not overdue. */
@Suppress("ReturnCount")
fun lateDays(due: String?, clock: TaskClock): Long {
	val day = dueLocalDate(due, clock.zone) ?: return 0
	if (!day.isBefore(clock.today)) return 0
	return maxOf(1, ChronoUnit.DAYS.between(day, clock.today))
}

/** "1 day late" / "N days late", or null. */
fun lateChip(due: String?, clock: TaskClock): String? {
	val n = lateDays(due, clock)
	return when (n) {
		0L -> null
		1L -> "1 day late"
		else -> "$n days late"
	}
}

fun bucketCounts(tasks: List<Task>, clock: TaskClock): Map<UrgencyBucket, Int> {
	val counts = UrgencyBucket.entries.associateWith { 0 }.toMutableMap()
	tasks.forEach { counts[urgencyBucket(it, clock)] = counts.getValue(urgencyBucket(it, clock)) + 1 }
	return counts
}

/** TaskToolbar sort options, in the select's order. */
enum class TaskSortKey(val wire: String, val label: String) {
	URGENCY("urgency", "Urgency"),
	DUE("due", "Due date"),
	PRIORITY("priority", "Priority"),
	CREATED("created", "Created"),
	TITLE("title", "Title A–Z"),
	;

	companion object {
		fun from(value: String?): TaskSortKey = entries.firstOrNull { it.wire == value } ?: URGENCY
	}
}

/** `localeCompare(..., {sensitivity: 'base'})`. */
private val baseCollator: Collator = Collator.getInstance(Locale.ROOT).apply { strength = Collator.PRIMARY }

fun compareTitles(a: String, b: String): Int = baseCollator.compare(a, b)

private fun priorityRank(task: Task): Int = when (task.priority) {
	com.familyplanz.app.domain.TaskPriority.HIGH -> 0
	com.familyplanz.app.domain.TaskPriority.NORMAL -> 1
	com.familyplanz.app.domain.TaskPriority.LOW -> 2
}

private fun createdMillis(task: Task, zone: ZoneId): Long = dueInstant(task.createdAt, zone)?.toEpochMilli() ?: 0L

private fun dueMillisOrMax(task: Task, zone: ZoneId): Long = dueInstant(task.dueDate, zone)?.toEpochMilli() ?: Long.MAX_VALUE

/** overdue → today → up next → done, then by due date (undated last), then title. */
fun compareUrgency(a: Task, b: Task, clock: TaskClock): Int {
	val rank = urgencyBucket(a, clock).ordinal.compareTo(urgencyBucket(b, clock).ordinal)
	if (rank != 0) return rank
	val due = dueMillisOrMax(a, clock.zone).compareTo(dueMillisOrMax(b, clock.zone))
	return if (due != 0) due else compareTitles(a.title, b.title)
}

/** taskSort.ts sortTasks. */
fun sortTasks(a: Task, b: Task, key: TaskSortKey, clock: TaskClock): Int = when (key) {
	TaskSortKey.URGENCY -> compareUrgency(a, b, clock)
	TaskSortKey.PRIORITY -> priorityRank(a).compareTo(priorityRank(b))
	TaskSortKey.TITLE -> compareTitles(a.title, b.title)
	TaskSortKey.CREATED -> createdMillis(b, clock.zone).compareTo(createdMillis(a, clock.zone))
	TaskSortKey.DUE -> {
		val nowMs = clock.now.toEpochMilli()
		val aOver = a.dueDate != null && dueMillisOrMax(a, clock.zone) < nowMs
		val bOver = b.dueDate != null && dueMillisOrMax(b, clock.zone) < nowMs
		if (aOver != bOver) {
			if (aOver) -1 else 1
		} else {
			dueMillisOrMax(a, clock.zone).compareTo(dueMillisOrMax(b, clock.zone))
		}
	}
}

/** The flat list's comparator: finished work always last, then [key], then title. */
@Suppress("ReturnCount")
fun sortFlatTasks(a: Task, b: Task, key: TaskSortKey, clock: TaskClock): Int {
	val done = a.completed.compareTo(b.completed)
	if (done != 0) return done
	if (key == TaskSortKey.URGENCY) return compareUrgency(a, b, clock)
	val primary = sortTasks(a, b, key, clock)
	return if (primary != 0) primary else compareTitles(a.title, b.title)
}

/** taskRecurrence.ts: recurring = `recurrenceFrequency` is set. Order-preserving. */
data class RecurrenceSplit(val oneOff: List<Task>, val recurring: List<Task>)

fun splitByRecurrence(rows: List<Task>): RecurrenceSplit {
	val (recurring, oneOff) = rows.partition { it.isRecurring }
	return RecurrenceSplit(oneOff = oneOff, recurring = recurring)
}
