package com.familyplanz.app.domain

import com.familyplanz.app.data.TaskDto

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
	/** Accrued focus minutes; null = never had focus time (spec: absent or null). */
	val focusMinutes: Int?,
	val dueDate: String?,
	val recurringLabel: String?,
	val assignedName: String?,
	val familyTask: Boolean,
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
	)
}
