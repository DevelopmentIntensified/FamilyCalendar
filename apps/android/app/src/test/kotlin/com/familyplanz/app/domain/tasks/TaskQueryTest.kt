package com.familyplanz.app.domain.tasks

import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskPriority
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * #292 L3: the Tasks main list's query (owner chips, scope chips, time chips,
 * search, tag filter, sort) is pure so every AC-TK rule about which rows
 * survive is a table test, not a screenshot.
 */
class TaskQueryTest {
	private val clock = TaskClock(LocalDate.of(2026, 11, 4).atTime(12, 0).toInstant(ZoneOffset.UTC), ZoneOffset.UTC)
	private val me = "me-1"

	@Suppress("LongParameterList")
	private fun task(
		id: String,
		title: String = id,
		completed: Boolean = false,
		due: String? = null,
		assignedTo: String? = null,
		userId: String = "mate-1",
		familyId: String? = null,
		visibility: String = "public",
		recurring: String? = null,
		tags: List<String> = emptyList(),
		priority: TaskPriority = TaskPriority.NORMAL,
		notes: String? = null,
	) = Task(
		id = id,
		title = title,
		completed = completed,
		priority = priority,
		focusMinutes = null,
		dueDate = due,
		recurringLabel = recurring,
		assignedName = null,
		familyTask = familyId != null,
		assignmentStatus = null,
		assignedTo = assignedTo,
		userId = userId,
		familyId = familyId,
		visibility = visibility,
		tags = tags,
		notes = notes,
	)

	private val rows = listOf(
		task("open-1", "Buy milk", due = "2026-11-04"),
		task("overdue-1", "Pay rent", due = "2026-11-01"),
		task("done-1", "Post letter", completed = true),
		task("mine-1", "Fix bike", assignedTo = me),
		task("other-1", "Water plants", assignedTo = "mate-2"),
		task("created-1", "Book dentist", userId = me, assignedTo = "mate-2"),
		task("family-1", "Family shop", familyId = "fam-1", visibility = "public"),
		task("private-1", "Private note", visibility = "private"),
		task("recur-1", "Water garden", recurring = "weekly", due = "2026-11-09"),
	)

	@Test
	fun open_chip_is_the_first_paint_and_shows_every_open_row() {
		val match = applyTaskQuery(rows, TaskQuery(), me, clock)
		assertEquals(
			listOf("overdue-1", "open-1", "recur-1", "created-1", "family-1", "mine-1", "private-1", "other-1"),
			match.rows.map { it.id },
		)
	}

	@Test
	fun done_chip_shows_only_completed_rows_and_mine_created_follow_their_predicates() {
		assertEquals(listOf("done-1"), applyTaskQuery(rows, TaskQuery(view = OwnerView.DONE), me, clock).rows.map { it.id })
		assertEquals(listOf("mine-1"), applyTaskQuery(rows, TaskQuery(view = OwnerView.MINE), me, clock).rows.map { it.id })
		assertEquals(
			listOf("created-1"),
			applyTaskQuery(rows, TaskQuery(view = OwnerView.CREATED), me, clock).rows.map { it.id },
		)
	}

	@Test
	fun scope_chips_partition_family_public_and_private() {
		assertEquals(
			listOf("family-1"),
			applyTaskQuery(rows, TaskQuery(scope = ScopeChip.FAMILY), me, clock).rows.map { it.id },
		)
		assertEquals(
			listOf("private-1"),
			applyTaskQuery(rows, TaskQuery(scope = ScopeChip.PRIVATE), me, clock).rows.map { it.id },
		)
		val public = applyTaskQuery(rows, TaskQuery(scope = ScopeChip.PUBLIC), me, clock).rows.map { it.id }
		assertTrue(public.contains("open-1"))
		assertTrue(!public.contains("private-1") && !public.contains("family-1"))
	}

	@Test
	fun time_chips_carry_counts_and_today_keeps_only_todays_rows() {
		val all = applyTaskQuery(rows, TaskQuery(), me, clock)
		assertEquals(1, all.counts[UrgencyBucket.OVERDUE])
		assertEquals(1, all.counts[UrgencyBucket.TODAY])
		assertEquals(6, all.counts[UrgencyBucket.UPNEXT])
		assertEquals(0, all.counts[UrgencyBucket.DONE])

		val today = applyTaskQuery(rows, TaskQuery(time = TimeFilter.TODAY), me, clock)
		assertEquals(listOf("open-1"), today.rows.map { it.id })
	}

	@Test
	fun search_shows_the_match_line_and_only_matching_rows() {
		val match = applyTaskQuery(rows, TaskQuery(search = "milk"), me, clock)
		assertEquals(listOf("open-1"), match.rows.map { it.id })
		assertEquals(1, match.matched)
		assertEquals(8, match.total)
		assertEquals("1 of 8 match \u201cmilk\u201d", match.matchLine(TaskQuery(search = "milk")))
	}

	@Test
	fun search_reads_notes_and_ignores_case() {
		val noted = rows + task("noted-1", "Groceries", notes = "Milk and bread")
		val match = applyTaskQuery(noted, TaskQuery(search = "MILK"), me, clock)
		assertEquals(listOf("open-1", "noted-1"), match.rows.map { it.id })
	}

	@Test
	fun tag_filter_matches_by_prefix_and_clears_with_an_empty_value() {
		val tagged = rows + task("tagged-1", "Weekly shop", tags = listOf("groceries"))
		val match = applyTaskQuery(tagged, TaskQuery(tag = "gro"), me, clock)
		assertEquals(listOf("tagged-1"), match.rows.map { it.id })
		assertTrue(applyTaskQuery(tagged, TaskQuery(tag = "#gro"), me, clock).rows.map { it.id } == listOf("tagged-1"))
		assertEquals(9, applyTaskQuery(tagged, TaskQuery(tag = ""), me, clock).rows.size)
	}

	@Test
	fun sort_options_persist_by_wire_name_and_cover_all_five() {
		assertEquals(TaskSortKey.URGENCY, TaskSortKey.from("urgency"))
		assertEquals(TaskSortKey.DUE, TaskSortKey.from("due"))
		assertEquals(TaskSortKey.PRIORITY, TaskSortKey.from("priority"))
		assertEquals(TaskSortKey.CREATED, TaskSortKey.from("created"))
		assertEquals(TaskSortKey.TITLE, TaskSortKey.from("title"))
		assertEquals(TaskSortKey.URGENCY, TaskSortKey.from("nonsense"))

		val titles = applyTaskQuery(rows, TaskQuery(sort = TaskSortKey.TITLE), me, clock).rows.map { it.title }
		assertEquals(titles.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it }), titles)
	}

	@Test
	fun title_sort_puts_finished_work_last() {
		val sorted = applyTaskQuery(rows, TaskQuery(view = OwnerView.MINE, sort = TaskSortKey.TITLE), me, clock)
		assertEquals(listOf("mine-1"), sorted.rows.map { it.id })
		val withDone = applyTaskQuery(
			rows + task("mine-done", "Aardvark", completed = true, assignedTo = me),
			TaskQuery(view = OwnerView.MINE, sort = TaskSortKey.TITLE),
			me,
			clock,
		)
		assertEquals(listOf("mine-1", "mine-done"), withDone.rows.map { it.id })
	}

	@Test
	fun rows_group_one_off_first_then_recurring_with_counts() {
		val groups = groupRows(applyTaskQuery(rows, TaskQuery(), me, clock).rows)
		assertEquals(listOf("ONE-OFF", "RECURRING"), groups.map { it.label })
		assertEquals(7, groups[0].tasks.size)
		assertEquals(listOf("recur-1"), groups[1].tasks.map { it.id })
	}

	@Test
	fun header_counts_open_and_completed() {
		assertEquals("3 tasks open \u00b7 5 completed", headerLine(3, 5))
		assertEquals("1 task open \u00b7 0 completed", headerLine(1, 0))
	}

	@Test
	fun empty_state_names_the_filters_when_they_hid_everything() {
		val none = applyTaskQuery(emptyList(), TaskQuery(), null, clock)
		assertEquals("No tasks yet", emptyState(none, TaskQuery()).title)
		assertEquals("Add your first task above", emptyState(none, TaskQuery()).hint)

		val filtered = applyTaskQuery(rows, TaskQuery(search = "zzz"), me, clock)
		assertEquals("No matching tasks", emptyState(filtered, TaskQuery(search = "zzz")).title)
		assertEquals("Try another chip, or clear the search and filters", emptyState(filtered, TaskQuery(search = "zzz")).hint)
	}

	@Test
	fun no_search_means_the_filter_line_counts_the_tasks() {
		val all = applyTaskQuery(rows, TaskQuery(), me, clock)
		assertEquals("8 tasks", all.matchLine(TaskQuery()))
	}
}


