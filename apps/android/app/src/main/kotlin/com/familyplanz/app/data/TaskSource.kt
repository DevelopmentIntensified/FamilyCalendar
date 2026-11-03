package com.familyplanz.app.data

/** Task list, creation, completion, assignment replies and focus command enqueue. */
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
}

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
}
