package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Read model of GET /api/tasks. Mirrors docs/guides/task-api-spec.md:
 * every field is nullable-tolerated when absent, unknown extra fields are
 * ignored on parse. `focusMinutes` / `focusStartedAt` are READ here; the
 * write path can never carry them (see TaskUpdatePatch).
 */
@Serializable
data class TaskDto(
	val id: String,
	val title: String,
	val notes: String? = null,
	val dueDate: String? = null,
	val completedAt: String? = null,
	val archivedAt: String? = null,
	val recurrenceFrequency: String? = null,
	val recurrenceInterval: Int? = null,
	val completionCount: Int? = null,
	val assignedTo: String? = null,
	val assignmentStatus: String? = null,
	val priority: String = "normal",
	val visibility: String = "public",
	val assigneeFirstName: String? = null,
	val assigneeLastName: String? = null,
	val creatorFirstName: String? = null,
	val creatorLastName: String? = null,
	val userId: String = "",
	val familyId: String? = null,
	val eventId: String? = null,
	val eventTitle: String? = null,
	val eventStart: String? = null,
	val createdAt: String = "",
	val focusMinutes: Int? = null,
	/** Start of the desktop's open focus span (ISO); null/absent = not focusing. Read-only here too. */
	val focusStartedAt: String? = null,
	val tags: List<String> = emptyList(),
	/** Category name (#280, ≤80 chars); null/absent = none. */
	val category: String? = null,
	/** #293: whole minutes of the caller's closed, unabsorbed phone sessions (0 = none). */
	val phoneFocusMinutes: Int? = null,
	/** #293: start of the caller's open phone session on this task (ISO); null = none. */
	val phoneFocusStartedAt: String? = null,
)

@Serializable
data class TaskListResponse(val tasks: List<TaskDto> = emptyList())

@Serializable
data class TaskMutationResponse(val success: Boolean = true, val task: TaskDto)

/** Manual PUT body: only the fields the caller set are present in the JSON. */
class TaskUpdatePatch private constructor(val json: kotlinx.serialization.json.JsonObject) {
	companion object {
		/**
		 * Phone-side completion toggle. focusMinutes is desktop-write-only
		 * (spec): it is not constructible here, so a phone edit can never
		 * wipe accrued focus time.
		 */
		fun completeToggle(): TaskUpdatePatch = TaskUpdatePatch(
			buildJsonObject {
				put("toggleComplete", true)
			}
		)

		/**
		 * Respond to a pending assignment. Only the assignee may answer
		 * (403 otherwise, unowned paths never send the field) — the caller
		 * checks `assignedTo == me` before offering the buttons.
		 */
		fun respondAssignment(status: String): TaskUpdatePatch = TaskUpdatePatch(
			buildJsonObject {
				put("assignmentStatus", status)
			}
		)

		/** Skip this occurrence of a recurring task (the server rolls the cursor). */
		fun advanceToNext(): TaskUpdatePatch = TaskUpdatePatch(buildJsonObject { put("advanceToNext", true) })

		/** Reverse a recurring check-off; [previousDueDate] is the due captured before completing. */
		fun undoComplete(previousDueDate: String?): TaskUpdatePatch = TaskUpdatePatch(
			buildJsonObject {
				put("undoComplete", true)
				put("previousDueDate", previousDueDate)
			}
		)

		/** The edit dialog's save: only [TaskEdit]'s present fields reach the wire. */
		fun edit(edit: TaskEdit): TaskUpdatePatch = TaskUpdatePatch(
			buildJsonObject {
				put("title", edit.title)
				put("notes", edit.notes)
				put("dueDate", edit.dueDate)
				put("recurrenceFrequency", edit.recurrenceFrequency)
				put("recurrenceInterval", edit.recurrenceInterval)
				put("priority", edit.priority)
				put("tags", kotlinx.serialization.json.JsonArray(edit.tags.map { kotlinx.serialization.json.JsonPrimitive(it) }))
				edit.visibility?.let { put("visibility", it) }
				edit.assignedTo?.let { put("assignedTo", it.value) }
				edit.assignmentStatus?.let { put("assignmentStatus", it) }
				edit.category?.let { put("category", it.value) }
			}
		)
	}
}

/** A nullable field that is sent only when changed: absent = unchanged, `Changed(null)` = clear. */
data class Changed<T>(val value: T)

/**
 * The web's EditPayload (taskEditPayload.ts): the plain fields always ride,
 * visibility only for the owner, assignee/category only when changed.
 * There is deliberately no focus field.
 */
data class TaskEdit(
	val title: String,
	val notes: String?,
	val dueDate: String?,
	val recurrenceFrequency: String?,
	val recurrenceInterval: Int?,
	val priority: String,
	val tags: List<String>,
	val visibility: String? = null,
	val assignedTo: Changed<String?>? = null,
	val assignmentStatus: String? = null,
	val category: Changed<String?>? = null,
)

@Serializable
data class FocusCommandRequest(val command: String, val taskId: String? = null)

@Serializable
data class FocusCommandDto(
	val id: String,
	val command: String,
	val taskId: String? = null,
	val issuedAt: String,
)
