package com.familyplanz.app.data

interface TaskRepository {
	suspend fun allTasks(): ApiResult<List<TaskDto>>

	suspend fun toggleComplete(id: String): ApiResult<TaskDto>

	suspend fun requestFocusStart(taskId: String): ApiResult<Unit>

	suspend fun requestFocusStop(): ApiResult<Unit>
}

class NetworkTaskRepository(private val api: FamilyPlanzApi) : TaskRepository {
	override suspend fun allTasks(): ApiResult<List<TaskDto>> =
		apiCall { api.tasks().tasks }

	override suspend fun toggleComplete(id: String): ApiResult<TaskDto> =
		apiCall { api.updateTask(id, TaskUpdatePatch.completeToggle().json).task }

	override suspend fun requestFocusStart(taskId: String): ApiResult<Unit> =
		apiCall {
			api.enqueueFocusCommand(FocusCommandRequest(command = "start", taskId = taskId))
		}

	override suspend fun requestFocusStop(): ApiResult<Unit> =
		apiCall { api.enqueueFocusCommand(FocusCommandRequest(command = "stop")) }
}
