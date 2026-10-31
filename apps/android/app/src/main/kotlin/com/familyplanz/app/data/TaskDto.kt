package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Read model of GET /api/tasks. Mirrors docs/guides/task-api-spec.md:
 * every field is nullable-tolerated when absent, unknown extra fields are
 * ignored on parse. `focusMinutes` is READ here; the write path can never
 * carry it (see TaskUpdatePatch).
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
	val tags: List<String> = emptyList(),
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
	}
}

@Serializable
data class FocusCommandRequest(val command: String, val taskId: String? = null)

@Serializable
data class FocusCommandDto(
	val id: String,
	val command: String,
	val taskId: String? = null,
	val issuedAt: String,
)
