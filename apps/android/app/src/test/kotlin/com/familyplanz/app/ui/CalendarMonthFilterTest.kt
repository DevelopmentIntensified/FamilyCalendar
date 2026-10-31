package com.familyplanz.app.ui

import com.familyplanz.app.domain.CalendarEvent
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.YearMonth

/**
 * Grid-window padding from the server pulls neighbour-month rows into a
 * month fetch (issue 082 monthGridWindow) — month views must bucket them
 * strictly. Day keys are the server bucket strings (ISO with time), not ids.
 */
class CalendarMonthFilterTest {
	private fun event(id: String, day: String, start: String) = CalendarEvent(
		id = id,
		title = id,
		startDate = start,
		endDate = null,
		allDay = false,
		location = null,
		occurrence = false,
		rsvpStatus = null,
		creatorName = null,
		day = day,
	)

	private val oct31 = "2026-10-31T16:00:00.000Z"
	private val nov3 = "2026-11-03T18:30:00.000Z"

	@Test
	fun `padded rows from other months are dropped`() {
		val mapped = listOf(
			event("in", oct31, oct31),
			event("next", nov3, nov3),
		)
		val sections = monthSections(mapped, YearMonth.of(2026, 10))
		assertEquals(listOf(oct31), sections.map { it.day })
		assertEquals("Family gym-like title kept", "in", sections[0].events[0].title)
	}

	@Test
	fun `day bucket keeps the ISO timestamp if the server sends one`() {
		val sections = monthSections(listOf(event("in", oct31, oct31)), YearMonth.of(2026, 10))
		assertEquals(oct31, sections[0].day)
		assertEquals(listOf("in"), sections[0].events.map { it.title })
	}

	@Test
	fun `friendly time converts UTC to the device zone`() {
		val text = friendlyTime("2026-10-31T16:00:00.000Z")
		// parsed path: real formatting (device-zone shifted), never the raw cut
		org.junit.Assert.assertNotNull(text)
		assertEquals(false, text!!.contains("T"))
	}
}
