package com.familyplanz.app.domain

import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.EventDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EventDtoParsingTest {
	private val occurrence = """
		{"id":"abc~2026-11-08","title":"Family gym","start":"2026-11-08T14:00:00.000Z",
		"end":"2026-11-08T15:00:00.000Z","allDay":false,"location":"Local Y",
		"calendarId":"cal1","ownerId":"u1","recurrenceFrequency":"weekly","recurrenceInterval":1,
		"recurrenceByDay":["tu"],"reminderMinutes":30,"masterId":"abc",
		"occurrenceDate":"2026-11-08","date":"2026-11-08","rsvpStatus":"accepted",
		"creatorName":"Dad","brandNewField":"ignored"}
	""".trimIndent()

	private val single = """
		{"id":"one-off","title":"Dentist","start":"2026-11-09T09:00:00.000Z","end":""}
	""".trimIndent()

	@Test
	fun `parses recurring occurrence with composite id and per-day bucket`() {
		val event = EventMapper.fromDto(ApiFactory.json.decodeFromString<EventDto>(occurrence))
		assertEquals("abc~2026-11-08", event.id)
		assertTrue(event.occurrence)
		assertEquals("2026-11-08", event.day)
		assertEquals("Dad", event.creatorName)
		assertEquals("accepted", event.rsvpStatus)
		assertEquals("Local Y", event.location)
	}

	@Test
	fun `one-off event is not marked occurrence and falls back to start for day`() {
		val event = EventMapper.fromDto(ApiFactory.json.decodeFromString<EventDto>(single))
		assertFalse(event.occurrence)
		assertEquals("2026-11-09", event.day)
		assertNull(event.rsvpStatus)
		assertNull(event.creatorName)
		// end: "" decodes to empty string, never "1970-01-01" or a crash
		assertTrue(event.endDate?.isBlank() ?: true)
	}

	@Test
	fun `day view filter keeps only the selected bucket`() {
		val gym = EventMapper.fromDto(ApiFactory.json.decodeFromString<EventDto>(occurrence))
		val dentist = EventMapper.fromDto(ApiFactory.json.decodeFromString<EventDto>(single))
		val dayOnly = listOf(gym, dentist).filter { it.day == "2026-11-08" }
		assertEquals(1, dayOnly.size)
		assertEquals("Family gym", dayOnly[0].title)
	}
}
