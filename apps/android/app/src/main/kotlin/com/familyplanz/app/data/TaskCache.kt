package com.familyplanz.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Offline fallback: the phone keeps the last successful lists as JSON files
 * and serves them when the network fails (cache-aside; the server's API has
 * no updatedAt watermark, so full-refresh reconcile is the contract — see
 * docs/issues/210 slice 6 note).
 */
interface TaskCache {
	suspend fun saveTasks(tasks: List<TaskDto>)

	suspend fun loadTasks(): List<TaskDto>?

	suspend fun saveEvents(year: Int, month: Int, events: List<EventDto>)

	suspend fun loadEvents(year: Int, month: Int): List<EventDto>?
}

/** Pure JSON codec — unit-testable without Android framework. */
object TaskCacheCodec {
	private val json = Json {
		ignoreUnknownKeys = true
		encodeDefaults = false
	}

	fun encodeTasks(tasks: List<TaskDto>): String = json.encodeToString(tasks)

	fun decodeTasks(text: String?): List<TaskDto>? =
		text?.let { raw ->
			runCatching { json.decodeFromString<List<TaskDto>>(raw) }.getOrNull()
		}

	fun encodeEvents(events: List<EventDto>): String = json.encodeToString(events)

	fun decodeEvents(text: String?): List<EventDto>? =
		text?.let { raw ->
			runCatching { json.decodeFromString<List<EventDto>>(raw) }.getOrNull()
		}
}

class FileTaskCache(private val filesDir: File) : TaskCache {
	private fun fileFor(name: String): File = File(filesDir, name)

	override suspend fun saveTasks(tasks: List<TaskDto>) = withContext(Dispatchers.IO) {
		fileFor("tasks-cache.json").writeText(TaskCacheCodec.encodeTasks(tasks))
	}

	override suspend fun loadTasks(): List<TaskDto>? = withContext(Dispatchers.IO) {
		val file = fileFor("tasks-cache.json")
		TaskCacheCodec.decodeTasks(if (file.exists()) file.readText() else null)
	}

	override suspend fun saveEvents(year: Int, month: Int, events: List<EventDto>) =
		withContext(Dispatchers.IO) {
			fileFor("events-$year-$month-cache.json").writeText(TaskCacheCodec.encodeEvents(events))
		}

	override suspend fun loadEvents(year: Int, month: Int): List<EventDto>? =
		withContext(Dispatchers.IO) {
			val file = fileFor("events-$year-$month-cache.json")
			TaskCacheCodec.decodeEvents(if (file.exists()) file.readText() else null)
		}
}
