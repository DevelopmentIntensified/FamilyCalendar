package com.familyplanz.app.reminders

import com.familyplanz.app.data.EventDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

/** Issue #271: pure reminder planning (events + now + scheduled -> schedule/cancel). */
class ReminderPlannerTest {
	private val zone = ZoneId.of("America/Chicago")
	private val now = Instant.parse("2026-11-02T15:00:00Z")

	private fun event(
		id: String,
		start: String,
		reminder: Int? = 15,
		allDay: Boolean = false,
		title: String = "Dentist",
		mirrorOf: String? = null,
		rsvp: String? = null,
	) = EventDto(
		id = id,
		title = title,
		start = start,
		allDay = allDay,
		reminderMinutes = reminder,
		mirrorOf = mirrorOf,
		rsvpStatus = rsvp,
	)

	private fun desired(vararg events: EventDto) = ReminderPlanner.desired(events.toList(), now, zone)

	private fun millis(iso: String) = Instant.parse(iso).toEpochMilli()

	@Test
	fun `timed event fires reminderMinutes before start`() {
		val r = desired(event("e1", "2026-11-03T14:00:00.000Z", reminder = 30)).single()
		assertEquals("e1", r.occurrenceId)
		assertEquals("Dentist", r.title)
		assertEquals(millis("2026-11-03T13:30:00Z"), r.fireAtMillis)
		assertEquals(millis("2026-11-03T14:00:00Z"), r.startMillis)
		assertEquals("2026-11-03", r.day)
	}

	@Test
	fun `day is the device-zone date of the start`() {
		// 03:00Z on the 4th is still the 3rd in Chicago.
		val r = desired(event("e1", "2026-11-04T03:00:00.000Z")).single()
		assertEquals("2026-11-03", r.day)
	}

	@Test
	fun `null reminderMinutes means no reminder`() {
		assertTrue(desired(event("e1", "2026-11-03T14:00:00.000Z", reminder = null)).isEmpty())
	}

	@Test
	fun `zero reminderMinutes fires at start`() {
		val r = desired(event("e1", "2026-11-03T14:00:00.000Z", reminder = 0)).single()
		assertEquals(millis("2026-11-03T14:00:00Z"), r.fireAtMillis)
	}

	@Test
	fun `negative reminderMinutes is ignored`() {
		assertTrue(desired(event("e1", "2026-11-03T14:00:00.000Z", reminder = -5)).isEmpty())
	}

	@Test
	fun `fire time in the past is dropped even if the event is still ahead`() {
		// starts 15:10Z, 30 min reminder -> 14:40Z < now 15:00Z
		assertTrue(desired(event("e1", "2026-11-02T15:10:00.000Z", reminder = 30)).isEmpty())
	}

	@Test
	fun `fire time within the one-minute grace still schedules`() {
		val r = desired(event("e1", "2026-11-02T15:14:30.000Z", reminder = 15)).single()
		assertEquals(millis("2026-11-02T14:59:30Z"), r.fireAtMillis)
	}

	@Test
	fun `fire time beyond the 14-day horizon is skipped`() {
		assertTrue(desired(event("e1", "2026-11-17T16:00:00.000Z", reminder = 0)).isEmpty())
		assertEquals(1, desired(event("e2", "2026-11-16T14:00:00.000Z", reminder = 0)).size)
	}

	@Test
	fun `all-day event fires at device start-of-day minus reminder`() {
		val r = desired(event("a1", "2026-11-05", reminder = 60, allDay = true)).single()
		// local midnight Chicago (CST, UTC-6 after Nov 1) minus 60 min
		assertEquals(millis("2026-11-05T05:00:00Z"), r.fireAtMillis)
		assertEquals(millis("2026-11-05T06:00:00Z"), r.startMillis)
		assertEquals("2026-11-05", r.day)
		assertTrue(r.allDay)
	}

	@Test
	fun `all-day event with an ISO start uses its date part`() {
		val r = desired(event("a1", "2026-11-05T00:00:00.000Z", reminder = 0, allDay = true)).single()
		assertEquals(millis("2026-11-05T06:00:00Z"), r.fireAtMillis)
	}

	@Test
	fun `recurring occurrences each get their own reminder`() {
		val out = desired(
			event("abc~2026-11-03", "2026-11-03T14:00:00.000Z"),
			event("abc~2026-11-10", "2026-11-10T14:00:00.000Z"),
		)
		assertEquals(listOf("abc~2026-11-03", "abc~2026-11-10"), out.map { it.occurrenceId })
	}

	@Test
	fun `multi-day split entries dedupe to one reminder`() {
		val out = desired(
			event("m1", "2026-11-03T14:00:00.000Z"),
			event("m1", "2026-11-03T14:00:00.000Z"),
		)
		assertEquals(1, out.size)
	}

	@Test
	fun `mirror of an event already present is dropped`() {
		val out = desired(
			event("orig", "2026-11-03T14:00:00.000Z"),
			event("copy", "2026-11-03T14:00:00.000Z", mirrorOf = "orig"),
		)
		assertEquals(listOf("orig"), out.map { it.occurrenceId })
	}

	@Test
	fun `mirror whose original is absent still reminds`() {
		val out = desired(event("copy", "2026-11-03T14:00:00.000Z", mirrorOf = "elsewhere"))
		assertEquals(listOf("copy"), out.map { it.occurrenceId })
	}

	@Test
	fun `declined events do not remind`() {
		assertTrue(desired(event("e1", "2026-11-03T14:00:00.000Z", rsvp = "declined")).isEmpty())
	}

	@Test
	fun `unparseable start is skipped`() {
		assertTrue(desired(event("e1", "soon")).isEmpty())
	}

	@Test
	fun `output is sorted by fire time`() {
		val out = desired(
			event("late", "2026-11-09T14:00:00.000Z"),
			event("early", "2026-11-03T14:00:00.000Z"),
		)
		assertEquals(listOf("early", "late"), out.map { it.occurrenceId })
	}

	@Test
	fun `plan schedules new reminders when nothing is scheduled`() {
		val plan = ReminderPlanner.plan(listOf(event("e1", "2026-11-03T14:00:00.000Z")), now, zone, emptyList())
		assertEquals(listOf("e1"), plan.toSchedule.map { it.occurrenceId })
		assertTrue(plan.toCancel.isEmpty())
		assertEquals(plan.toSchedule, plan.next)
	}

	@Test
	fun `plan leaves unchanged reminders alone`() {
		val events = listOf(event("e1", "2026-11-03T14:00:00.000Z"))
		val scheduled = ReminderPlanner.desired(events, now, zone)
		val plan = ReminderPlanner.plan(events, now, zone, scheduled)
		assertTrue(plan.toSchedule.isEmpty())
		assertTrue(plan.toCancel.isEmpty())
		assertEquals(scheduled, plan.next)
	}

	@Test
	fun `changed start time reschedules without a separate cancel`() {
		val scheduled = desired(event("e1", "2026-11-03T14:00:00.000Z"))
		val plan = ReminderPlanner.plan(listOf(event("e1", "2026-11-03T16:00:00.000Z")), now, zone, scheduled)
		assertEquals(listOf(millis("2026-11-03T15:45:00Z")), plan.toSchedule.map { it.fireAtMillis })
		assertTrue(plan.toCancel.isEmpty())
	}

	@Test
	fun `changed title reschedules so the notification text is fresh`() {
		val scheduled = desired(event("e1", "2026-11-03T14:00:00.000Z", title = "Dentist"))
		val changed = listOf(event("e1", "2026-11-03T14:00:00.000Z", title = "Orthodontist"))
		val plan = ReminderPlanner.plan(changed, now, zone, scheduled)
		assertEquals(listOf("Orthodontist"), plan.toSchedule.map { it.title })
	}

	@Test
	fun `removed event is cancelled`() {
		val scheduled = desired(event("gone", "2026-11-03T14:00:00.000Z"))
		val plan = ReminderPlanner.plan(emptyList(), now, zone, scheduled)
		assertEquals(listOf("gone"), plan.toCancel)
		assertTrue(plan.next.isEmpty())
	}

	@Test
	fun `reminder turned off is cancelled`() {
		val scheduled = desired(event("e1", "2026-11-03T14:00:00.000Z"))
		val off = listOf(event("e1", "2026-11-03T14:00:00.000Z", reminder = null))
		val plan = ReminderPlanner.plan(off, now, zone, scheduled)
		assertEquals(listOf("e1"), plan.toCancel)
	}

	@Test
	fun `force reschedules everything desired`() {
		val events = listOf(event("e1", "2026-11-03T14:00:00.000Z"))
		val scheduled = ReminderPlanner.desired(events, now, zone)
		val plan = ReminderPlanner.plan(events, now, zone, scheduled, force = true)
		assertEquals(listOf("e1"), plan.toSchedule.map { it.occurrenceId })
	}

	@Test
	fun `months cover only the current month mid-month`() {
		assertEquals(listOf(YearMonth.of(2026, 11)), ReminderPlanner.monthsToCover(LocalDate.of(2026, 11, 2)))
	}

	@Test
	fun `months cover next month when the horizon crosses a boundary`() {
		assertEquals(
			listOf(YearMonth.of(2026, 12), YearMonth.of(2027, 1)),
			ReminderPlanner.monthsToCover(LocalDate.of(2026, 12, 20)),
		)
	}
}
