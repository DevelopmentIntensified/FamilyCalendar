package com.familyplanz.app.domain

import com.familyplanz.app.data.ParsedEventDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

class EventDraftConversionTest {
	private val utc = ZoneId.of("UTC")
	private val newyork = ZoneId.of("America/New_York")

	private fun parsed(
		title: String? = "Dinner",
		date: String? = "2026-11-06",
		startTime: String? = "19:00",
		endTime: String? = null,
		allDay: Boolean? = null,
	) = ParsedEventDto(
		title = title, date = date, startTime = startTime, endTime = endTime,
		location = "The park", allDay = allDay, attendants = listOf("Ana"),
	)

	@Test
	fun `draft from parse flags missing title`() {
		val draft = EventDraftMapper.fromParsed(parsed(title = null))
		assertTrue(draft!!.needsTitle)
		assertEquals("The park", draft.location)
		assertEquals(listOf("Ana"), draft.attendants)
	}

	@Test
	fun `date and time compose with the device zone offset`() {
		val request = EventDraftMapper.toCreateRequest(
			EventDraftMapper.fromParsed(parsed())!!, zone = utc,
		)
		assertEquals("2026-11-06T19:00:00Z", request!!.start)
		assertNull(request.end)
		assertEquals(false, request.allDay)
	}

	@Test
	fun `end time lands on the same day with the same offset`() {
		val request = EventDraftMapper.toCreateRequest(
			EventDraftMapper.fromParsed(parsed(endTime = "21:00"))!!, zone = newyork,
		)
		// DST ended Nov 1 2026 in the US, so Nov 6 is EST.
		assertEquals("2026-11-06T19:00:00-05:00", request!!.start)
		assertEquals("2026-11-06T21:00:00-05:00", request.end)
	}

	@Test
	fun `all day keeps midnight start and drops rows`() {
		val request = EventDraftMapper.toCreateRequest(
			EventDraftMapper.fromParsed(parsed(allDay = true, startTime = null))!!, zone = utc,
		)
		assertEquals("2026-11-06T00:00:00Z", request!!.start)
		assertNull(request.end)
		assertEquals(true, request.allDay)
	}

	@Test
	fun `missing date blocks creation`() {
		val draft = EventDraftMapper.fromParsed(parsed(date = null))!!
		assertNull(EventDraftMapper.toCreateRequest(draft, zone = utc))
	}

	@Test
	fun `blank title becomes the server-required default`() {
		val request = EventDraftMapper.toCreateRequest(
			EventDraftMapper.fromParsed(parsed(title = "")) as EventDraft,
			zone = utc,
		)
		assertEquals("Event", request!!.title)
	}
}
