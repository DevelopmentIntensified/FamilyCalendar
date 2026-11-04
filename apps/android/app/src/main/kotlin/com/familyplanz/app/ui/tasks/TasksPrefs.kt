package com.familyplanz.app.ui.tasks

import com.familyplanz.app.domain.tasks.TaskSortKey
import java.io.File

/**
 * The two list settings that outlive the process (AC-TK-11: sort survives an
 * app restart; AC-TK-12: the tag filter comes back too). The web keeps them
 * in `localStorage` under `familyplanz:tasksSortBy` / `familyplanz:tagFilter`
 * (`tasks/+page.svelte:91-100`); the phone keeps the same names in a small
 * file beside the task cache.
 */
data class TasksViewPrefs(
	val sort: TaskSortKey = TaskSortKey.URGENCY,
	val tagFilter: String = "",
)

interface TasksPrefs {
	fun load(): TasksViewPrefs

	fun save(prefs: TasksViewPrefs)
}

/** Default for tests and for a ViewModel built without Android storage. */
class MemoryTasksPrefs(private var value: TasksViewPrefs = TasksViewPrefs()) : TasksPrefs {
	override fun load(): TasksViewPrefs = value

	override fun save(prefs: TasksViewPrefs) {
		value = prefs
	}
}

/** `key=value` lines; anything unreadable falls back to the defaults, never a crash on start. */
class FileTasksPrefs(private val file: File) : TasksPrefs {
	override fun load(): TasksViewPrefs = runCatching {
		val lines = file.readLines()
		val sort = lines.firstOrNull { it.startsWith("$KEY_SORT=") }?.substringAfter('=')
		val tag = lines.firstOrNull { it.startsWith("$KEY_TAG=") }?.substringAfter('=').orEmpty()
		TasksViewPrefs(sort = TaskSortKey.from(sort), tagFilter = tag)
	}.getOrElse { TasksViewPrefs() }

	override fun save(prefs: TasksViewPrefs) {
		runCatching {
			file.parentFile?.mkdirs()
			file.writeText("$KEY_SORT=${prefs.sort.wire}\n$KEY_TAG=${prefs.tagFilter}\n")
		}
	}

	private companion object {
		const val KEY_SORT = "tasksSortBy"
		const val KEY_TAG = "tagFilter"
	}
}
