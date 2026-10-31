package com.familyplanz.app.data

import kotlinx.serialization.Serializable

/**
 * POST /api/parse-event bodies/responses. The server answers one of:
 * - 400 `{"error":"Input required"}` (ApiError.BadRequest path)
 * - 429 `{"error":"AI usage limit reached|<reason>"}` (ApiError cap or BadRequest-by-status)
 * - single: `{parsed: <ParsedEventDto|null>, confidence, method}`
 * - multi:  `{results: [<ParsedEventDto>], method: "regex-list"}`
 * ParsedEventDto fields are all optional (server may return partials).
 */
@Serializable
data class QuickParseRequest(val input: String)

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

@Serializable
data class QuickParseResponse(
	val parsed: ParsedEventDto? = null,
	val confidence: Double = 0.0,
	val method: String = "",
	val results: List<ParsedEventDto> = emptyList(),
)
