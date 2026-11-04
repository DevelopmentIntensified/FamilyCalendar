package com.familyplanz.app.ui.family

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.FamilySource
import com.familyplanz.app.data.FamilyTasksDto
import com.familyplanz.app.data.RosterRowDto
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.data.TaskSource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** The board's filter bar. */
enum class TaskFilter(val label: String) {
	ALL("All"),
	OPEN("Open"),
	COMPLETED("Completed"),
}

/** One member's group on the board; a member with no tasks still gets one (AC-FT-1). */
data class MemberGroup(val member: RosterRowDto, val tasks: List<TaskDto>)

sealed interface FamilyTasksState {
	data object Loading : FamilyTasksState

	data class Ready(
		val board: FamilyTasksDto,
		val open: List<TaskDto>,
		val done: List<TaskDto>,
		val filter: TaskFilter = TaskFilter.ALL,
		/** "Public tasks" tab: other members' public personal tasks only (AC-FT-3). */
		val publicTab: Boolean = false,
		val addTitle: String = "",
		val submitting: Boolean = false,
		val error: String? = null,
		val note: String? = null,
	) : FamilyTasksState

	data class Failed(val reason: String) : FamilyTasksState
}

/**
 * The Family Task Board (2.11): grouped by assignee from G11's roster, the
 * filter bar, the add form that understands "@Dad", and completion through
 * `/api/tasks` (optimistic, rolled back on error — AC-FT-4).
 */
class FamilyTasksViewModel(
	private val source: FamilySource,
	private val tasks: TaskSource,
	private val familyId: String,
) : ViewModel() {
	private val _state = MutableStateFlow<FamilyTasksState>(FamilyTasksState.Loading)
	val state: StateFlow<FamilyTasksState> = _state

	init {
		refresh()
	}

	fun refresh() {
		viewModelScope.launch {
			_state.value = FamilyTasksState.Loading
			when (val result = source.tasks(familyId)) {
				is ApiResult.Ok -> _state.value = FamilyTasksState.Ready(
					board = result.value,
					open = result.value.tasks,
					done = emptyList(),
				)

				is ApiResult.Err -> _state.value = FamilyTasksState.Failed(result.error.message)
			}
		}
	}

	fun setFilter(filter: TaskFilter) {
		val ready = ready() ?: return
		_state.value = ready.copy(filter = filter)
	}

	fun showPublic(on: Boolean) {
		val ready = ready() ?: return
		_state.value = ready.copy(publicTab = on)
	}

	fun editTitle(value: String) {
		val ready = ready() ?: return
		_state.value = ready.copy(addTitle = value)
	}

	/** AC-FT-2: "mow lawn @Dad" becomes the title "mow lawn" assigned to Dad. */
	fun addTask() {
		val ready = ready() ?: return
		val parsed = parseFamilyTaskInput(ready.addTitle, ready.board.familyRoster) ?: return
		viewModelScope.launch {
			_state.value = ready.copy(submitting = true, error = null)
			when (val result = source.createFamilyTask(familyId, parsed.title, parsed.assignee?.userId, null)) {
				is ApiResult.Ok -> _state.value = ready.copy(
					open = ready.open + result.value,
					addTitle = "",
					submitting = false,
					note = parsed.assignee?.let { "Sent to ${it.firstName ?: "a member"} - pending acceptance" }
						?: "Added to the family board",
				)

				is ApiResult.Err -> _state.value = ready.copy(submitting = false, error = result.error.message)
			}
		}
	}

	/** AC-FT-4: the row moves to the completed list at once, and back if the server says no. */
	fun toggle(task: TaskDto) {
		val ready = ready() ?: return
		val wasOpen = ready.open.any { it.id == task.id }
		_state.value = if (wasOpen) {
			ready.copy(open = ready.open - task, done = listOf(task) + ready.done, error = null)
		} else {
			ready.copy(open = ready.open + task, done = ready.done - task, error = null)
		}
		viewModelScope.launch {
			when (val result = tasks.toggleComplete(task.id)) {
				is ApiResult.Ok -> {
					val current = ready() ?: return@launch
					val saved = result.value
					val completed = !saved.completedAt.isNullOrBlank()
					_state.value = current.copy(
						open = (current.open.filterNot { it.id == saved.id } + if (completed) emptyList() else listOf(saved)),
						done = (current.done.filterNot { it.id == saved.id } + if (completed) listOf(saved) else emptyList()),
					)
				}

				is ApiResult.Err -> {
					val current = ready() ?: return@launch
					val rolledBack = if (wasOpen) {
						current.copy(open = current.open + task, done = current.done - task)
					} else {
						current.copy(open = current.open - task, done = current.done + task)
					}
					_state.value = rolledBack.copy(error = result.error.message)
				}
			}
		}
	}

	private fun ready(): FamilyTasksState.Ready? = _state.value as? FamilyTasksState.Ready
}

/** What the add form understood: a title and (optionally) the member the "@name" named. */
data class ParsedFamilyTask(val title: String, val assignee: RosterRowDto?)

/**
 * AC-FT-2: splits "mow lawn @Dad" into its title and the roster row for
 * "Dad"; an "@name" that matches nobody stays part of the title.
 */
fun parseFamilyTaskInput(text: String, roster: List<RosterRowDto>): ParsedFamilyTask? {
	val trimmed = text.trim()
	if (trimmed.isEmpty()) return null
	val mention = Regex("""@([\p{L}][\p{L}\-']*)""").findAll(trimmed).lastOrNull() ?: return ParsedFamilyTask(trimmed, null)
	val named = mention.groupValues[1]
	val match = roster.firstOrNull { it.firstName?.equals(named, ignoreCase = true) == true }
		?: return ParsedFamilyTask(trimmed, null)
	val title = trimmed.replaceRange(mention.range, "").trim().ifEmpty { named }
	return ParsedFamilyTask(title, match)
}

/** AC-FT-1: one group per member, in roster order, empty groups included. */
fun memberGroups(roster: List<RosterRowDto>, open: List<TaskDto>): List<MemberGroup> {
	val known = roster.map { it.userId }.toSet()
	val groups = roster.map { member -> MemberGroup(member, open.filter { it.assignedTo == member.userId }) }
	val strays = open.filter { it.assignedTo == null || it.assignedTo !in known }
	return if (strays.isEmpty()) {
		groups
	} else {
		groups + MemberGroup(RosterRowDto(userId = "", firstName = "Unassigned"), strays)
	}
}

/** AC-FT-3: only other members' public personal tasks, never private ones. */
fun publicFamilyTasks(publicTasks: List<TaskDto>, meId: String?): List<TaskDto> =
	publicTasks.filter { it.visibility == "public" && (meId == null || it.userId != meId) }

/** The board's heading for a group: "Bo" or the web's "Bo's tasks". */
fun groupTitle(group: MemberGroup): String = group.member.firstName ?: "Member"
