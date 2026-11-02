package com.familyplanz.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.data.TaskCategoryNames
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.data.TaskRepository
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskMapper
import com.familyplanz.app.push.SessionHooks
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface AppUiState {
	data object Loading : AppUiState

	data class NeedToken(val note: String? = null) : AppUiState

	/** `createError` = last add-task failure, shown inline under the add field. */
	data class Ready(
		val tasks: List<Task>,
		val meId: String?,
		val createError: String? = null,
	) : AppUiState

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
	private val session: SessionHooks = SessionHooks.None,
) : ViewModel() {
	private val _ui = MutableStateFlow<AppUiState>(AppUiState.Loading)
	val ui: StateFlow<AppUiState> = _ui

	private val _snack = MutableStateFlow<UiSnack?>(null)
	val snack: StateFlow<UiSnack?> = _snack

	/** The caller's category names (#280) for the add-task picker; best effort, empty until loaded. */
	private val categoryNames = TaskCategoryNames(repository)
	val categories: StateFlow<List<String>> = categoryNames.names

	private val creator = TaskCreator(repository, _ui)

	init {
		viewModelScope.launch {
			if (tokenStore.token() == null) {
				_ui.value = AppUiState.NeedToken()
			} else {
				refresh()
			}
		}
	}

	fun consumeSnack() {
		_snack.value = null
	}

	fun saveToken(value: String) {
		viewModelScope.launch {
			tokenStore.save(value.trim())
			refresh()
			session.signedIn()
		}
	}

	/** Mint a new token in the web app (Settings > API tokens). */
	fun clearToken() {
		viewModelScope.launch {
			val previous = tokenStore.token()
			tokenStore.clear()
			_ui.value = AppUiState.NeedToken()
			// #273: unregister + cancel reminders even if the screen goes away mid-call.
			withContext(NonCancellable) { session.signedOut(previous) }
		}
	}

	fun refresh() {
		viewModelScope.launch { categoryNames.load() }
		viewModelScope.launch {
			_ui.value = AppUiState.Loading
			val meId = when (val me = repository.me()) {
				is ApiResult.Ok -> me.value.id
				is ApiResult.Err -> null
			}
			// #281: the push worker reads it to keep the user's own edits silent (off the list's path).
			meId?.let { id -> viewModelScope.launch { tokenStore.saveUserId(id) } }
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
					_ui.value = _ui.value.withTask(result.value)
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

	/** Optimistic add: pending row now, server row on success, inline error on failure. */
	fun createTask(input: NewTaskInput) {
		viewModelScope.launch {
			when (val outcome = creator.create(input)) {
				is CreateOutcome.Created -> {
					input.category?.let(categoryNames::remember)
					_snack.value = UiSnack("Added \"${outcome.title}\" to your tasks")
				}
				CreateOutcome.Unauthorized -> invalidateSession()
				is CreateOutcome.Rejected, CreateOutcome.Invalid -> Unit
			}
		}
	}

	fun toggleComplete(task: Task) {
		viewModelScope.launch {
			when (val result = repository.toggleComplete(task.id)) {
				is ApiResult.Ok -> _ui.value = _ui.value.withTask(result.value)
				is ApiResult.Err -> presentError(result)
			}
		}
	}

	/** Enqueue a desktop focus command: start on [task], or stop when null. */
	fun queueFocus(task: Task?) {
		viewModelScope.launch {
			val result = if (task == null) repository.requestFocusStop() else repository.requestFocusStart(task.id)
			when (result) {
				is ApiResult.Ok -> _snack.value = UiSnack(
					if (task == null) "Focus stop queued" else "Focus start queued for \"${task.title}\"",
				)
				is ApiResult.Err -> presentError(result)
			}
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

/** Swap one task in a Ready list by id; other states pass through. */
internal fun AppUiState.withTask(updatedDto: TaskDto): AppUiState {
	if (this !is AppUiState.Ready) return this
	val updated = TaskMapper.fromDto(updatedDto)
	return copy(tasks = tasks.map { if (it.id == updated.id) updated else it })
}
