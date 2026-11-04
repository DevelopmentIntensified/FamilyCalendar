package com.familyplanz.app.data

/**
 * Task list, creation, completion, edits, deletes, assignment replies and
 * focus command enqueue. The Tasks-screen reads added for #292 have default
 * bodies (a server or fake without them answers [ApiError.Unsupported]).
 */
@Suppress("TooManyFunctions")
interface TaskSource {
	suspend fun allTasks(): ApiResult<List<TaskDto>>

	suspend fun toggleComplete(id: String): ApiResult<TaskDto>

	/** POST /api/tasks; Ok carries the server task (server-generated id). */
	suspend fun createTask(request: CreateTaskRequest): ApiResult<TaskDto>

	suspend fun requestFocusStart(taskId: String): ApiResult<Unit>

	suspend fun requestFocusStop(): ApiResult<Unit>

	suspend fun respondToAssignment(taskId: String, status: String): ApiResult<TaskDto>

	/** Offline fallback read (null = nothing cached yet). */
	suspend fun cachedTasks(): List<TaskDto>?

	/** G9 `GET /api/tasks/sections`. */
	suspend fun taskSections(): ApiResult<TaskSectionsDto> = ApiResult.Err(ApiError.Unsupported)

	/** G4 `GET /api/family/roster` (my family; empty when I have none). */
	suspend fun familyRoster(): ApiResult<FamilyRosterDto> = ApiResult.Err(ApiError.Unsupported)

	/** `PUT /api/tasks/{id}` with only the changed fields ([TaskUpdatePatch]). */
	suspend fun updateTask(id: String, patch: TaskUpdatePatch): ApiResult<TaskDto> = ApiResult.Err(ApiError.Unsupported)

	suspend fun deleteTask(id: String): ApiResult<Unit> = ApiResult.Err(ApiError.Unsupported)

	suspend fun clearCompleted(): ApiResult<Unit> = ApiResult.Err(ApiError.Unsupported)
}

@Suppress("TooManyFunctions")
class NetworkTaskSource(
	private val api: FamilyPlanzApi,
	private val cache: TaskCache? = null,
) : TaskSource {
	override suspend fun allTasks(): ApiResult<List<TaskDto>> {
		val result = apiCall { api.tasks().tasks }
		if (result is ApiResult.Ok) cache?.saveTasks(result.value)
		return result
	}

	override suspend fun toggleComplete(id: String): ApiResult<TaskDto> =
		apiCall { api.updateTask(id, TaskUpdatePatch.completeToggle().json).task }

	override suspend fun createTask(request: CreateTaskRequest): ApiResult<TaskDto> =
		apiCall { api.createTask(request).task }

	override suspend fun requestFocusStart(taskId: String): ApiResult<Unit> =
		focusCommand(FocusCommandRequest(command = "start", taskId = taskId))

	override suspend fun requestFocusStop(): ApiResult<Unit> =
		focusCommand(FocusCommandRequest(command = "stop"))

	/** 404/405 on the command route = a server that predates it (#290), not a failure. */
	private suspend fun focusCommand(body: FocusCommandRequest): ApiResult<Unit> =
		apiCall(statusError = { code -> ApiError.Unsupported.takeIf { code == 404 || code == 405 } }) {
			api.enqueueFocusCommand(body)
		}

	override suspend fun respondToAssignment(taskId: String, status: String): ApiResult<TaskDto> =
		apiCall { api.updateTask(taskId, TaskUpdatePatch.respondAssignment(status).json).task }

	override suspend fun cachedTasks(): List<TaskDto>? = cache?.loadTasks()

	/** 404 = a server that predates G9: the caller falls back to `GET /api/tasks`. */
	override suspend fun taskSections(): ApiResult<TaskSectionsDto> {
		val result = apiCall(statusError = { code -> ApiError.Unsupported.takeIf { code == 404 } }) { api.taskSections() }
		if (result is ApiResult.Ok) cache?.saveTasks(result.value.myTasks)
		return result
	}

	override suspend fun familyRoster(): ApiResult<FamilyRosterDto> =
		apiCall(statusError = { code -> ApiError.Unsupported.takeIf { code == 404 } }) { api.familyRoster() }

	override suspend fun updateTask(id: String, patch: TaskUpdatePatch): ApiResult<TaskDto> =
		apiCall { api.updateTask(id, patch.json).task }

	override suspend fun deleteTask(id: String): ApiResult<Unit> = apiCall { api.deleteTask(id) }.unit()

	override suspend fun clearCompleted(): ApiResult<Unit> = apiCall { api.clearCompleted() }.unit()

	private fun ApiResult<TaskAck>.unit(): ApiResult<Unit> = when (this) {
		is ApiResult.Ok -> ApiResult.Ok(Unit)
		is ApiResult.Err -> this
	}
}
