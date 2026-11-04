package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/*
 * #292 L2: everything the Calendar screen reads and writes beyond the month
 * fetch / parse / create that [EventSource] already carries. Reads are the
 * L0 JSON twins of the `/calendar` page load (G2–G7, task-api-spec.md "App
 * screen endpoints"); writes are the existing `/api/events*` + `/api/tasks*`.
 */

/** Read side: G2 calendars, G3 settings, G4 roster, G5 due tasks, G6 ads, G7 verse. */
interface CalendarReads {
	suspend fun calendars(): ApiResult<List<CalendarDto>>

	suspend fun settings(): ApiResult<CalendarSettingsDto>

	suspend fun roster(): ApiResult<List<RosterMemberDto>>

	/** GET /api/tasks with G5 `eventCalendarId`. */
	suspend fun calendarTasks(): ApiResult<List<CalendarTaskDto>>

	suspend fun sponsoredEvents(month: String): ApiResult<List<EventDto>>

	suspend fun dailyVerse(date: String): ApiResult<VerseDto?>
}

/** Write side: event edit/delete/RSVP/bulk, checklist, task tab, phrase reports. */
interface EventWrites {
	suspend fun updateEvent(id: String, body: JsonObject): ApiResult<Unit>

	suspend fun deleteEvent(id: String, scope: String, occurrenceDate: String?): ApiResult<Unit>

	suspend fun rsvp(id: String): ApiResult<RsvpStateDto>

	suspend fun setRsvp(id: String, status: String): ApiResult<RsvpStateDto>

	suspend fun bulk(body: BulkRequest): ApiResult<BulkResponse>

	suspend fun checklist(eventId: String): ApiResult<List<CalendarTaskDto>>

	suspend fun addTask(body: CalendarTaskCreate): ApiResult<CalendarTaskDto>

	suspend fun taskAction(id: String, body: JsonObject): ApiResult<Unit>

	suspend fun reportPhrase(phrase: String, source: String): ApiResult<Unit>
}

interface CalendarSource : CalendarReads, EventWrites

@Serializable
data class CalendarDto(val id: String, val name: String, val color: String? = null, val kind: String = "personal")

@Serializable
data class CalendarsResponse(val calendars: List<CalendarDto> = emptyList())

/** G3 `settings`; absent fields keep the page defaults. */
@Serializable
data class CalendarSettingsDto(
	val weekStart: String = "sunday",
	val timeZone: String? = null,
	val color: String? = null,
	val defaultView: String? = null,
	val defaultCalendarId: String? = null,
	val autoParseEventDetails: Boolean = true,
	val showDailyVerse: Boolean = false,
	val showAdsAsEvents: Boolean = false,
)

@Serializable
data class SettingsResponse(val settings: CalendarSettingsDto = CalendarSettingsDto())

@Serializable
data class RosterMemberDto(
	val userId: String,
	val firstName: String? = null,
	val lastName: String? = null,
	val role: String? = null,
	val memberType: String? = null,
)

@Serializable
data class RosterResponse(val familyId: String? = null, val members: List<RosterMemberDto> = emptyList())

/** The task fields a calendar chip / checklist / detail sheet reads (task-api-spec.md Task + G5). */
@Serializable
data class CalendarTaskDto(
	val id: String,
	val title: String,
	val notes: String? = null,
	val dueDate: String? = null,
	val completedAt: String? = null,
	val recurrenceFrequency: String? = null,
	val recurrenceInterval: Int? = null,
	val assignedTo: String? = null,
	val assigneeFirstName: String? = null,
	val priority: String = "normal",
	val visibility: String = "public",
	val familyId: String? = null,
	val eventId: String? = null,
	val eventTitle: String? = null,
	val eventCalendarId: String? = null,
)

@Serializable
data class CalendarTasksResponse(val tasks: List<CalendarTaskDto> = emptyList())

@Serializable
data class CalendarTaskCreated(val task: CalendarTaskDto)

/** POST /api/tasks from the create form's Task tab or an event checklist. */
@Serializable
data class CalendarTaskCreate(
	val title: String,
	val dueDate: String? = null,
	val visibility: String? = null,
	val eventId: String? = null,
)

@Serializable
data class SponsoredResponse(val events: List<EventDto> = emptyList())

@Serializable
data class VerseDto(val reference: String, val text: String, val attribution: String? = null)

@Serializable
data class VerseResponse(val verse: VerseDto? = null)

@Serializable
data class AttendeeDto(
	val userId: String? = null,
	val status: String = "undecided",
	val firstName: String? = null,
	val lastName: String? = null,
	val name: String? = null,
)

/** GET returns `userRsvpStatus`; POST returns `rsvpStatus` — both carry `attendance`. */
@Serializable
data class RsvpStateDto(
	val attendance: List<AttendeeDto> = emptyList(),
	val userRsvpStatus: String? = null,
)

@Serializable
data class RsvpRequest(val status: String)

@Serializable
data class BulkItem(val id: String)

/** `op` is the server's BulkOp union, built by the caller; `plan` echoes a reviewed smart plan. */
@Serializable
data class BulkRequest(
	val ids: List<BulkItem>,
	val op: JsonObject,
	val dryRun: Boolean? = null,
	val plan: List<JsonObject>? = null,
)

@Serializable
data class BulkResponse(val success: Boolean = true, val applied: JsonElement? = null, val plan: List<JsonObject>? = null)

@Serializable
data class DeleteEventRequest(val scope: String, val occurrenceDate: String? = null)

@Serializable
data class ReportPhraseRequest(val phrase: String, val source: String)

interface CalendarReadApi {
	@GET("api/calendars")
	suspend fun calendars(): CalendarsResponse

	@GET("api/me/settings")
	suspend fun settings(): SettingsResponse

	@GET("api/family/roster")
	suspend fun roster(): RosterResponse

	@GET("api/tasks")
	suspend fun tasks(@Query("eventId") eventId: String? = null): CalendarTasksResponse

	@GET("api/sponsored-events")
	suspend fun sponsored(@Query("month") month: String): SponsoredResponse

	@GET("api/daily-verse")
	suspend fun verse(@Query("date") date: String): VerseResponse
}

interface EventWriteApi {
	@PUT("api/events/{id}")
	suspend fun updateEvent(@Path("id") id: String, @Body body: JsonObject): JsonElement

	@HTTP(method = "DELETE", path = "api/events/{id}", hasBody = true)
	suspend fun deleteEvent(@Path("id") id: String, @Body body: DeleteEventRequest): JsonElement

	@GET("api/events/{id}/rsvp")
	suspend fun rsvp(@Path("id") id: String): RsvpStateDto

	@POST("api/events/{id}/rsvp")
	suspend fun setRsvp(@Path("id") id: String, @Body body: RsvpRequest): RsvpStateDto

	@POST("api/events/bulk")
	suspend fun bulk(@Body body: BulkRequest): BulkResponse

	@POST("api/tasks")
	suspend fun addTask(@Body body: CalendarTaskCreate): CalendarTaskCreated

	@PUT("api/tasks/{id}")
	suspend fun taskAction(@Path("id") id: String, @Body body: JsonObject): JsonElement

	@POST("api/report-phrase")
	suspend fun reportPhrase(@Body body: ReportPhraseRequest): JsonElement
}

/** A pre-L0 server answers 404 on G2–G7: that is "no data yet", never an error screen. */
private suspend fun <T> optional(fallback: T, block: suspend () -> T): ApiResult<T> =
	when (val result = apiCall(block = block)) {
		is ApiResult.Err -> if (result.error is ApiError.NotFound) ApiResult.Ok(fallback) else result
		is ApiResult.Ok -> result
	}

class NetworkCalendarReads(private val api: CalendarReadApi) : CalendarReads {
	override suspend fun calendars() = optional(emptyList()) { api.calendars().calendars }

	override suspend fun settings() = optional(CalendarSettingsDto()) { api.settings().settings }

	override suspend fun roster() = optional(emptyList()) { api.roster().members }

	override suspend fun calendarTasks() = apiCall { api.tasks().tasks }

	override suspend fun sponsoredEvents(month: String) = optional(emptyList()) { api.sponsored(month).events }

	override suspend fun dailyVerse(date: String) = optional<VerseDto?>(null) { api.verse(date).verse }
}

class NetworkEventWrites(private val api: EventWriteApi, private val reads: CalendarReadApi) : EventWrites {
	override suspend fun updateEvent(id: String, body: JsonObject) = apiCall { api.updateEvent(id, body).let { } }

	override suspend fun deleteEvent(id: String, scope: String, occurrenceDate: String?) =
		apiCall { api.deleteEvent(id, DeleteEventRequest(scope, occurrenceDate)).let { } }

	override suspend fun rsvp(id: String) = apiCall { api.rsvp(id) }

	override suspend fun setRsvp(id: String, status: String) = apiCall { api.setRsvp(id, RsvpRequest(status)) }

	override suspend fun bulk(body: BulkRequest) = apiCall { api.bulk(body) }

	override suspend fun checklist(eventId: String) = apiCall { reads.tasks(eventId).tasks }

	override suspend fun addTask(body: CalendarTaskCreate) = apiCall { api.addTask(body).task }

	override suspend fun taskAction(id: String, body: JsonObject) = apiCall { api.taskAction(id, body).let { } }

	override suspend fun reportPhrase(phrase: String, source: String) =
		apiCall { api.reportPhrase(ReportPhraseRequest(phrase, source)).let { } }
}

class NetworkCalendarSource(reads: CalendarReadApi, writes: EventWriteApi) :
	CalendarSource,
	CalendarReads by NetworkCalendarReads(reads),
	EventWrites by NetworkEventWrites(writes, reads) {
	companion object {
		fun create(baseUrl: String, tokenProvider: () -> String?): NetworkCalendarSource {
			val retrofit = Retrofit.Builder()
				.baseUrl(baseUrl)
				.client(ApiFactory.createClient(tokenProvider))
				.addConverterFactory(ApiFactory.json.asConverterFactory("application/json".toMediaType()))
				.build()
			return NetworkCalendarSource(retrofit.create(CalendarReadApi::class.java), retrofit.create(EventWriteApi::class.java))
		}
	}
}

/** For a repository with no calendar edge (UI fakes that predate L2): every read is empty. */
object UnavailableCalendarSource : CalendarSource, CalendarReads by EmptyReads, EventWrites by NoWrites

private object EmptyReads : CalendarReads {
	override suspend fun calendars() = ApiResult.Ok(emptyList<CalendarDto>())

	override suspend fun settings() = ApiResult.Ok(CalendarSettingsDto())

	override suspend fun roster() = ApiResult.Ok(emptyList<RosterMemberDto>())

	override suspend fun calendarTasks() = ApiResult.Ok(emptyList<CalendarTaskDto>())

	override suspend fun sponsoredEvents(month: String) = ApiResult.Ok(emptyList<EventDto>())

	override suspend fun dailyVerse(date: String) = ApiResult.Ok<VerseDto?>(null)
}

private object NoWrites : EventWrites {
	private val none = ApiResult.Err(ApiError.Unsupported)

	override suspend fun updateEvent(id: String, body: JsonObject) = none

	override suspend fun deleteEvent(id: String, scope: String, occurrenceDate: String?) = none

	override suspend fun rsvp(id: String) = none

	override suspend fun setRsvp(id: String, status: String) = none

	override suspend fun bulk(body: BulkRequest) = none

	override suspend fun checklist(eventId: String) = ApiResult.Ok(emptyList<CalendarTaskDto>())

	override suspend fun addTask(body: CalendarTaskCreate) = none

	override suspend fun taskAction(id: String, body: JsonObject) = none

	override suspend fun reportPhrase(phrase: String, source: String) = none
}
