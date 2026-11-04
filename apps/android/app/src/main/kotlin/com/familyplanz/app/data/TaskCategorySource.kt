package com.familyplanz.app.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path

/** One of the caller's task category names (#280; synced with TaskFocus by name). */
@Serializable
data class TaskCategoryDto(
	val id: String,
	val name: String,
	val createdAt: String = "",
	val updatedAt: String = "",
)

@Serializable
data class TaskCategoryListResponse(val categories: List<TaskCategoryDto> = emptyList())

@Serializable
data class TaskCategoryEnvelope(val category: TaskCategoryDto)

@Serializable
data class TaskCategoryNameRequest(val name: String)

/** Retrofit slice for `/api/task-categories` (#280); [FamilyPlanzApi] inherits it. */
interface TaskCategoryApi {
	@GET("api/task-categories")
	suspend fun taskCategories(): TaskCategoryListResponse

	@PATCH("api/task-categories/{id}")
	suspend fun renameTaskCategory(@Path("id") id: String, @Body body: TaskCategoryNameRequest): TaskCategoryEnvelope

	@DELETE("api/task-categories/{id}")
	suspend fun deleteTaskCategory(@Path("id") id: String): TaskAck
}

/** The caller's category list; a new name on create/edit is auto-added server-side. */
interface TaskCategorySource {
	/** `GET /api/task-categories`, name-sorted by the server. */
	suspend fun taskCategories(): ApiResult<List<TaskCategoryDto>>

	/** `PATCH` — renames the category and every task of mine carrying it. */
	suspend fun renameTaskCategory(id: String, name: String): ApiResult<TaskCategoryDto> =
		ApiResult.Err(ApiError.Unsupported)

	/** `DELETE` — my tasks carrying it become uncategorized; 404 = already gone. */
	suspend fun deleteTaskCategory(id: String): ApiResult<Unit> = ApiResult.Err(ApiError.Unsupported)
}

class NetworkTaskCategorySource(private val api: TaskCategoryApi) : TaskCategorySource {
	override suspend fun taskCategories(): ApiResult<List<TaskCategoryDto>> =
		apiCall { api.taskCategories().categories }

	override suspend fun renameTaskCategory(id: String, name: String): ApiResult<TaskCategoryDto> =
		apiCall { api.renameTaskCategory(id, TaskCategoryNameRequest(name)).category }

	override suspend fun deleteTaskCategory(id: String): ApiResult<Unit> =
		when (val result = apiCall { api.deleteTaskCategory(id) }) {
			is ApiResult.Ok -> ApiResult.Ok(Unit)
			is ApiResult.Err -> result
		}
}

/**
 * The caller's categories: loaded best effort (a failure keeps what is
 * shown), and a name used on create is mirrored locally because the server
 * auto-adds it.
 */
class TaskCategoryNames(private val source: TaskCategorySource) {
	private val _items = MutableStateFlow<List<TaskCategoryDto>>(emptyList())

	/** Id + name rows, for the category manager. */
	val items: StateFlow<List<TaskCategoryDto>> = _items

	private val _names = MutableStateFlow<List<String>>(emptyList())
	val names: StateFlow<List<String>> = _names

	suspend fun load() {
		val result = source.taskCategories()
		if (result is ApiResult.Ok) set(result.value)
	}

	fun set(rows: List<TaskCategoryDto>) {
		val sorted = rows.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })
		_items.value = sorted
		_names.value = sorted.map { it.name }
	}

	fun remember(raw: String) {
		val name = raw.trim()
		if (name.isEmpty() || _names.value.any { it.equals(name, ignoreCase = true) }) return
		_names.value = (_names.value + name).sortedWith(String.CASE_INSENSITIVE_ORDER)
	}
}
