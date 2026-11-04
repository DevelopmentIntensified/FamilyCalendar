package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

/** `POST /api/bug-report` body: [url] is the screen the bug was on (the web's `from`). */
@Serializable
data class BugReportRequest(val area: String, val description: String, val url: String)

@Serializable
data class BugReportAck(val success: Boolean = false)

internal interface BugReportApi {
	@POST("api/bug-report")
	suspend fun report(@Body body: BugReportRequest): BugReportAck
}

/** Files a bug report for the signed-in user. */
interface BugReportSource {
	suspend fun submit(request: BugReportRequest): ApiResult<Unit>
}

internal class NetworkBugReportSource(private val api: BugReportApi) : BugReportSource {
	override suspend fun submit(request: BugReportRequest): ApiResult<Unit> {
		// 429 carries the server's own "Too many reports" text; show it as is.
		val result = apiCall(statusError = { if (it == TOO_MANY) ApiError.BadRequest(TOO_MANY_TEXT) else null }) {
			api.report(request)
		}
		return when (result) {
			is ApiResult.Ok -> ApiResult.Ok(Unit)
			is ApiResult.Err -> result
		}
	}

	private companion object {
		const val TOO_MANY = 429
		const val TOO_MANY_TEXT = "Too many reports. Try again shortly."
	}
}
