package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import retrofit2.http.GET

/** One archived event; [start] is an ISO instant, [calendar] the badge ("Personal calendar" / family name / null). */
@Serializable
data class ArchiveEventDto(
	val id: String = "",
	val title: String = "",
	val start: String = "",
	val location: String? = null,
	val calendar: String? = null,
)

/**
 * `GET /api/archive` (G16). [archiveAllowed] false = the plan has no archive:
 * [reason] is the gate copy. The retention windows are the plan's own.
 */
@Serializable
data class ArchiveResponse(
	val events: List<ArchiveEventDto> = emptyList(),
	val archiveAllowed: Boolean = true,
	val reason: String? = null,
	val planName: String? = null,
	val familyCount: Int = 0,
	val retentionDays: Int = 0,
	val archivedRetentionDays: Int = 0,
)

internal interface ArchiveApi {
	@GET("api/archive")
	suspend fun archive(): ArchiveResponse
}

/** The Archive page's data (G16). */
interface ArchiveSource {
	suspend fun archive(): ApiResult<ArchiveResponse>
}

internal class NetworkArchiveSource(private val api: ArchiveApi) : ArchiveSource {
	override suspend fun archive(): ApiResult<ArchiveResponse> = apiCall { api.archive() }
}
