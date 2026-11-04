package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import retrofit2.HttpException
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import java.io.IOException

/*
 * Phone focus sessions (#293, TaskFocus #124): the phone times focus itself
 * and writes its own session log; the desktop absorbs closed sessions into
 * focusMinutes. The phone never writes focusMinutes. Contract:
 * docs/guides/task-api-spec.md "TaskFocus phone focus sessions".
 */

/** Session shape of the `{session}` responses. */
@Serializable
data class FocusSessionDto(
	val id: String,
	val taskId: String,
	val startedAt: String,
	val endedAt: String? = null,
	val source: String = "phone",
	val absorbedAt: String? = null,
)

@Serializable
data class FocusSessionEnvelope(val session: FocusSessionDto)

/** POST body; [endedAt] present = a finished session recorded offline. */
@Serializable
data class StartFocusSessionRequest(val taskId: String, val startedAt: String, val endedAt: String? = null)

@Serializable
data class EndFocusSessionRequest(val endedAt: String)

@Serializable
internal data class FocusConflictBody(val error: String = "", val openSessionId: String? = null)

interface FocusSessionApi {
	@POST("api/taskfocus/sessions")
	suspend fun startFocusSession(@Body body: StartFocusSessionRequest): FocusSessionEnvelope

	@PATCH("api/taskfocus/sessions/{id}")
	suspend fun endFocusSession(@Path("id") id: String, @Body body: EndFocusSessionRequest): FocusSessionEnvelope

	@DELETE("api/taskfocus/sessions/{id}")
	suspend fun deleteFocusSession(@Path("id") id: String): TaskAck
}

/** What a POST came back with: the 409 names the open session to adopt or close first. */
sealed interface FocusStartResult {
	data class Started(val session: FocusSessionDto) : FocusStartResult

	data class Conflict(val openSessionId: String) : FocusStartResult

	data class Failed(val error: ApiError) : FocusStartResult
}

/** Outcome of a PATCH / DELETE; [Gone] = 404 (unknown / already deleted: treat as done), [Absorbed] = 409. */
sealed interface FocusCloseResult {
	data object Done : FocusCloseResult

	data object Gone : FocusCloseResult

	data object Absorbed : FocusCloseResult

	data class Failed(val error: ApiError) : FocusCloseResult
}

interface FocusSessionSource {
	/** POST with `startedAt` (and `endedAt` for an offline-recorded finished session). */
	suspend fun startFocusSession(request: StartFocusSessionRequest): FocusStartResult =
		FocusStartResult.Failed(ApiError.Unsupported)

	suspend fun endFocusSession(id: String, endedAt: String): FocusCloseResult =
		FocusCloseResult.Failed(ApiError.Unsupported)

	suspend fun deleteFocusSession(id: String): FocusCloseResult =
		FocusCloseResult.Failed(ApiError.Unsupported)
}

class NetworkFocusSessionSource(private val api: FocusSessionApi) : FocusSessionSource {
	override suspend fun startFocusSession(request: StartFocusSessionRequest): FocusStartResult =
		try {
			FocusStartResult.Started(api.startFocusSession(request).session)
		} catch (e: HttpException) {
			val body = e.response()?.errorBody()?.string()
			val conflict = if (e.code() == 409) conflictId(body) else null
			if (conflict != null) FocusStartResult.Conflict(conflict) else FocusStartResult.Failed(httpError(e.code(), body))
		} catch (e: IOException) {
			FocusStartResult.Failed(ApiError.Network(e.message?.take(120) ?: "unable to reach server"))
		}

	override suspend fun endFocusSession(id: String, endedAt: String): FocusCloseResult =
		close { api.endFocusSession(id, EndFocusSessionRequest(endedAt)) }

	override suspend fun deleteFocusSession(id: String): FocusCloseResult = close { api.deleteFocusSession(id) }

	private suspend fun close(block: suspend () -> Any): FocusCloseResult =
		try {
			block()
			FocusCloseResult.Done
		} catch (e: HttpException) {
			when (e.code()) {
				404 -> FocusCloseResult.Gone
				409 -> FocusCloseResult.Absorbed
				else -> FocusCloseResult.Failed(httpError(e.code(), e.response()?.errorBody()?.string()))
			}
		} catch (e: IOException) {
			FocusCloseResult.Failed(ApiError.Network(e.message?.take(120) ?: "unable to reach server"))
		}

	private fun conflictId(body: String?): String? =
		body?.let { runCatching { ApiFactory.json.decodeFromString<FocusConflictBody>(it) }.getOrNull() }
			?.openSessionId?.takeIf { it.isNotBlank() }

	private fun httpError(code: Int, body: String?): ApiError {
		val text = errorBodyText(body)
		return when (code) {
			401 -> ApiError.Unauthorized
			400 -> ApiError.BadRequest(text)
			403 -> ApiError.Forbidden(text)
			404 -> ApiError.NotFound(text)
			else -> ApiError.Server(text)
		}
	}
}
