package com.familyplanz.app.push

import com.familyplanz.app.data.EventDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/**
 * Issue #273 extra: cached-events diff → "Event updates" notification.
 * Now = Tue 2026-11-03 09:00 New York; the window runs to Wed 09:00.
 */
class EventUpdatePlannerTest {
	private val zone = ZoneId.of("America/New_York")
	private val now = Instant.parse("2026-11-03T14:00:00Z")

	private fun ev(id: String, title: String, start: String, end: String? = null, location: String? = null) =
		EventDto(id = id, title = title, start = start, end = end, allDay = start.length == 10, location = location)

	private fun lines(old: List<EventDto>, new: List<EventDto>) =
		EventUpdatePlanner.changes(old, new, now, zone, Locale.US).map { it.line }

	private val dentist = ev("d", "Dentist", "2026-11-03T18:00:00Z", "2026-11-03T19:00:00Z")

	@Test
	fun `table of single changes inside the window`() {
		val cases = listOf(
			Triple(listOf(dentist), listOf(dentist.copy(start = "2026-11-03T20:00:00Z")), "Dentist moved to 3:00 PM · today"),
			Triple(listOf(dentist), listOf(dentist.copy(start = "2026-11-10T20:00:00Z")), "Dentist moved to 3:00 PM · Tue"),
			Triple(
				emptyList(),
				listOf(ev("s", "Soccer practice", "2026-11-03T22:00:00Z")),
				"New: Soccer practice · 5:00 PM today",
			),
			Triple(
				emptyList(),
				listOf(ev("s", "Soccer practice", "2026-11-04T12:30:00Z")),
				"New: Soccer practice · 7:30 AM Wed",
			),
			Triple(listOf(ev("p", "Piano lesson", "2026-11-03T21:00:00Z")), emptyList(), "Cancelled: Piano lesson"),
			Triple(
				listOf(ev("n", "Dinner", "2026-11-03T23:00:00Z", location = "Home")),
				listOf(ev("n", "Dinner", "2026-11-03T23:00:00Z", location = "Grandma's")),
				"Updated: Dinner · location changed",
			),
			Triple(
				listOf(ev("n", "Dinner", "2026-11-03T23:00:00Z")),
				listOf(ev("n", "Family dinner", "2026-11-03T23:00:00Z")),
				"Updated: Family dinner · title changed",
			),
			Triple(listOf(dentist), listOf(dentist.copy(end = "2026-11-03T19:30:00Z")), "Updated: Dentist · end time changed"),
			Triple(
				listOf(dentist),
				listOf(dentist.copy(title = "Dentist (Sam)", location = "Main St")),
				"Updated: Dentist (Sam) · title and location changed",
			),
			Triple(emptyList(), listOf(ev("f", "Field trip", "2026-11-03")), "New: Field trip · all day today"),
			Triple(
				listOf(ev("f", "Field trip", "2026-11-03")),
				listOf(ev("f", "Field trip", "2026-11-05")),
				"Field trip moved to all day · Thu",
			),
		)
		cases.forEach { (old, new, expected) -> assertEquals(expected, listOf(expected), lines(old, new)) }
	}

	@Test
	fun `nothing changed, or changes only outside the 24h window, means no lines`() {
		assertEquals(emptyList<String>(), lines(listOf(dentist), listOf(dentist)))
		val nextWeek = ev("w", "Swim", "2026-11-10T20:00:00Z")
		assertEquals(emptyList<String>(), lines(emptyList(), listOf(nextWeek)))
		assertEquals(emptyList<String>(), lines(listOf(nextWeek), emptyList()))
		assertEquals(emptyList<String>(), lines(listOf(nextWeek), listOf(nextWeek.copy(start = "2026-11-11T20:00:00Z"))))
		val yesterday = ev("y", "Gone", "2026-11-02T14:00:00Z", "2026-11-02T15:00:00Z")
		assertEquals(emptyList<String>(), lines(listOf(yesterday), emptyList()))
	}

	@Test
	fun `an event already running overlaps the window and an event moved into it counts`() {
		val running = ev("r", "Practice", "2026-11-03T13:00:00Z", "2026-11-03T15:00:00Z")
		assertEquals(listOf("Updated: Practice · location changed"), lines(listOf(running), listOf(running.copy(location = "Gym"))))
		val later = ev("l", "Swim", "2026-11-10T20:00:00Z")
		assertEquals(listOf("Swim moved to 4:00 PM · today"), lines(listOf(later), listOf(later.copy(start = "2026-11-03T21:00:00Z"))))
	}

	@Test
	fun `split rows and mirrors of the same event never double up`() {
		val split = listOf(ev("m", "Camp", "2026-11-03T15:00:00Z", "2026-11-05T15:00:00Z").copy(date = "2026-11-03"))
		val splitNew = split + split.first().copy(date = "2026-11-04")
		assertEquals(emptyList<String>(), lines(split, splitNew))
		val mirror = ev("x", "Soccer practice", "2026-11-03T22:00:00Z").copy(mirrorOf = "s")
		assertEquals(1, lines(emptyList(), listOf(ev("s", "Soccer practice", "2026-11-03T22:00:00Z"), mirror)).size)
	}

	@Test
	fun `no snapshot (first cache fill) is no notice`() {
		assertNull(EventUpdatePlanner.notice(null, listOf(dentist), now, zone, Locale.US))
		assertNull(EventUpdatePlanner.notice(listOf(dentist), listOf(dentist), now, zone, Locale.US))
	}

	@Test
	fun `one change is one line, opening that day`() {
		val notice = EventUpdatePlanner.notice(emptyList(), listOf(ev("s", "Soccer practice", "2026-11-04T12:30:00Z")), now, zone, Locale.US)
		val line = "New: Soccer practice · 7:30 AM Wed"
		assertEquals(EventUpdateNotice("Event update", line, listOf(line), "2026-11-04"), notice)
	}

	@Test
	fun `several changes collapse into one summary, earliest first, opening the earliest day`() {
		val old = listOf(dentist, ev("p", "Piano lesson", "2026-11-04T01:00:00Z"))
		val new = listOf(dentist.copy(start = "2026-11-03T20:00:00Z"), ev("s", "Soccer practice", "2026-11-03T16:00:00Z"))
		val notice = EventUpdatePlanner.notice(old, new, now, zone, Locale.US)!!
		assertEquals("3 event updates", notice.title)
		assertEquals(
			listOf("New: Soccer practice · 11:00 AM today", "Dentist moved to 3:00 PM · today", "Cancelled: Piano lesson"),
			notice.lines,
		)
		assertEquals("New: Soccer practice · 11:00 AM today and 2 more", notice.text)
		assertEquals("2026-11-03", notice.day)
	}
}
