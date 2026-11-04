package com.familyplanz.app.ui.tasks

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.CreateTaskRequest
import com.familyplanz.app.data.TaskSource
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskMapper
import com.familyplanz.app.domain.TaskPriority
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import java.time.LocalDate
import java.util.UUID

/** What the add-task field submits; the title is raw (trimmed on send). */
data class NewTaskInput(
	val title: String,
	val dueDate: LocalDate? = null,
	val priority: TaskPriority = TaskPriority.NORMAL,
	/** Category name (#280); blank = none. */
	val category: String? = null,
	/** Roster id from a quick-add `@name`; null = the server's default (me). */
	val assignedTo: String? = null,
	val tags: List<String> = emptyList(),
	val recurrenceFrequency: String? = null,
	val recurrenceInterval: Int? = null,
	/** `public|private`. */
	val visibility: String = "public",
)

/** Wire body, or null when the trimmed title is empty. */
internal fun NewTaskInput.toRequest(): CreateTaskRequest? {
	val trimmed = title.trim()
	if (trimmed.isEmpty()) return null
	return CreateTaskRequest(
		title = trimmed,
		dueDate = dueDate?.toString(),
		priority = priority.name.lowercase(),
		category = category?.trim()?.takeIf { it.isNotEmpty() },
		assignedTo = assignedTo,
		visibility = visibility,
		tags = tags.takeIf { it.isNotEmpty() },
		recurrenceFrequency = recurrenceFrequency,
		recurrenceInterval = recurrenceInterval,
	)
}

sealed interface CreateOutcome {
	data class Created(val title: String) : CreateOutcome

	data class Rejected(val message: String) : CreateOutcome

	data object Unauthorized : CreateOutcome

	data object Invalid : CreateOutcome
}

/**
 * Optimistic task creation over the shared task-list state: a pending row
 * lands before the network call, the server task (server id) replaces it,
 * a failure removes it and leaves the server's text inline.
 */
class TaskCreator(
	private val source: TaskSource,
	private val state: MutableStateFlow<TasksUiState>,
	private val newTempId: () -> String = { "pending-${UUID.randomUUID()}" },
) {
	suspend fun create(input: NewTaskInput): CreateOutcome {
		val request = input.toRequest()
		if (request == null) {
			state.update { it.withCreateError("Title is required") }
			return CreateOutcome.Invalid
		}
		val tempId = newTempId()
		state.update { it.withPending(pendingTask(tempId, input, request)) }
		return when (val result = source.createTask(request)) {
			is ApiResult.Ok -> {
				val created = TaskMapper.fromDto(result.value)
				state.update { it.confirmPending(tempId, created) }
				CreateOutcome.Created(created.title)
			}

			is ApiResult.Err -> {
				val message = "Couldn't add \"${request.title}\": ${result.error.message}"
				state.update { it.dropPending(tempId).withCreateError(message) }
				if (result.error is ApiError.Unauthorized) {
					CreateOutcome.Unauthorized
				} else {
					CreateOutcome.Rejected(message)
				}
			}
		}
	}

	private fun pendingTask(tempId: String, input: NewTaskInput, request: CreateTaskRequest) = Task(
		id = tempId,
		title = request.title,
		completed = false,
		priority = input.priority,
		focusMinutes = null,
		dueDate = request.dueDate,
		recurringLabel = request.recurrenceFrequency,
		assignedName = null,
		familyTask = false,
		assignmentStatus = null,
		assignedTo = input.assignedTo,
		category = request.category,
		pending = true,
		tags = input.tags,
		visibility = input.visibility,
	)
}

private fun TasksUiState.readyOnly(block: TasksUiState.Ready.() -> TasksUiState.Ready): TasksUiState =
	if (this is TasksUiState.Ready) block() else this

private fun TasksUiState.withCreateError(message: String) = readyOnly { copy(createError = message) }

private fun TasksUiState.withPending(task: Task) =
	readyOnly { copy(tasks = listOf(task) + tasks, createError = null) }

private fun TasksUiState.dropPending(tempId: String) =
	readyOnly { copy(tasks = tasks.filterNot { it.id == tempId }) }

/** Swap temp → server task; a refresh that already brought it in wins (no duplicate). */
private fun TasksUiState.confirmPending(tempId: String, created: Task) = readyOnly {
	val alreadyListed = tasks.any { it.id == created.id }
	val swapped = tasks.mapNotNull { task ->
		when {
			task.id != tempId -> task
			alreadyListed -> null
			else -> created
		}
	}
	val placed = if (alreadyListed || swapped.any { it.id == created.id }) swapped else listOf(created) + swapped
	copy(tasks = placed)
}
