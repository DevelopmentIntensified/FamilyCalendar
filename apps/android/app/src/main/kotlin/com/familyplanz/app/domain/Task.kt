package com.familyplanz.app.domain

import com.familyplanz.app.data.TaskDto
import java.time.Instant

/** User-facing task view; unknown priority values normalize to NORMAL (spec). */
enum class TaskPriority {
	LOW,
	NORMAL,
	HIGH,
	;

	companion object {
		fun from(value: String?): TaskPriority = when (value) {
			"low" -> LOW
			"high" -> HIGH
			else -> NORMAL
		}
	}
}

data class Task(
	val id: String,
	val title: String,
	val completed: Boolean,
	val priority: TaskPriority,
	/** Closed focus spans in minutes; null = never had focus time (spec: absent or null). */
	val focusMinutes: Int?,
	val dueDate: String?,
	val recurringLabel: String?,
	val assignedName: String?,
	val familyTask: Boolean,
	/** Raw assignment state (`none|pending|accepted|declined`, null absent). */
	val assignmentStatus: String?,
	/** Raw assignee id; equals the token owner id when the task is assigned to me. */
	val assignedTo: String?,
	/** Category name (#280); null = none. */
	val category: String? = null,
	/** Optimistic row not yet confirmed by the server (temp id). */
	val pending: Boolean = false,
	/** Start of the desktop's open focus span; null = not focusing (#290). */
	val focusStartedAt: Instant? = null,
)

object TaskMapper {
	fun fromDto(dto: TaskDto): Task = Task(
		id = dto.id,
		title = dto.title,
		completed = dto.completedAt != null,
		priority = TaskPriority.from(dto.priority),
		focusMinutes = dto.focusMinutes,
		dueDate = dto.dueDate,
		recurringLabel = dto.recurrenceFrequency,
		assignedName = listOfNotNull(dto.assigneeFirstName, dto.assigneeLastName)
			.joinToString(" ")
			.ifBlank { null },
		familyTask = dto.familyId != null,
		assignmentStatus = dto.assignmentStatus?.takeIf { it.isNotBlank() && it != "none" },
		assignedTo = dto.assignedTo,
		category = dto.category?.trim()?.takeIf { it.isNotEmpty() },
		focusStartedAt = parseFocusInstant(dto.focusStartedAt),
	)
}
