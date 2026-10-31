package com.familyplanz.app.data

import kotlinx.serialization.json.JsonElement
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Slices of the /api/tasks surface the phone consumes (spec, 2026-10-29). */
interface FamilyPlanzApi {
	@GET("api/tasks")
	suspend fun tasks(): TaskListResponse

	@PUT("api/tasks/{id}")
	suspend fun updateTask(@Path("id") id: String, @Body body: JsonElement): TaskMutationResponse

	@POST("api/taskfocus/commands")
	suspend fun enqueueFocusCommand(@Body body: FocusCommandRequest): FocusCommandDto

	/** Existing calendar endpoint (issue 082, max 62-day window, strict dates). */
	@GET("api/events")
	suspend fun events(@Query("from") from: String, @Query("to") to: String): EventsResponse
}
