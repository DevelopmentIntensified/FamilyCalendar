package com.familyplanz.app.data

interface TaskRepository {
	suspend fun allTasks(): ApiResult<List<TaskDto>>

	suspend fun toggleComplete(id: String): ApiResult<TaskDto>

	suspend fun requestFocusStart(taskId: String): ApiResult<Unit>

	suspend fun requestFocusStop(): ApiResult<Unit>

	suspend fun monthEvents(year: Int, month: Int): ApiResult<List<EventDto>>

	suspend fun parseQuickAdd(input: String): ApiResult<QuickParseResponse>

	suspend fun createEvent(request: CreateEventRequest): ApiResult<EventDto>

	suspend fun me(): ApiResult<MeDto>

	suspend fun respondToAssignment(taskId: String, status: String): ApiResult<TaskDto>

	/** Offline fallback reads (null = nothing cached yet). */
	suspend fun cachedTasks(): List<TaskDto>?

	suspend fun cachedEvents(year: Int, month: Int): List<EventDto>?
}

class NetworkTaskRepository(
	private val api: FamilyPlanzApi,
	private val cache: TaskCache? = null,
) : TaskRepository {
	override suspend fun allTasks(): ApiResult<List<TaskDto>> {
		val result = apiCall { api.tasks().tasks }
		if (result is ApiResult.Ok) cache?.saveTasks(result.value)
		return result
	}

	override suspend fun toggleComplete(id: String): ApiResult<TaskDto> =
		apiCall { api.updateTask(id, TaskUpdatePatch.completeToggle().json).task }

	override suspend fun requestFocusStart(taskId: String): ApiResult<Unit> =
		apiCall {
			api.enqueueFocusCommand(FocusCommandRequest(command = "start", taskId = taskId))
		}

	override suspend fun requestFocusStop(): ApiResult<Unit> =
		apiCall { api.enqueueFocusCommand(FocusCommandRequest(command = "stop")) }

	/** Server preselects a padded month grid around `to`; native groups by `date`. */
	override suspend fun monthEvents(year: Int, month: Int): ApiResult<List<EventDto>> {
		val last = java.time.YearMonth.of(year, month).atEndOfMonth().toString()
		val first = "%04d-%02d-01".format(year, month)
		val result = apiCall { api.events(first, last).events }
		if (result is ApiResult.Ok) cache?.saveEvents(year, month, result.value)
		return result
	}

	override suspend fun parseQuickAdd(input: String): ApiResult<QuickParseResponse> =
		apiCall { api.parseEvent(QuickParseRequest(input)) }

	override suspend fun createEvent(request: CreateEventRequest): ApiResult<EventDto> =
		apiCall { api.createEvent(request).event }

	override suspend fun me(): ApiResult<MeDto> =
		apiCall { api.me() }

	override suspend fun respondToAssignment(taskId: String, status: String): ApiResult<TaskDto> =
		apiCall { api.updateTask(taskId, TaskUpdatePatch.respondAssignment(status).json).task }

	override suspend fun cachedTasks(): List<TaskDto>? = cache?.loadTasks()

	override suspend fun cachedEvents(year: Int, month: Int): List<EventDto>? = cache?.loadEvents(year, month)
}
