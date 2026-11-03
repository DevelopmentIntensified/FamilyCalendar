package com.familyplanz.app.domain.tasks

import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskPriority
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** taskUrgency.test.ts / taskSort.test.ts / taskRecurrence.test.ts / taskBulk on the JVM. */
class TaskUrgencyTest {
	private val zone: ZoneId = ZoneId.of("America/Chicago")
	private val nowLocal = LocalDateTime.of(2026, 9, 30, 10, 0)
	private val clock = TaskClock(nowLocal.atZone(zone).toInstant(), zone)

	/** ISO instant `days` from today at `hour` local. */
	private fun localIso(days: Long, hour: Int = 9): String =
		nowLocal.toLocalDate().plusDays(days).atTime(hour, 0).atZone(zone).toInstant().toString()

	private fun task(
		title: String = "Task",
		due: String? = null,
		done: Boolean = false,
		priority: TaskPriority = TaskPriority.NORMAL,
		created: String? = null,
		recurrence: String? = null,
	) = Task(
		id = title, title = title, completed = done, priority = priority, focusMinutes = null, dueDate = due,
		recurringLabel = recurrence, assignedName = null, familyTask = false, assignmentStatus = null, assignedTo = null,
		createdAt = created, completedAt = if (done) localIso(0) else null,
	)

	@Test
	fun buckets_follow_the_local_day() {
		assertEquals(UrgencyBucket.OVERDUE, urgencyBucket(task(due = localIso(-1)), clock))
		assertEquals(UrgencyBucket.OVERDUE, urgencyBucket(task(due = localIso(-7)), clock))
		assertEquals(UrgencyBucket.TODAY, urgencyBucket(task(due = localIso(0, 9)), clock))
		assertEquals(UrgencyBucket.TODAY, urgencyBucket(task(due = localIso(0, 20)), clock))
		assertEquals(UrgencyBucket.UPNEXT, urgencyBucket(task(due = localIso(1)), clock))
		assertEquals(UrgencyBucket.UPNEXT, urgencyBucket(task(), clock))
		assertEquals(UrgencyBucket.DONE, urgencyBucket(task(due = localIso(-30), done = true), clock))
	}

	@Test
	fun flat_list_is_urgency_ordered_and_done_last_under_every_key() {
		val rows = listOf(
			task("up next", localIso(4)),
			task("today evening", localIso(0, 20)),
			task("undated"),
			task("overdue, older", localIso(-6)),
			task("done", localIso(-2), done = true),
			task("today morning", localIso(0, 9)),
			task("overdue, newer", localIso(-1)),
			task("up next sooner", localIso(1)),
		)
		val sorted = rows.sortedWith { a, b -> sortFlatTasks(a, b, TaskSortKey.URGENCY, clock) }
		assertEquals(
			listOf("overdue, older", "overdue, newer", "today morning", "today evening", "up next sooner", "up next", "undated", "done"),
			sorted.map { it.title },
		)
		TaskSortKey.entries.forEach { key ->
			assertEquals(key.name, "done", rows.sortedWith { a, b -> sortFlatTasks(a, b, key, clock) }.last().title)
		}
	}

	@Test
	fun sort_keys_match_task_sort() {
		val high = task("b high", priority = TaskPriority.HIGH, created = "2026-09-01T00:00:00Z")
		val low = task("a low", priority = TaskPriority.LOW, created = "2026-09-20T00:00:00Z")
		val normal = task("c normal", created = "2026-09-10T00:00:00Z")
		val rows = listOf(low, normal, high)
		fun by(key: TaskSortKey) = rows.sortedWith { a, b -> sortFlatTasks(a, b, key, clock) }.map { it.title }
		assertEquals(listOf("b high", "c normal", "a low"), by(TaskSortKey.PRIORITY))
		assertEquals(listOf("a low", "c normal", "b high"), by(TaskSortKey.CREATED))
		assertEquals(listOf("a low", "b high", "c normal"), by(TaskSortKey.TITLE))
		val due = listOf(task("later", localIso(5)), task("none"), task("late", localIso(-2)))
			.sortedWith { a, b -> sortFlatTasks(a, b, TaskSortKey.DUE, clock) }.map { it.title }
		assertEquals(listOf("late", "later", "none"), due)
		assertEquals(listOf("Urgency", "Due date", "Priority", "Created", "Title A–Z"), TaskSortKey.entries.map { it.label })
		assertEquals(TaskSortKey.URGENCY, TaskSortKey.from("garbage"))
	}

	@Test
	fun late_chip_counts_whole_days() {
		assertEquals("1 day late", lateChip(localIso(-1), clock))
		assertEquals("3 days late", lateChip(localIso(-3), clock))
		assertEquals("14 days late", lateChip(localIso(-14), clock))
		assertNull(lateChip(localIso(0, 20), clock))
		assertNull(lateChip(localIso(1), clock))
		assertNull(lateChip(null, clock))
	}

	@Test
	fun cursor_pinned_to_local_end_of_day_is_today_not_late() {
		val evening = TaskClock(LocalDateTime.of(2026, 11, 1, 18, 8).atZone(zone).toInstant(), zone)
		val nov1End = LocalDateTime.of(2026, 11, 1, 23, 59).atZone(zone).toInstant().toString()
		val oct31End = LocalDateTime.of(2026, 10, 31, 23, 59).atZone(zone).toInstant().toString()
		assertEquals(UrgencyBucket.TODAY, urgencyBucket(task(due = nov1End), evening))
		assertNull(lateChip(nov1End, evening))
		assertEquals("1 day late", lateChip(oct31End, evening))
		assertEquals(LocalDate.of(2026, 11, 1), dueLocalDate(nov1End, zone))
	}

	@Test
	fun bucket_counts_feed_the_jump_bar() {
		val counts = bucketCounts(
			listOf(
				task(due = localIso(-2)), task(due = localIso(-1)), task(due = localIso(0, 12)),
				task(due = localIso(3)), task(due = localIso(9)), task(done = true),
			),
			clock,
		)
		assertEquals(mapOf(UrgencyBucket.OVERDUE to 2, UrgencyBucket.TODAY to 1, UrgencyBucket.UPNEXT to 2, UrgencyBucket.DONE to 1), counts)
		assertEquals(listOf("All", "Overdue", "Today", "Up next", "Done"), TimeFilter.entries.map { it.label })
	}

	@Test
	fun recurrence_split_is_order_preserving() {
		val rows = listOf(task("a"), task("b", recurrence = "weekly"), task("c"), task("d", recurrence = "daily"))
		val split = splitByRecurrence(rows)
		assertEquals(listOf("a", "c"), split.oneOff.map { it.title })
		assertEquals(listOf("b", "d"), split.recurring.map { it.title })
	}

	@Test
	fun bulk_split_one_per_line_and_canvas_joined() {
		assertEquals(
			listOf("Buy milk", "Call mom", "Fix sink"),
			splitTaskRecords("- Buy milk\n2. Call mom\n\n• Fix sink", 2026).map { it.text },
		)
		val canvas = splitTaskRecords(
			"Upcoming Assignments\nAssignment\nResearch Paper: Outline\nDue Sep 13 at 11:59pm\n10 pts",
			2026,
		)
		assertEquals(listOf(TaskRecord("Research Paper: Outline Due Sep 13 2026 at 11:59pm", "Assignment")), canvas)
	}
}
