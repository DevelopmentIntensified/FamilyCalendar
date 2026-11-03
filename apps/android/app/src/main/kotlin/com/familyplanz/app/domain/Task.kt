package com.familyplanz.app.domain

import com.familyplanz.app.data.TaskDto
import java.time.Instant

/** User-facing task view; unknown priority values normalize to NORMAL (spec). */
enum class TaskPriority {
	LOW,
	NORMAL,
	HIGH,
	;

	/** Wire value (`low|normal|high`). */
	val wire: String get() = name.lowercase()

	/** priorityTone.ts PRIORITY_LABEL. */
	val label: String get() = name.lowercase().replaceFirstChar(Char::uppercase)

	companion object {
		fun from(value: String?): TaskPriority = when (value) {
			"low" -> LOW
			"high" -> HIGH
			else -> NORMAL
		}
	}
}

/**
 * One task as the Tasks tab shows it (the web's `TaskItem`). The first block
 * is the original #210 surface other code builds; the rest carry the web
 * row's facts and default to "absent".
 */
data class Task(
	val id: String,
	val title: String,
	val completed: Boolean,
	val priority: TaskPriority,
	/** Closed desktop focus spans in minutes; null = never had focus time (spec: absent or null). */
	val focusMinutes: Int?,
	/** Raw due value from the server (ISO datetime or `YYYY-MM-DD`). */
	val dueDate: String?,
	/** Raw `recurrenceFrequency` (`daily|weekly|monthly|yearly`); null = one-off. */
	val recurringLabel: String?,
	val assignedName: String?,
	val familyTask: Boolean,
	/** Raw assignment state (`pending|accepted|declined`; `none`/blank read as null). */
	val assignmentStatus: String?,
	/** Raw assignee id; equals the token owner id when the task is assigned to me. */
	val assignedTo: String?,
	/** Category name (#280); null = none. */
	val category: String? = null,
	/** Optimistic row not yet confirmed by the server (temp id). */
	val pending: Boolean = false,
	/** Start of the desktop's open focus span; null = not focusing (#290). */
	val focusStartedAt: Instant? = null,
	val notes: String? = null,
	val completedAt: String? = null,
	val recurrenceInterval: Int? = null,
	val completionCount: Int? = null,
	val familyId: String? = null,
	val visibility: String = "public",
	val assigneeFirstName: String? = null,
	val creatorFirstName: String? = null,
	/** Creator id. */
	val userId: String = "",
	val eventTitle: String? = null,
	val createdAt: String? = null,
	val tags: List<String> = emptyList(),
	/** #293: whole minutes of my closed, unabsorbed phone sessions. */
	val phoneFocusMinutes: Int = 0,
	/** #293: start of my open phone session on this task; null = none. */
	val phoneFocusStartedAt: Instant? = null,
) {
	val recurrenceFrequency: String? get() = recurringLabel
	val isRecurring: Boolean get() = recurringLabel != null
}

object TaskMapper {
	fun fromDto(dto: TaskDto): Task = Task(
		id = dto.id,
		title = dto.title,
		completed = dto.completedAt != null,
		priority = TaskPriority.from(dto.priority),
		focusMinutes = dto.focusMinutes,
		dueDate = dto.dueDate,
		recurringLabel = dto.recurrenceFrequency?.takeIf { it.isNotBlank() },
		assignedName = listOfNotNull(dto.assigneeFirstName, dto.assigneeLastName)
			.joinToString(" ")
			.ifBlank { null },
		familyTask = dto.familyId != null,
		assignmentStatus = dto.assignmentStatus?.takeIf { it.isNotBlank() && it != "none" },
		assignedTo = dto.assignedTo,
		category = dto.category?.trim()?.takeIf { it.isNotEmpty() },
		focusStartedAt = parseFocusInstant(dto.focusStartedAt),
		notes = dto.notes?.takeIf { it.isNotBlank() },
		completedAt = dto.completedAt,
		recurrenceInterval = dto.recurrenceInterval,
		completionCount = dto.completionCount,
		familyId = dto.familyId,
		visibility = if (dto.visibility == "private") "private" else "public",
		assigneeFirstName = dto.assigneeFirstName,
		creatorFirstName = dto.creatorFirstName,
		userId = dto.userId,
		eventTitle = dto.eventTitle?.takeIf { it.isNotBlank() },
		createdAt = dto.createdAt.takeIf { it.isNotBlank() },
		tags = dto.tags,
		phoneFocusMinutes = (dto.phoneFocusMinutes ?: 0).coerceAtLeast(0),
		phoneFocusStartedAt = parseFocusInstant(dto.phoneFocusStartedAt),
	)
}
