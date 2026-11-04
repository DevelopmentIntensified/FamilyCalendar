package com.familyplanz.app.ui.tasks

import com.familyplanz.app.domain.tasks.TaskSortKey
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** AC-TK-11/12: sort and tag filter survive a restart (a second load of the same file). */
class TasksPrefsTest {
	@get:Rule
	val folder = TemporaryFolder()

	@Test
	fun file_prefs_round_trip_sort_and_tag() {
		val file = folder.newFile("tasks-view.txt")
		FileTasksPrefs(file).save(TasksViewPrefs(sort = TaskSortKey.TITLE, tagFilter = "gro"))

		// A new instance over the same file is what a restart looks like.
		val reloaded = FileTasksPrefs(file).load()
		assertEquals(TaskSortKey.TITLE, reloaded.sort)
		assertEquals("gro", reloaded.tagFilter)
	}

	@Test
	fun missing_or_broken_file_falls_back_to_the_defaults() {
		val missing = FileTasksPrefs(folder.root.resolve("nope.txt")).load()
		assertEquals(TaskSortKey.URGENCY, missing.sort)
		assertEquals("", missing.tagFilter)

		val broken = folder.newFile("broken.txt").apply { writeText("garbage") }
		assertEquals(TaskSortKey.URGENCY, FileTasksPrefs(broken).load().sort)
	}

	@Test
	fun memory_prefs_default_to_urgency_and_no_tag() {
		assertEquals(TasksViewPrefs(), MemoryTasksPrefs().load())
	}
}
