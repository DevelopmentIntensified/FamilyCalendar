package com.familyplanz.app.ui.tasks

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
import com.familyplanz.app.ui.shell.SESSION_ENDED_NOTE
import com.familyplanz.app.ui.shell.UiSnack
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed interface TasksUiState {
	data object Loading : TasksUiState

	/** `createError` = last add-task failure, shown inline under the add field. */
	data class Ready(
		val tasks: List<Task>,
		val meId: String?,
		val createError: String? = null,
	) : TasksUiState

	data class Failed(val reason: String) : TasksUiState
}

/**
 * Task list + focus command enqueue for the phone, for one signed-in session
 * (the shell scopes it there; a 401 surfaces through [sessionEnded]).
 * The desktop stays the only focus-time clock: the phone only enqueues
 * start/stop and never writes focusMinutes (spec rule; enforced by
 * TaskUpdatePatch + FocusCommandRequest shapes).
 */
class TasksViewModel(
	private val repository: TaskRepository,
	private val tokenStore: DataStoreTokenStore,
	focusRefreshDelayMs: Long = FOCUS_REFRESH_DELAY_MS,
) : ViewModel() {
	private val _ui = MutableStateFlow<TasksUiState>(TasksUiState.Loading)
	val ui: StateFlow<TasksUiState> = _ui

	private val _snack = MutableStateFlow<UiSnack?>(null)
	val snack: StateFlow<UiSnack?> = _snack

	private val _sessionEnded = MutableStateFlow<String?>(null)

	/** Non-null once the server rejected the bearer: the note the sign-in screen shows. */
	val sessionEnded: StateFlow<String?> = _sessionEnded

	private val focus = FocusCommands(repository, viewModelScope, _ui, focusRefreshDelayMs)

	/** The focus command in flight (#290); null = none, focus controls enabled. */
	val focusPending: StateFlow<FocusPending?> = focus.pending

	/** The caller's category names (#280) for the add-task picker; best effort, empty until loaded. */
	private val categoryNames = TaskCategoryNames(repository)
	val categories: StateFlow<List<String>> = categoryNames.names

	private val creator = TaskCreator(repository, _ui)

	init {
		refresh()
	}

	fun consumeSnack() {
		_snack.value = null
	}

	fun refresh() {
		viewModelScope.launch { categoryNames.load() }
		viewModelScope.launch {
			_ui.value = TasksUiState.Loading
			val meId = when (val me = repository.me()) {
				is ApiResult.Ok -> me.value.id
				is ApiResult.Err -> null
			}
			// #281: the push worker reads it to keep the user's own edits silent (off the list's path).
			meId?.let { id -> viewModelScope.launch { tokenStore.saveUserId(id) } }
			when (val result = repository.allTasks()) {
				is ApiResult.Ok -> _ui.value = TasksUiState.Ready(result.value.map(TaskMapper::fromDto), meId)
				is ApiResult.Err -> {
					if (result.error is ApiError.Unauthorized) {
						presentError(result)
					} else {
						val cached = repository.cachedTasks()
						if (cached != null) {
							_ui.value = TasksUiState.Ready(cached.map(TaskMapper::fromDto), null)
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

	/** Optimistic add: pending row now, server row on success, inline error on failure. */
	fun createTask(input: NewTaskInput) {
		viewModelScope.launch {
			when (val outcome = creator.create(input)) {
				is CreateOutcome.Created -> {
					input.category?.let(categoryNames::remember)
					_snack.value = UiSnack("Added \"${outcome.title}\" to your tasks")
				}
				CreateOutcome.Unauthorized -> _sessionEnded.value = SESSION_ENDED_NOTE
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

	/** Ask the desktop to start focus on [task], or to stop when null (#290); see [FocusCommands]. */
	fun queueFocus(task: Task?) {
		viewModelScope.launch {
			when (val result = focus.send(task) ?: return@launch) {
				is ApiResult.Ok -> _snack.value = UiSnack(if (task == null) FOCUS_STOP_ASKED else FOCUS_START_ASKED)
				// Unsupported server, network or server error: say so, keep the list (only 401 leaves it).
				is ApiResult.Err -> if (result.error is ApiError.Unauthorized) {
					presentError(result)
				} else {
					_snack.value = UiSnack(result.error.message)
				}
			}
		}
	}

	private fun presentError(result: ApiResult.Err) {
		when (val error = result.error) {
			ApiError.Unauthorized -> _sessionEnded.value = error.message
			else -> {
				_ui.value = TasksUiState.Failed(error.message)
				_snack.value = UiSnack(error.message)
			}
		}
	}
}

/** Swap one task in a Ready list by id; other states pass through. */
internal fun TasksUiState.withTask(updatedDto: TaskDto): TasksUiState {
	if (this !is TasksUiState.Ready) return this
	val updated = TaskMapper.fromDto(updatedDto)
	return copy(tasks = tasks.map { if (it.id == updated.id) updated else it })
}
