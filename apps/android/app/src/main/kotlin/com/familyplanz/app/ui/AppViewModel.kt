package com.familyplanz.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.AuthSource
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
	private val auth: AuthSource? = null,
	private val focusRefreshDelayMs: Long = FOCUS_REFRESH_DELAY_MS,
) : ViewModel() {
	private val _ui = MutableStateFlow<AppUiState>(AppUiState.Loading)
	val ui: StateFlow<AppUiState> = _ui

	private val _snack = MutableStateFlow<UiSnack?>(null)
	val snack: StateFlow<UiSnack?> = _snack

	private val focus = FocusCommands(repository, viewModelScope, _ui, focusRefreshDelayMs)

	/** The focus command in flight (#290); null = none, focus controls enabled. */
	val focusPending: StateFlow<FocusPending?> = focus.pending

	/** The caller's category names (#280) for the add-task picker; best effort, empty until loaded. */
	private val categoryNames = TaskCategoryNames(repository)
	val categories: StateFlow<List<String>> = categoryNames.names

	private val creator = TaskCreator(repository, _ui)

	/** #288 guest-account note on the Tasks tab. */
	val guestNote = GuestNote(tokenStore, viewModelScope)

	init {
		guestNote.load()
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

	/**
	 * Open a session from native sign-in (#288) or a pasted token: store the
	 * bearer (+ me-id when the sign-in response named it), load, then the #273
	 * signed-in hook - the same path whichever way the token arrived.
	 */
	fun signIn(credentials: SessionCredentials) {
		viewModelScope.launch {
			tokenStore.save(credentials.token.trim())
			credentials.userId?.let { tokenStore.saveUserId(it) }
			guestNote.signedIn(credentials.guest)
			refresh()
			session.signedIn()
		}
	}

	/** Sign out: drop the token, then the #273 hooks and a best-effort server revoke (#288). */
	fun clearToken() {
		viewModelScope.launch {
			val previous = tokenStore.token()
			tokenStore.clear()
			_ui.value = AppUiState.NeedToken()
			// #273: unregister + cancel reminders even if the screen goes away mid-call.
			// The device DELETE needs the bearer alive, so the revoke goes last.
			withContext(NonCancellable) {
				session.signedOut(previous)
				previous?.let { auth?.logout(it) }
			}
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

	/** Hand-hosted hook: any other screen's 401 swaps the host to the sign-in screen. */
	fun invalidateSession(note: String = "Sign in again - your session ended.") {
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
