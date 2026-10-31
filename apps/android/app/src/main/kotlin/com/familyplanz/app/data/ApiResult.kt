package com.familyplanz.app.data

import retrofit2.HttpException
import java.io.IOException

/** Error surface mapped straight from the spec's universal response table. */
sealed interface ApiError {
	val message: String

	data object Unauthorized : ApiError {
		override val message = "Token rejected - mint a new one in the web app (Settings > API tokens)."
	}

	data class BadRequest(val errorText: String) : ApiError {
		override val message: String = errorText
	}

	data class Forbidden(val errorText: String) : ApiError {
		override val message: String = errorText
	}

	data class NotFound(val errorText: String) : ApiError {
		override val message: String = errorText
	}

	data class Server(override val message: String) : ApiError

	data class Network(val cause: String) : ApiError {
		override val message = "Network problem ($cause)"
	}
}

sealed interface ApiResult<out T> {
	data class Ok<T>(val value: T) : ApiResult<T>
	data class Err(val error: ApiError) : ApiResult<Nothing>
}

@kotlinx.serialization.Serializable
internal data class HttpErrorBody(val error: String = "")

/** Best-effort `{"error": "..."}` extraction; 500 prose displays raw. */
internal fun errorBodyText(body: String?): String =
	if (body.isNullOrBlank()) {
		"Unknown server error"
	} else {
		try {
			val parsed = ApiFactory.json.decodeFromString<HttpErrorBody>(body)
			parsed.error.ifBlank { body.take(200) }
		} catch (_: kotlinx.serialization.SerializationException) {
			body.take(200)
		}
	}

suspend fun <T> apiCall(block: suspend () -> T): ApiResult<T> =
	try {
		ApiResult.Ok(block())
	} catch (e: HttpException) {
		val text = errorBodyText(
			e.response()?.errorBody()?.string()
		)
		val error = when (e.code()) {
			401 -> ApiError.Unauthorized
			400 -> ApiError.BadRequest(text)
			403 -> ApiError.Forbidden(text)
			404 -> ApiError.NotFound(text)
			else -> ApiError.Server(text)
		}
		ApiResult.Err(error)
	} catch (e: IOException) {
		ApiResult.Err(ApiError.Network(generation(e) ?: "unable to reach server"))
	}

private fun generation(e: IOException): String? = e.message?.take(120)
