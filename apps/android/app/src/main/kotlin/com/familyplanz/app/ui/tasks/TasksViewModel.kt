package com.familyplanz.app.ui.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.data.MemoryPhoneFocusStore
import com.familyplanz.app.data.PhoneFocusStore
import com.familyplanz.app.data.TaskCategoryDto
import com.familyplanz.app.data.TaskCategoryNames
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.data.TaskRepository
import com.familyplanz.app.data.TaskUpdatePatch
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskMapper
import com.familyplanz.app.domain.tasks.OwnerView
import com.familyplanz.app.domain.tasks.QuickAddMember
import com.familyplanz.app.domain.tasks.ScopeChip
import com.familyplanz.app.domain.tasks.TaskQuery
import com.familyplanz.app.domain.tasks.TaskSortKey
import com.familyplanz.app.domain.tasks.TimeFilter
import com.familyplanz.app.ui.shell.SESSION_ENDED_NOTE
import com.familyplanz.app.ui.shell.UiSnack
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The Tasks tab's state owner: the G9 sections read (`myTasks` +
 * assignments, AC-TK-2/22), the toolbar query, every row write, the desktop
 * focus command (#290) and the phone's own focus sessions (#293).
 *
 * The desktop stays the only writer of `focusMinutes`; the phone times its
 * own sessions and flushes them from an offline queue (spec rule).
 */
@Suppress("TooManyFunctions")
class TasksViewModel(
	private val repository: TaskRepository,
	private val tokenStore: DataStoreTokenStore,
	private val prefs: TasksPrefs = MemoryTasksPrefs(),
	focusRefreshDelayMs: Long = FOCUS_REFRESH_DELAY_MS,
	private val phoneFocusStore: PhoneFocusStore = MemoryPhoneFocusStore(),
) : ViewModel() {
	private val _ui = MutableStateFlow<TasksUiState>(TasksUiState.Loading)
	val ui: StateFlow<TasksUiState> = _ui

	private val _snack = MutableStateFlow<UiSnack?>(null)
	val snack: StateFlow<UiSnack?> = _snack

	private val _sessionEnded = MutableStateFlow<String?>(null)

	/** Non-null once the server rejected the bearer: the note the sign-in screen shows. */
	val sessionEnded: StateFlow<String?> = _sessionEnded

	private val focus = FocusCommands(repository, viewModelScope, _ui, focusRefreshDelayMs)

	/** The desktop focus command in flight (#290); null = none, controls enabled. */
	val focusPending: StateFlow<FocusPending?> = focus.pending

	/** The phone's timed sessions (#293), restored per signed-in user. */
	private val phone = PhoneFocusSessions(repository, phoneFocusStore)

	/** The phone's local record, for the "Focusing (phone)" chip and live minutes. */
	val phoneFocus = phone.state

	private val mutations = TaskMutations(repository, repository, _ui)

	/** The caller's category names (#280) for the pickers; best effort, empty until loaded. */
	private val categoryNames = TaskCategoryNames(repository)
	val categories: StateFlow<List<String>> = categoryNames.names

	/** The manager's rows (AC-TK-24). */
	val categoryRows: StateFlow<List<TaskCategoryDto>> = categoryNames.items

	/** The roster for `@name` quick-add and the assignee control (best effort). */
	private val _members = MutableStateFlow<List<QuickAddMember>>(emptyList())
	val members: StateFlow<List<QuickAddMember>> = _members

	private val _memberNames = MutableStateFlow<Map<String, String>>(emptyMap())

	/** Roster id to display name, for the preview chips ("for Maya Rivera"). */
	val memberNames: StateFlow<Map<String, String>> = _memberNames

	private val creator = TaskCreator(repository, _ui)

	init {
		refresh()
	}

	fun consumeSnack() {
		_snack.value = null
	}

	fun refresh() {
		viewModelScope.launch { categoryNames.load() }
		viewModelScope.launch { loadRoster() }
		viewModelScope.launch { load() }
	}

	private suspend fun loadRoster() {
		val roster = (repository.familyRoster() as? ApiResult.Ok)?.value ?: return
		_members.value = roster.members.map { QuickAddMember(it.userId, it.firstName ?: "", it.lastName ?: "") }
		_memberNames.value = roster.members.associate { member ->
			member.userId to listOfNotNull(member.firstName, member.lastName).filter { it.isNotBlank() }.joinToString(" ")
		}
	}

	// ---- toolbar -------------------------------------------------------------------------

	fun setView(view: OwnerView) = editQuery { it.copy(view = view) }

	fun setScope(scope: ScopeChip) = editQuery { it.copy(scope = scope) }

	fun setTime(time: TimeFilter) = editQuery { it.copy(time = time) }

	fun setSearch(text: String) = editQuery { it.copy(search = text) }

	fun setTag(text: String) = editQuery { it.copy(tag = text) }.also { persistPrefs() }

	fun setSort(key: TaskSortKey) = editQuery { it.copy(sort = key) }.also { persistPrefs() }

	// ---- rows ----------------------------------------------------------------------------

	fun createTask(input: NewTaskInput) {
		viewModelScope.launch {
			when (val outcome = creator.create(input)) {
				is CreateOutcome.Created -> {
					input.category?.let(categoryNames::remember)
					_snack.value = UiSnack(addedNote(outcome.title))
				}

				CreateOutcome.Unauthorized -> _sessionEnded.value = SESSION_ENDED_NOTE
				is CreateOutcome.Rejected, CreateOutcome.Invalid -> Unit
			}
		}
	}

	fun dismissCreateError() = _ui.update { it.withCreateError(null) }

	fun toggleComplete(task: Task) = launchWrite { mutations.toggle(task) }

	fun deleteTask(task: Task) = launchWrite { mutations.delete(task) }

	fun skipTask(task: Task) = launchWrite { mutations.skip(task) }

	fun clearCompleted() = launchWrite { mutations.clearCompleted() }

	fun openEdit(task: Task) = _ui.update { it.withEditing(task) }

	fun closeEdit() = _ui.update { it.withEditing(null) }

	/** AC-TK-20: only the changed fields ride (the caller builds the patch). */
	fun saveEdit(task: Task, patch: TaskUpdatePatch, title: String) = launchWrite {
		mutations.edit(task, patch, title).also { _ui.update { state -> state.withEditing(null) } }
	}

	fun respondAssignment(task: Task, status: String) = launchWrite {
		when (val result = repository.respondToAssignment(task.id, status)) {
			is ApiResult.Ok -> {
				_ui.update { it.withTask(result.value) }
				MutationOutcome(assignmentNote(task.title, status == "accepted"))
			}

			is ApiResult.Err -> if (result.error is ApiError.Unauthorized) {
				MutationOutcome(unauthorized = true)
			} else {
				MutationOutcome(result.error.message)
			}
		}
	}

	// ---- categories ----------------------------------------------------------------------

	fun renameCategory(row: TaskCategoryDto, name: String) = launchWrite {
		mutations.renameCategory(row, name).also { viewModelScope.launch { categoryNames.load() } }
	}

	fun deleteCategory(row: TaskCategoryDto) = launchWrite {
		mutations.deleteCategory(row).also { viewModelScope.launch { categoryNames.load() } }
	}

	// ---- focus ---------------------------------------------------------------------------

	/**
	 * "Focus here" (#293): the phone times this task itself and shows
	 * "Focusing (phone)" at once; the server learns of it now or later.
	 */
	fun focusHere(task: Task) {
		viewModelScope.launch {
			val outcome = phone.start(task)
			applyPhoneFocus(task, outcome)
		}
	}

	/** "Stop": closes the phone session when it is ours, else asks the desktop to stop. */
	fun stopFocus(task: Task?) {
		viewModelScope.launch {
			if (phone.open != null) {
				applyPhoneFocus(task, phone.stop(task))
			} else {
				queueFocus(null)
			}
		}
	}

	/** Ask the desktop to start focus on [task], or to stop when null (#290). */
	fun queueFocus(task: Task?) {
		viewModelScope.launch {
			when (val result = focus.send(task) ?: return@launch) {
				is ApiResult.Ok -> _snack.value = UiSnack(if (task == null) FOCUS_STOP_ASKED else FOCUS_START_ASKED)
				is ApiResult.Err -> if (result.error is ApiError.Unauthorized) {
					presentError(result.error.message)
				} else {
					_snack.value = UiSnack(result.error.message)
				}
			}
		}
	}

	private suspend fun applyPhoneFocus(task: Task?, outcome: PhoneFocusOutcome) {
		_snack.value = UiSnack(phoneFocusNote(task?.title, outcome))
		if (outcome is PhoneFocusOutcome.Unauthorized) _sessionEnded.value = SESSION_ENDED_NOTE
		_ui.update { state -> if (state is TasksUiState.Ready) state.copy(tasks = phone.overlay(state.tasks)) else state }
	}

	// ---- internals -----------------------------------------------------------------------

	private fun editQuery(change: (TaskQuery) -> TaskQuery) = _ui.update { it.withQuery(change) }

	private fun persistPrefs() {
		val query = (_ui.value as? TasksUiState.Ready)?.query ?: return
		prefs.save(TasksViewPrefs(sort = query.sort, tagFilter = query.tag))
	}

	/** Fire-and-forget row write on the view-model scope (callers never await). */
	private fun launchWrite(block: suspend () -> MutationOutcome) {
		viewModelScope.launch { write(block) }
	}

	private suspend fun write(block: suspend () -> MutationOutcome) {
		val outcome = block()
		if (outcome.unauthorized) {
			_sessionEnded.value = SESSION_ENDED_NOTE
			return
		}
		outcome.message?.let { _snack.value = UiSnack(it) }
	}

	private suspend fun load() {
		_ui.value = TasksUiState.Loading
		val meId = when (val me = repository.me()) {
			is ApiResult.Ok -> me.value.id
			is ApiResult.Err -> null
		}
		meId?.let { id -> viewModelScope.launch { tokenStore.saveUserId(id) } }
		val signedInId = meId ?: tokenStore.userId()
		if (signedInId != null) restorePhone(signedInId)
		val mark = phone.refreshMark()
		when (val sections = repository.taskSections()) {
			is ApiResult.Ok -> {
				phone.refreshed(mark)
				publish(
					TasksUiState.Ready(
						tasks = phone.overlay(sections.value.myTasks.map(TaskMapper::fromDto)),
						meId = meId,
						query = savedQuery(),
						pendingAssignments = sections.value.pendingAssignments.map(TaskMapper::fromDto),
						requestedByMe = sections.value.requestedByMe.map(TaskMapper::fromDto),
						warnings = sections.value.warnings,
					),
				)
			}

			is ApiResult.Err -> if (sections.error is ApiError.Unauthorized) {
				presentError(sections.error.message)
			} else {
				loadLegacy(mark, meId)
			}
		}
	}

	/** A server that predates G9: the flat list is all we can show (no assignment sections). */
	private suspend fun loadLegacy(mark: Long, meId: String?) {
		when (val result = repository.allTasks()) {
			is ApiResult.Ok -> {
				phone.refreshed(mark)
				publish(TasksUiState.Ready(phone.overlay(result.value.map(TaskMapper::fromDto)), meId, savedQuery()))
			}

			is ApiResult.Err -> if (result.error is ApiError.Unauthorized) {
				presentError(result.error.message)
			} else {
				val cached = repository.cachedTasks()
				if (cached != null) {
					publish(TasksUiState.Ready(phone.overlay(cached.map(TaskMapper::fromDto)), meId, savedQuery()))
					_snack.value = UiSnack("Offline - showing the last synced tasks")
				} else {
					presentError(result.error.message)
				}
			}
		}
	}

	private fun publish(ready: TasksUiState.Ready) {
		// A refresh during an edit keeps the dialog open on the fresh row.
		val editing = ready.editing
		_ui.value = ready
		editing?.let { open ->
			_ui.update { state ->
				val fresh = (state as? TasksUiState.Ready)?.tasks?.firstOrNull { it.id == open.id }
				state.withEditing(fresh)
			}
		}
	}

	/** The saved sort/tag plus whatever the toolbar already holds this session. */
	private fun savedQuery(): TaskQuery {
		val saved = prefs.load()
		val current = (_ui.value as? TasksUiState.Ready)?.query ?: TaskQuery()
		return current.copy(sort = saved.sort, tag = saved.tagFilter)
	}

	private suspend fun restorePhone(userId: String) {
		phone.restore(userId)
		val flushed = phone.flush()
		if (flushed.unauthorized) {
			_sessionEnded.value = SESSION_ENDED_NOTE
		} else if (flushed.uploaded > 0) {
			_snack.value = UiSnack("Synced ${flushed.uploaded} phone focus session${if (flushed.uploaded == 1) "" else "s"}")
		}
	}

	private fun presentError(reason: String) {
		_ui.value = TasksUiState.Failed(reason)
		_snack.value = UiSnack(reason)
	}
}

private fun addedNote(title: String): String = "Added \"$title\"."

private fun assignmentNote(title: String, accepted: Boolean): String = if (accepted) {
	"Accepted \"$title\" \u2014 it's on your list."
} else {
	"Declined \"$title\" \u2014 sent back to the requester."
}

private fun phoneFocusNote(title: String?, outcome: PhoneFocusOutcome): String = when (outcome) {
	is PhoneFocusOutcome.Synced -> if (title == null) "Phone focus stopped." else "Focusing on \"$title\" on this phone."
	is PhoneFocusOutcome.Queued -> "Saved offline \u2014 it syncs when you reconnect."
	is PhoneFocusOutcome.Rejected -> outcome.message
	is PhoneFocusOutcome.Unauthorized -> SESSION_ENDED_NOTE
	PhoneFocusOutcome.Nothing -> "Nothing to stop."
}

