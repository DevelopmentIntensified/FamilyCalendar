package com.familyplanz.app.data

/** Task list, completion, assignment replies and focus command enqueue. */
interface TaskSource {
	suspend fun allTasks(): ApiResult<List<TaskDto>>

	suspend fun toggleComplete(id: String): ApiResult<TaskDto>

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

	override suspend fun requestFocusStart(taskId: String): ApiResult<Unit> =
		apiCall {
			api.enqueueFocusCommand(FocusCommandRequest(command = "start", taskId = taskId))
		}

	override suspend fun requestFocusStop(): ApiResult<Unit> =
		apiCall { api.enqueueFocusCommand(FocusCommandRequest(command = "stop")) }

	override suspend fun respondToAssignment(taskId: String, status: String): ApiResult<TaskDto> =
		apiCall { api.updateTask(taskId, TaskUpdatePatch.respondAssignment(status).json).task }

	override suspend fun cachedTasks(): List<TaskDto>? = cache?.loadTasks()
}
