package com.familyplanz.app.data

import kotlinx.serialization.Serializable

/**
 * POST /api/parse-event bodies/responses (#302). The server answers one of:
 * - 400 `{"error":"Input required"}` (ApiError.BadRequest path)
 * - 429 `{"error":"AI usage limit reached|<reason>"}` (ApiError cap or BadRequest-by-status)
 * - single: `{parsed: <ParsedEventDto|null>, confidence, method}`
 * - multi: `{results: [<QuickParseResult>], method: "regex-list"}`
 */
@Serializable
data class QuickParseRequest(
	val input: String,
	/** The user's cloud-AI setting; the server keeps its old default when the flag is absent. */
	val useCloud: Boolean = true,
)

@Serializable
data class ParsedEventDto(
	val title: String? = null,
	val date: String? = null,
	val startTime: String? = null,
	val endTime: String? = null,
	val location: String? = null,
	val description: String? = null,
	val allDay: Boolean? = null,
	val attendants: List<String>? = null,
)

/** One element of the server's multi response: the web's `{parsed, confidence}` pair. */
@Serializable
data class QuickParseResult(val parsed: ParsedEventDto? = null, val confidence: Double = 0.0)

@Serializable
data class QuickParseResponse(
	val parsed: ParsedEventDto? = null,
	val confidence: Double = 0.0,
	val method: String = "",
	/** Multi responses only (method regex-list); each element carries its own parsed + confidence. */
	val results: List<QuickParseResult> = emptyList(),
)
