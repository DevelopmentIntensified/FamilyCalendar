package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Slices of the /api/tasks surface the phone consumes (spec, 2026-10-29). */
interface FamilyPlanzApi {
	@GET("api/tasks")
	suspend fun tasks(): TaskListResponse

	/** Task creation (spec: 201 `{success, task}`; 400 carries `error`). */
	@POST("api/tasks")
	suspend fun createTask(@Body body: CreateTaskRequest): TaskMutationResponse

	@PUT("api/tasks/{id}")
	suspend fun updateTask(@Path("id") id: String, @Body body: JsonElement): TaskMutationResponse

	@POST("api/taskfocus/commands")
	suspend fun enqueueFocusCommand(@Body body: FocusCommandRequest): FocusCommandDto

	/** Existing calendar endpoint (issue 082, max 62-day window, strict dates). */
	@GET("api/events")
	suspend fun events(@Query("from") from: String, @Query("to") to: String): EventsResponse

	/** Natural-language quick-add parse (POST, single or multi-event). */
	@POST("api/parse-event")
	suspend fun parseEvent(@Body body: QuickParseRequest): QuickParseResponse

	/** The authenticated identity (needed to react to pending assignments). */
	@GET("api/me")
	suspend fun me(): MeDto

	/** Event creation (201 shape mirrors the spec's task POST). */
	@POST("api/events")
	suspend fun createEvent(@Body body: CreateEventRequest): CreatedEventResponse

	/** FCM token upsert (#272; idempotent, 200 `{success}`). */
	@POST("api/devices")
	suspend fun registerDevice(@Body body: RegisterDeviceRequest): DeviceAck

	/** DELETE with a JSON body (#272) — Retrofit needs @HTTP for that. */
	@HTTP(method = "DELETE", path = "api/devices", hasBody = true)
	suspend fun unregisterDevice(@Body body: UnregisterDeviceRequest): DeviceAck
}

/**
 * Phone-side POST body: only these fields are constructible, so the phone
 * never sends focus time. Nulls are omitted on the wire (explicitNulls off).
 * `dueDate` is `YYYY-MM-DD`; `priority` is `low|normal|high`.
 */
@Serializable
data class CreateTaskRequest(
	val title: String,
	val dueDate: String? = null,
	val priority: String? = null,
)

@Serializable
data class CreateEventRequest(
	val title: String,
	val start: String,
	val end: String? = null,
	val allDay: Boolean = false,
	val location: String? = null,
	val description: String? = null,
)

@Serializable
data class CreatedEventResponse(val success: Boolean = true, val event: EventDto)

@Serializable
data class MeDto(val id: String, val firstName: String? = null, val lastName: String? = null)
