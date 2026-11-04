package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/*
 * #292 G8: `GET /api/dashboard?date=` — the Day Dashboard loader (§2.3 of
 * docs/specs/android-mobile-clone.md), streamed promise resolved. Read-only:
 * every mutation the screen makes goes through `/api/tasks`.
 */

/** `dailyVerse`: gated server-side by `dashboardVisibility` (absent = hidden). */
@Serializable
data class VerseDto(val reference: String = "", val text: String = "", val attribution: String? = null)

/** One `/api/tasks` category option (#283), for the board's quick-add. */
@Serializable
data class CategoryOptionDto(val id: String = "", val name: String = "")

/** `glance`: the day's counts, as the loader computed them. */
@Serializable
data class GlanceCountsDto(val doneToday: Int = 0, val openToday: Int = 0, val weekStreak: Int = 0)

/** One Completed-today row. */
@Serializable
data class CompletedTaskDto(val id: String = "", val title: String = "", val completedAt: String? = null)

/** A roster member (`getFamilyRoster`). */
@Serializable
data class FamilyMemberDto(
	val userId: String = "",
	val firstName: String = "",
	val lastName: String = "",
	val email: String? = null,
	val role: String? = null,
	val memberType: String? = null,
)

/** Who's going, when more than one person was invited (`EventAttendanceSummary`). */
@Serializable
data class AttendanceDto(
	val going: Int = 0,
	val invited: Int = 0,
	val required: Int = 0,
	val requiredPending: Int = 0,
	val goingNames: List<String> = emptyList(),
)

/** One Day-at-a-Glance row: a parsed day event plus its RSVP/attendance. */
@Serializable
data class GlanceEventDto(
	val id: String = "",
	val masterId: String? = null,
	val title: String = "",
	val description: String? = null,
	val start: String = "",
	val end: String? = null,
	val allDay: Boolean = false,
	val isAd: Boolean = false,
	val location: String? = null,
	val calendarId: String? = null,
	val color: String? = null,
	/** `own` or `family` — the cyan Family chip. */
	val source: String = "own",
	/** `going` | `maybe` | `declined` | `undecided`. */
	val rsvpStatus: String? = null,
	val attendance: AttendanceDto? = null,
)

/** One Kids' Schedule event, with the children attending it. */
@Serializable
data class KidsEventDto(
	val id: String = "",
	val title: String = "",
	val start: String = "",
	val end: String? = null,
	val allDay: Boolean = false,
	val location: String? = null,
	val kids: List<KidDto> = emptyList(),
)

/** A child attendee: id so the card groups and colours per child (072). */
@Serializable
data class KidDto(val id: String = "", val name: String = "")

/** An open grocery item, projected to the two fields the card reads. */
@Serializable
data class GroceryCardItemDto(val name: String = "", val stores: List<String> = emptyList())

/** The streamed half of the payload (`dashboardData`, promise resolved). */
@Serializable
data class DashboardDataDto(
	val userTasks: List<TaskDto> = emptyList(),
	val familyTasks: List<TaskDto> = emptyList(),
	val familyMembers: List<FamilyMemberDto> = emptyList(),
	val dayEvents: List<GlanceEventDto> = emptyList(),
	val top3: List<TaskDto> = emptyList(),
	val glance: GlanceCountsDto = GlanceCountsDto(),
	val completedToday: List<CompletedTaskDto> = emptyList(),
	val kidsSchedule: List<KidsEventDto> = emptyList(),
	val familyGroceries: List<GroceryCardItemDto> = emptyList(),
	val mineGroceries: List<GroceryCardItemDto> = emptyList(),
)

/** `GET /api/dashboard?date=YYYY-MM-DD` verbatim (G8). */
@Serializable
data class DashboardDto(
	val zone: String = "UTC",
	val dayISO: String = "",
	val isToday: Boolean = false,
	val meId: String = "",
	val familyId: String? = null,
	/** Composed per-module visibility: absent key = visible (`showsModule`). */
	val modules: Map<String, Boolean> = emptyMap(),
	val dailyVerse: VerseDto? = null,
	val taskCategories: List<CategoryOptionDto> = emptyList(),
	val data: DashboardDataDto = DashboardDataDto(),
	/** Section labels whose model failed to load. */
	val warnings: List<String> = emptyList(),
)

/** A board quick-add POST: `assignedTo` null = leave it to the server. */
data class NewFamilyTask(
	val title: String,
	val familyId: String,
	val assignedTo: String? = null,
	val dueDate: String? = null,
	val priority: String = "normal",
	val tags: List<String> = emptyList(),
	val category: String? = null,
) {
	fun json(): JsonElement = buildJsonObject {
		put("title", JsonPrimitive(title))
		put("familyId", JsonPrimitive(familyId))
		assignedTo?.let { put("assignedTo", JsonPrimitive(it)) }
		dueDate?.let { put("dueDate", JsonPrimitive(it)) }
		put("priority", JsonPrimitive(priority))
		if (tags.isNotEmpty()) put("tags", JsonArray(tags.map { JsonPrimitive(it) }))
		category?.let { put("category", JsonPrimitive(it)) }
	}
}

/** The dashboard read plus the two `/api/tasks` mutations its rows make. */
interface DashboardSource {
	suspend fun load(date: String?): ApiResult<DashboardDto>

	/** `PUT /api/tasks/{id}` `{toggleComplete:true}`. */
	suspend fun toggleComplete(id: String): ApiResult<Unit>

	/** `PUT /api/tasks/{id}` `{priority}` (`low` | `normal` | `high`). */
	suspend fun setPriority(id: String, priority: String): ApiResult<Unit>

	/** Board quick-add: `POST /api/tasks` with `familyId` + the @mention assignee. */
	suspend fun createFamilyTask(task: NewFamilyTask): ApiResult<Unit>
}

interface DashboardApi {
	@GET("api/dashboard")
	suspend fun load(@Query("date") date: String?): DashboardDto

	@PUT("api/tasks/{id}")
	suspend fun updateTask(@Path("id") id: String, @Body body: JsonElement): JsonElement

	@POST("api/tasks")
	suspend fun createTask(@Body body: JsonElement): JsonElement
}

class NetworkDashboardSource(private val api: DashboardApi) : DashboardSource {
	override suspend fun load(date: String?) = apiCall { api.load(date?.takeIf { it.isNotBlank() }) }

	override suspend fun toggleComplete(id: String) = apiCall {
		api.updateTask(id, buildJsonObject { put("toggleComplete", JsonPrimitive(true)) })
		Unit
	}

	override suspend fun setPriority(id: String, priority: String) = apiCall {
		api.updateTask(id, buildJsonObject { put("priority", JsonPrimitive(priority)) })
		Unit
	}

	override suspend fun createFamilyTask(task: NewFamilyTask) = apiCall {
		api.createTask(task.json())
		Unit
	}
}
