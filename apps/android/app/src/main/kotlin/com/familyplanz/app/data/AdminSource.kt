package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** `GET /api/admin` (G19): the nav-badge counts. */
@Serializable
data class AdminCountsDto(val openBugs: Int = 0, val openPhrases: Int = 0)

@Serializable
data class BugReportDto(
	val id: String = "",
	val area: String = "",
	val description: String = "",
	val url: String? = null,
	val createdAt: String = "",
	val reporterFirstName: String? = null,
	val reporterLastName: String? = null,
)

/** `GET /api/admin/bugs`: newest first; [exportText] is the page's copyable register of the open ones. */
@Serializable
data class AdminBugsDto(
	val open: List<BugReportDto> = emptyList(),
	val resolved: List<BugReportDto> = emptyList(),
	val exportText: String = "",
)

/** An unmatched natural-language phrase; [matched] is the stored JSON sample (or null). */
@Serializable
data class UnmatchedPhraseDto(
	val id: String = "",
	val source: String = "",
	val phrase: String = "",
	val matched: String? = null,
	val count: Int = 1,
	val createdAt: String = "",
)

@Serializable
data class AdminNlpDto(
	val phrases: List<UnmatchedPhraseDto> = emptyList(),
	val resolved: List<UnmatchedPhraseDto> = emptyList(),
	val exportText: String = "",
)

@Serializable
data class ResolveAck(val success: Boolean = false)

internal interface AdminApi {
	@GET("api/admin")
	suspend fun counts(): AdminCountsDto

	@GET("api/admin/bugs")
	suspend fun bugs(): AdminBugsDto

	@POST("api/admin/bugs/{id}/resolve")
	suspend fun resolveBug(@Path("id") id: String): ResolveAck

	@GET("api/admin/nlp")
	suspend fun nlp(): AdminNlpDto

	@POST("api/admin/nlp/{id}/resolve")
	suspend fun resolvePhrase(@Path("id") id: String): ResolveAck
}

/** The admin pages' data (G19). A signed-in non-admin gets [ApiError.Forbidden] on every call. */
interface AdminSource {
	suspend fun counts(): ApiResult<AdminCountsDto>

	suspend fun bugs(): ApiResult<AdminBugsDto>

	suspend fun resolveBug(id: String): ApiResult<Unit>

	suspend fun nlp(): ApiResult<AdminNlpDto>

	suspend fun resolvePhrase(id: String): ApiResult<Unit>
}

internal class NetworkAdminSource(private val api: AdminApi) : AdminSource {
	override suspend fun counts(): ApiResult<AdminCountsDto> = apiCall { api.counts() }

	override suspend fun bugs(): ApiResult<AdminBugsDto> = apiCall { api.bugs() }

	override suspend fun resolveBug(id: String): ApiResult<Unit> = apiCall { api.resolveBug(id) }.acked()

	override suspend fun nlp(): ApiResult<AdminNlpDto> = apiCall { api.nlp() }

	override suspend fun resolvePhrase(id: String): ApiResult<Unit> = apiCall { api.resolvePhrase(id) }.acked()

	/** The ack carries the resolved row; the phone reloads the list, so 2xx is the signal. */
	private fun ApiResult<ResolveAck>.acked(): ApiResult<Unit> = when (this) {
		is ApiResult.Ok -> ApiResult.Ok(Unit)
		is ApiResult.Err -> this
	}
}
