package com.familyplanz.app.data

/** Month events, quick-add parse (a hint) and event creation. */
interface EventSource {
	suspend fun monthEvents(year: Int, month: Int): ApiResult<List<EventDto>>

	suspend fun parseQuickAdd(input: String): ApiResult<QuickParseResponse>

	suspend fun createEvent(request: CreateEventRequest): ApiResult<EventDto>

	/** Offline fallback read (null = nothing cached yet). */
	suspend fun cachedEvents(year: Int, month: Int): List<EventDto>?
}

class NetworkEventSource(
	private val api: FamilyPlanzApi,
	private val cache: TaskCache? = null,
) : EventSource {
	/** Server preselects a padded month grid around `to`; native groups by `date`. */
	override suspend fun monthEvents(year: Int, month: Int): ApiResult<List<EventDto>> {
		val last = java.time.YearMonth.of(year, month).atEndOfMonth().toString()
		val first = "%04d-%02d-01".format(year, month)
		val result = apiCall { api.events(first, last).events }
		if (result is ApiResult.Ok) cache?.saveEvents(year, month, result.value)
		return result
	}

	override suspend fun parseQuickAdd(input: String): ApiResult<QuickParseResponse> =
		apiCall { api.parseEvent(QuickParseRequest(input)) }

	override suspend fun createEvent(request: CreateEventRequest): ApiResult<EventDto> =
		apiCall { api.createEvent(request).event }

	override suspend fun cachedEvents(year: Int, month: Int): List<EventDto>? = cache?.loadEvents(year, month)
}
