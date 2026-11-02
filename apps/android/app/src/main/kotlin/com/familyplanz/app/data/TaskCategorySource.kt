package com.familyplanz.app.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable
import retrofit2.http.GET

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

/** Retrofit slice for `/api/task-categories` (#280); [FamilyPlanzApi] inherits it. */
interface TaskCategoryApi {
	@GET("api/task-categories")
	suspend fun taskCategories(): TaskCategoryListResponse
}

/** The caller's category list (read only on the phone; picking a new name on create auto-adds it server-side). */
interface TaskCategorySource {
	/** `GET /api/task-categories`, name-sorted by the server. */
	suspend fun taskCategories(): ApiResult<List<TaskCategoryDto>>
}

class NetworkTaskCategorySource(private val api: TaskCategoryApi) : TaskCategorySource {
	override suspend fun taskCategories(): ApiResult<List<TaskCategoryDto>> =
		apiCall { api.taskCategories().categories }
}

/**
 * The picker's name list: loaded best effort (a failure keeps what is
 * shown), and a name used on create is mirrored locally because the server
 * auto-adds it.
 */
class TaskCategoryNames(private val source: TaskCategorySource) {
	private val _names = MutableStateFlow<List<String>>(emptyList())
	val names: StateFlow<List<String>> = _names

	suspend fun load() {
		val result = source.taskCategories()
		if (result is ApiResult.Ok) _names.value = result.value.map { it.name }
	}

	fun remember(raw: String) {
		val name = raw.trim()
		if (name.isEmpty() || _names.value.any { it.equals(name, ignoreCase = true) }) return
		_names.value = (_names.value + name).sortedWith(String.CASE_INSENSITIVE_ORDER)
	}
}
