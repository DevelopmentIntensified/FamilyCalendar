package com.familyplanz.app.data

/**
 * The one seam between "text on screen" and "a prefilled event form" (#311).
 * The on-device adapter runs first; the server adapter is the fallback.
 * A fake drives the tests; the adapters are thin, so the seam is REAL.
 */
interface EventTextExtractor {
	/** Extract only what the device can find; null = nothing on-device. */
	suspend fun extract(text: String): ParsedEventDto?
}

/** Server fallback: the same Quick Add endpoint, called from a background device session. */
class ServerEventExtractor(private val repository: EventSource) : EventTextExtractor {
	override suspend fun extract(text: String): ParsedEventDto =
		(repository.parseQuickAdd(text, useCloud = true) as? ApiResult.Ok)?.value?.parsed ?: ParsedEventDto()
}

/** The #311 chain: one call the form's selection chip makes, whichever adapter answers. */
interface EventTextExtractorChain {
	suspend fun parseSelected(text: String): ParsedEventDto
}

/**
 * The #311 chain: the on-device adapter tries first; a null or all-null
 * parse hands the phrase to the server. A null [onDevice] is the server-only
 * default older tests build, so their Quick Add path is unchanged.
 */
class OnDeviceFirstExtractorChain(
	private val onDevice: EventTextExtractor?,
	private val server: EventTextExtractor,
) : EventTextExtractorChain {
	override suspend fun parseSelected(text: String): ParsedEventDto =
		onDevice?.extract(text)?.takeUnless { it.isEmptyParse() } ?: server.extract(text) ?: ParsedEventDto()
}

/** Nothing on-device: every field absent (what [OnDeviceEventExtractor] hands back for an unknown phrase). */
internal fun ParsedEventDto.isEmptyParse(): Boolean =
	listOf(title, date, startTime, endTime, location, description).all { it.isNullOrBlank() } &&
		allDay == null && attendants.isNullOrEmpty()
