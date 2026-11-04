package com.familyplanz.app.ui.tasks

import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskMapper
import com.familyplanz.app.domain.tasks.TaskClock
import com.familyplanz.app.domain.tasks.TaskMatch
import com.familyplanz.app.domain.tasks.TaskQuery
import com.familyplanz.app.domain.tasks.applyTaskQuery

/** The Tasks tab's render state; the toolbar lives in [TasksUiState.Ready.query]. */
sealed interface TasksUiState {
	data object Loading : TasksUiState

	data class Ready(
		/** `myTasks` (G9): my personal tasks + the family tasks I accepted (AC-TK-2). */
		val tasks: List<Task>,
		val meId: String?,
		val query: TaskQuery = TaskQuery(),
		/** G9 `pendingAssignments` (AC-TK-22). */
		val pendingAssignments: List<Task> = emptyList(),
		/** G9 `requestedByMe` (AC-TK-22). */
		val requestedByMe: List<Task> = emptyList(),
		/** Last add-task failure, shown inline under the field (not a toast). */
		val createError: String? = null,
		/** Server warnings for the sections read (amber strip above the list). */
		val warnings: List<String> = emptyList(),
		/** The task being edited in the dialog (AC-TK-20); null = dialog closed. */
		val editing: Task? = null,
		/** Rows with a write in flight (the row disables its controls). */
		val busy: Set<String> = emptySet(),
	) : TasksUiState

	data class Failed(val reason: String) : TasksUiState
}

/** The rows the toolbar's query leaves, for the screen's clock. */
internal fun TasksUiState.Ready.match(clock: TaskClock): TaskMatch = applyTaskQuery(tasks, query, meId, clock)

/** Replace one task in place (server reply after a write); other states pass through. */
internal fun TasksUiState.withTask(updatedDto: TaskDto): TasksUiState {
	if (this !is TasksUiState.Ready) return this
	val updated = TaskMapper.fromDto(updatedDto)
	return copy(tasks = tasks.map { if (it.id == updated.id) updated else it })
}

internal fun TasksUiState.withTask(updated: Task): TasksUiState {
	if (this !is TasksUiState.Ready) return this
	return copy(tasks = tasks.map { if (it.id == updated.id) updated else it })
}

internal fun TasksUiState.withoutTask(id: String): TasksUiState {
	if (this !is TasksUiState.Ready) return this
	return copy(tasks = tasks.filterNot { it.id == id }, busy = busy - id)
}

internal fun TasksUiState.withQuery(change: (TaskQuery) -> TaskQuery): TasksUiState =
	if (this is TasksUiState.Ready) copy(query = change(query)) else this

internal fun TasksUiState.withBusy(id: String, busy: Boolean): TasksUiState {
	if (this !is TasksUiState.Ready) return this
	return copy(busy = if (busy) this.busy + id else this.busy - id)
}

internal fun TasksUiState.withCreateError(message: String?): TasksUiState =
	if (this is TasksUiState.Ready) copy(createError = message) else this

internal fun TasksUiState.withEditing(task: Task?): TasksUiState =
	if (this is TasksUiState.Ready) copy(editing = task) else this
