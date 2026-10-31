package com.familyplanz.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.data.TaskRepository
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskMapper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed interface AppUiState {
	data object Loading : AppUiState

	data class NeedToken(val note: String? = null) : AppUiState

	data class Ready(val tasks: List<Task>, val meId: String?) : AppUiState

	data class Failed(val reason: String) : AppUiState
}

data class UiSnack(val text: String)

/**
 * Session (bearer token) + task list + focus command enqueue for the phone.
 * The desktop stays the only focus-time clock: the phone only enqueues
 * start/stop and never writes focusMinutes (spec rule; enforced by
 * TaskUpdatePatch + FocusCommandRequest shapes).
 */
class AppViewModel(
	private val repository: TaskRepository,
	private val tokenStore: DataStoreTokenStore,
) : ViewModel() {
	private val _ui = MutableStateFlow<AppUiState>(AppUiState.Loading)
	val ui: StateFlow<AppUiState> = _ui

	private val _snack = MutableStateFlow<UiSnack?>(null)
	val snack: StateFlow<UiSnack?> = _snack

	init {
		viewModelScope.launch {
			if (tokenStore.token() == null) {
				_ui.value = AppUiState.NeedToken()
			} else {
				refresh()
			}
		}
	}

	private suspend fun loadMe(): String? {
		return when (val result = repository.me()) {
			is ApiResult.Ok -> result.value.id
			else -> null
		}
	}

	fun consumeSnack() {
		_snack.value = null
	}

	fun saveToken(value: String) {
		viewModelScope.launch {
			tokenStore.save(value.trim())
			refresh()
		}
	}

	/** Mint a new token in the web app (Settings > API tokens). */
	fun clearToken() {
		viewModelScope.launch {
			tokenStore.clear()
			_ui.value = AppUiState.NeedToken()
		}
	}

	fun refresh() {
		viewModelScope.launch {
			_ui.value = AppUiState.Loading
			val meId = loadMe()
			when (val result = repository.allTasks()) {
				is ApiResult.Ok -> _ui.value = AppUiState.Ready(result.value.map(TaskMapper::fromDto), meId)
				is ApiResult.Err -> {
					if (result.error is ApiError.Unauthorized) {
						presentError(result)
					} else {
						val cached = repository.cachedTasks()
						if (cached != null) {
							_ui.value = AppUiState.Ready(cached.map(TaskMapper::fromDto), null)
							_snack.value = UiSnack("Offline - showing the last synced tasks")
						} else {
							presentError(result)
						}
					}
				}
			}
		}
	}

	fun respondAssignment(task: Task, status: String) {
		viewModelScope.launch {
			when (val result = repository.respondToAssignment(task.id, status)) {
				is ApiResult.Ok -> {
					replaceTask(result.value)
					_snack.value = UiSnack(
						if (status == "accepted") {
							"Task accepted - it moved to your list"
						} else {
							"Task declined - back to the assigner"
						},
					)
				}

				is ApiResult.Err -> presentError(result)
			}
		}
	}

	/** Hand-hosted hook: any other screen's 401 swaps the host to token entry. */
	fun invalidateSession(note: String = "Sign in again - mint a new token in the web app (Settings > API tokens).") {
		_ui.value = AppUiState.NeedToken(note)
	}

	fun toggleComplete(task: Task) {
		viewModelScope.launch {
			when (val result = repository.toggleComplete(task.id)) {
				is ApiResult.Ok -> replaceTask(result.value)
				is ApiResult.Err -> presentError(result)
			}
		}
	}

	fun startFocus(task: Task) {
		viewModelScope.launch {
			when (val result = repository.requestFocusStart(task.id)) {
				is ApiResult.Ok ->
					_snack.value = UiSnack("Focus start queued for \"${task.title}\"")
				is ApiResult.Err -> presentError(result)
			}
		}
	}

	fun stopFocus() {
		viewModelScope.launch {
			when (val result = repository.requestFocusStop()) {
				is ApiResult.Ok -> _snack.value = UiSnack("Focus stop queued")
				is ApiResult.Err -> presentError(result)
			}
		}
	}

	private fun replaceTask(updatedDto: com.familyplanz.app.data.TaskDto) {
		val updated = TaskMapper.fromDto(updatedDto)
		val current = _ui.value
		if (current is AppUiState.Ready) {
			_ui.value = current.copy(tasks = current.tasks.map { if (it.id == updated.id) updated else it })
		}
	}

	private fun presentError(result: ApiResult.Err) {
		when (val error = result.error) {
			ApiError.Unauthorized -> _ui.value = AppUiState.NeedToken(error.message)
			else -> {
				_ui.value = AppUiState.Failed(error.message)
				_snack.value = UiSnack(error.message)
			}
		}
	}
}
