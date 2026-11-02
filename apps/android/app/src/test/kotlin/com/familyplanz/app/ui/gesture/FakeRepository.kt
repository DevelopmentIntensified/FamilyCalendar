package com.familyplanz.app.ui.gesture

import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.CreateEventRequest
import com.familyplanz.app.data.CreateTaskRequest
import com.familyplanz.app.data.EventDto
import com.familyplanz.app.data.MeDto
import com.familyplanz.app.data.QuickParseResponse
import com.familyplanz.app.data.TaskCategoryDto
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.data.TaskRepository
import kotlinx.coroutines.CompletableDeferred
import java.time.YearMonth

/**
 * In-memory [TaskRepository] for the Compose UI tests (issue 269): every
 * call is recorded, every answer is a settable field. Toggle/respond echo
 * the stored task with the change applied, so the row re-renders from the
 * server's reply exactly as with the network source.
 */
class FakeRepository : TaskRepository {
	var me: ApiResult<MeDto> = ApiResult.Ok(MeDto(id = ME))
	var tasks: ApiResult<List<TaskDto>> = ApiResult.Ok(emptyList())
	var cachedTasks: List<TaskDto>? = null
	var events: ApiResult<List<EventDto>> = ApiResult.Ok(emptyList())
	var cachedEvents: List<EventDto>? = null
	var parse: ApiResult<QuickParseResponse> = ApiResult.Ok(QuickParseResponse())
	var categories: ApiResult<List<TaskCategoryDto>> = ApiResult.Ok(emptyList())

	/** When set, createTask suspends until completed (lets a test see the pending row). */
	var createTaskGate: CompletableDeferred<Unit>? = null

	var allTasksCalls = 0
	val toggled = mutableListOf<String>()
	val focusStarts = mutableListOf<String>()
	var focusStops = 0
	val responses = mutableListOf<Pair<String, String>>()
	val monthRequests = mutableListOf<YearMonth>()
	val parsed = mutableListOf<String>()
	val created = mutableListOf<CreateEventRequest>()
	val createdTasks = mutableListOf<CreateTaskRequest>()

	override suspend fun me(): ApiResult<MeDto> = me

	override suspend fun allTasks(): ApiResult<List<TaskDto>> {
		allTasksCalls++
		return tasks
	}

	override suspend fun cachedTasks(): List<TaskDto>? = cachedTasks

	override suspend fun toggleComplete(id: String): ApiResult<TaskDto> {
		toggled += id
		val task = storedTask(id)
		val flipped = task.copy(completedAt = if (task.completedAt == null) "2026-11-02T10:00:00Z" else null)
		return ApiResult.Ok(flipped)
	}

	override suspend fun createTask(request: CreateTaskRequest): ApiResult<TaskDto> {
		createdTasks += request
		createTaskGate?.await()
		return ApiResult.Ok(TaskDto(id = "srv-${createdTasks.size}", title = request.title, category = request.category))
	}

	override suspend fun taskCategories(): ApiResult<List<TaskCategoryDto>> = categories

	override suspend fun requestFocusStart(taskId: String): ApiResult<Unit> {
		focusStarts += taskId
		return ApiResult.Ok(Unit)
	}

	override suspend fun requestFocusStop(): ApiResult<Unit> {
		focusStops++
		return ApiResult.Ok(Unit)
	}

	override suspend fun respondToAssignment(taskId: String, status: String): ApiResult<TaskDto> {
		responses += taskId to status
		return ApiResult.Ok(storedTask(taskId).copy(assignmentStatus = status))
	}

	override suspend fun monthEvents(year: Int, month: Int): ApiResult<List<EventDto>> {
		monthRequests += YearMonth.of(year, month)
		return events
	}

	override suspend fun cachedEvents(year: Int, month: Int): List<EventDto>? = cachedEvents

	override suspend fun parseQuickAdd(input: String): ApiResult<QuickParseResponse> {
		parsed += input
		return parse
	}

	override suspend fun createEvent(request: CreateEventRequest): ApiResult<EventDto> {
		created += request
		return ApiResult.Ok(EventDto(id = "new-${created.size}", title = request.title, start = request.start))
	}

	private fun storedTask(id: String): TaskDto {
		val list = (tasks as? ApiResult.Ok)?.value ?: cachedTasks.orEmpty()
		return list.first { it.id == id }
	}

	companion object {
		const val ME = "me-1"
	}
}

fun task(id: String, title: String, assignedTo: String? = null, status: String? = null, category: String? = null) =
	TaskDto(id = id, title = title, assignedTo = assignedTo, assignmentStatus = status, category = category)

fun category(name: String) = TaskCategoryDto(id = "cat-$name", name = name, createdAt = "", updatedAt = "")

fun event(id: String, title: String, day: String) =
	EventDto(id = id, title = title, start = "${day}T17:00:00Z", date = day)
