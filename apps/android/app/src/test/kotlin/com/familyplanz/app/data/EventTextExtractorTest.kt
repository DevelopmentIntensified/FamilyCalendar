package com.familyplanz.app.data

import java.time.LocalDate
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * #311: text selection -> a prefilled event form. The on-device regex
 * extractor reads day/time shapes without Play services; the server is the
 * fallback the chain calls when the phone found nothing.
 */
class EventTextExtractorTest {
	/** A Tuesday, so "friday" is this week's Friday (three days on). */
	private val today = LocalDate.of(2026, 11, 10)

	/** The four EventSource calls the adapters may make; only the parse is used here. */
	private fun source(
		result: ApiResult<QuickParseResponse>,
		seen: MutableList<Pair<String, Boolean>> = mutableListOf(),
	) = object : EventSource {
		override suspend fun monthEvents(year: Int, month: Int): ApiResult<List<EventDto>> = error("not used")

		override suspend fun parseQuickAdd(input: String, useCloud: Boolean): ApiResult<QuickParseResponse> {
			seen += input to useCloud
			return result
		}

		override suspend fun createEvent(request: CreateEventRequest): ApiResult<EventDto> = error("not used")

		override suspend fun cachedEvents(year: Int, month: Int): List<EventDto>? = null
	}

	private fun onDevice(parsed: ParsedEventDto?) = object : EventTextExtractor {
		override suspend fun extract(text: String): ParsedEventDto? = parsed
	}

	@Test
	fun `the on-device extractor reads day and time from Dinner Friday 7pm`() = runBlocking {
		val parsed = OnDeviceEventExtractor { today }.extract("Dinner Friday 7pm")
		assertEquals("2026-11-13", parsed?.date)
		assertEquals("19:00", parsed?.startTime)
		assertNull(parsed?.title)
	}

	@Test
	fun `the on-device extractor adds a duration to the start time`() = runBlocking {
		val parsed = OnDeviceEventExtractor { today }.extract("Lunch tomorrow at 12:00 for 45 minutes")
		assertEquals("2026-11-11", parsed?.date)
		assertEquals("12:00", parsed?.startTime)
		assertEquals("12:45", parsed?.endTime)
	}

	@Test
	fun `the chain keeps the on-device parse and never calls the server`() = runBlocking {
		val seen = mutableListOf<Pair<String, Boolean>>()
		val chain = OnDeviceFirstExtractorChain(
			onDevice(ParsedEventDto(date = "2026-11-13", startTime = "19:00")),
			ServerEventExtractor(source(ApiResult.Ok(QuickParseResponse(parsed = ParsedEventDto(title = "Dinner"))), seen)),
		)
		assertEquals(ParsedEventDto(date = "2026-11-13", startTime = "19:00"), chain.parseSelected("Dinner Friday 7pm"))
		assertEquals(emptyList<Pair<String, Boolean>>(), seen)
	}

	@Test
	fun `a no-extraction phrase leaves the empty dto and the server supplies the parse`() = runBlocking {
		val seen = mutableListOf<Pair<String, Boolean>>()
		val extractor = OnDeviceEventExtractor { today }
		assertEquals(ParsedEventDto(), extractor.extract("Family dinner at the park"))

		val chain = OnDeviceFirstExtractorChain(
			extractor,
			ServerEventExtractor(
				source(
					ApiResult.Ok(QuickParseResponse(parsed = ParsedEventDto(title = "Family dinner", date = "2026-11-13"))),
					seen,
				),
			),
		)
		val parsed = chain.parseSelected("Family dinner at the park")
		assertEquals("Family dinner", parsed.title)
		assertEquals("2026-11-13", parsed.date)
		assertEquals(listOf("Family dinner at the park" to true), seen)
	}

	@Test
	fun `the server adapter answers the better parse`() = runBlocking {
		val parsed = ServerEventExtractor(
			source(
				ApiResult.Ok(
					QuickParseResponse(parsed = ParsedEventDto(title = "Dinner", date = "2026-11-13", startTime = "19:00")),
				),
			),
		).extract("Dinner Friday 7pm")
		assertEquals("Dinner", parsed.title)
		assertEquals("2026-11-13", parsed.date)
		assertEquals("19:00", parsed.startTime)
	}

	@Test
	fun `a rejected server parse answers the empty dto`() = runBlocking {
		val parsed = ServerEventExtractor(source(ApiResult.Err(ApiError.Network("offline")))).extract("Dinner Friday 7pm")
		assertEquals(ParsedEventDto(), parsed)
		assertNull(parsed.title)
	}
}
