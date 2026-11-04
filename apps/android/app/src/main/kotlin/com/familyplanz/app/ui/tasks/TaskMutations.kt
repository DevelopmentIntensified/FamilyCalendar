package com.familyplanz.app.ui.tasks

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.TaskCategoryDto
import com.familyplanz.app.data.TaskCategorySource
import com.familyplanz.app.data.TaskSource
import com.familyplanz.app.data.TaskUpdatePatch
import com.familyplanz.app.domain.Task
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update

/** What a write did: [message] to toast, [unauthorized] ends the session. */
data class MutationOutcome(val message: String? = null, val unauthorized: Boolean = false)

/**
 * Every row/list write behind the Tasks tab (AC-TK-16/17/18/19/20/23), plus
 * the category manager (AC-TK-24). Completion is optimistic with rollback -
 * the row flips before the network call and the snack names the outcome.
 */
class TaskMutations(
	private val source: TaskSource,
	private val categories: TaskCategorySource,
	private val ui: MutableStateFlow<TasksUiState>,
) {
	/** AC-TK-16/17: the check flips the row first; a failure puts it back. */
	suspend fun toggle(task: Task): MutationOutcome {
		val flipping = task.copy(completed = !task.completed)
		ui.update { it.withTask(flipping).withBusy(task.id, true) }
		val result = source.toggleComplete(task.id)
		ui.update { it.withBusy(task.id, false) }
		val outcome = when (result) {
			is ApiResult.Ok -> MutationOutcome(
				if (task.completed) {
					"\"${task.title}\" reopened."
				} else {
					"\"${task.title}\" marked done."
				},
			)

			is ApiResult.Err -> {
				ui.update { it.withTask(task) }
				result.toOutcome()
			}
		}
		if (result is ApiResult.Ok) ui.update { it.withTask(result.value) }
		return outcome
	}

	/** AC-TK-18: the trash's Yes. */
	suspend fun delete(task: Task): MutationOutcome {
		ui.update { it.withBusy(task.id, true) }
		val result = source.deleteTask(task.id)
		ui.update { it.withBusy(task.id, false) }
		return when (result) {
			is ApiResult.Ok -> {
				ui.update { it.withoutTask(task.id) }
				MutationOutcome("Deleted \"${task.title}\".")
			}

			is ApiResult.Err -> result.toOutcome()
		}
	}

	/** AC-TK-19: skip rolls the recurring cursor forward on the server. */
	suspend fun skip(task: Task): MutationOutcome = save(task.id, TaskUpdatePatch.advanceToNext()) {
		"\"${task.title}\" moved to its next occurrence."
	}

	/** AC-TK-20: the edit dialog's Save. */
	suspend fun edit(task: Task, patch: TaskUpdatePatch, title: String): MutationOutcome =
		save(task.id, patch) { "Saved \"$title\"." }

	/** AC-TK-23: every completed row goes, in one call. */
	suspend fun clearCompleted(): MutationOutcome {
		val result = source.clearCompleted()
		return when (result) {
			is ApiResult.Ok -> {
				ui.update { state ->
					if (state is TasksUiState.Ready) {
						state.copy(tasks = state.tasks.filterNot { it.completed })
					} else {
						state
					}
				}
				MutationOutcome("Completed tasks cleared \u2014 fresh start.")
			}

			is ApiResult.Err -> result.toOutcome()
		}
	}

	/** AC-TK-24 rename: the chips read the new name at once once the server agrees. */
	suspend fun renameCategory(row: TaskCategoryDto, name: String): MutationOutcome {
		val result = categories.renameTaskCategory(row.id, name)
		return when (result) {
			is ApiResult.Ok -> {
				val renamed = result.value.name
				ui.update { state -> state.renameCategoryEverywhere(row.name, renamed) }
				MutationOutcome("Renamed \"${row.name}\" to \"$renamed\".")
			}

			is ApiResult.Err -> result.toOutcome()
		}
	}

	/** AC-TK-24 delete: its tasks become uncategorized. */
	suspend fun deleteCategory(row: TaskCategoryDto): MutationOutcome {
		val result = categories.deleteTaskCategory(row.id)
		return when (result) {
			is ApiResult.Ok -> {
				ui.update { state -> state.renameCategoryEverywhere(row.name, null) }
				MutationOutcome("Deleted \"${row.name}\" \u2014 its tasks are now uncategorized.")
			}

			is ApiResult.Err -> result.toOutcome()
		}
	}

	private suspend fun save(
		id: String,
		patch: TaskUpdatePatch,
		message: (String) -> String,
	): MutationOutcome {
		ui.update { it.withBusy(id, true) }
		val result = source.updateTask(id, patch)
		ui.update { it.withBusy(id, false) }
		return when (result) {
			is ApiResult.Ok -> {
				ui.update { it.withTask(result.value) }
				MutationOutcome(message(result.value.title))
			}

			is ApiResult.Err -> result.toOutcome()
		}
	}
}

private fun ApiResult.Err.toOutcome(): MutationOutcome =
	if (error is ApiError.Unauthorized) {
		MutationOutcome(unauthorized = true)
	} else {
		MutationOutcome(error.message)
	}

/** Swap a category name on every row that wears it (`null` = uncategorize). */
internal fun TasksUiState.renameCategoryEverywhere(from: String, to: String?): TasksUiState {
	if (this !is TasksUiState.Ready) return this
	fun Task.fixed() = if (category.equals(from, ignoreCase = true)) copy(category = to) else this
	return copy(
		tasks = tasks.map { it.fixed() },
		editing = editing?.fixed(),
		pendingAssignments = pendingAssignments.map { it.fixed() },
		requestedByMe = requestedByMe.map { it.fixed() },
	)
}
