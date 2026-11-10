package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.CreateEventRequest
import com.familyplanz.app.domain.CalendarEvent
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

/**
 * #301: the event form's payloads match what the server reads. `POST /api/events`
 * takes the whole form; `PUT /api/events/{id}` takes the server's field names,
 * explicit nulls to clear a reminder or a rule, and `scope:"this"` +
 * `occurrenceDate` for one occurrence of a series.
 */
class CalendarFormContractTest {
	private val utc = ZoneId.of("UTC")

	private fun event(
		frequency: String? = null,
		occurrenceDate: String? = null,
		masterId: String? = null,
		byDay: List<String>? = null,
		until: String? = null,
	) = CalendarEvent(
		id = "abc~2026-11-06T14:00:00.000Z",
		title = "Gym",
		startDate = "2026-11-06T14:00:00.000Z",
		endDate = "2026-11-06T15:00:00.000Z",
		allDay = false,
		location = null,
		occurrence = occurrenceDate != null,
		rsvpStatus = null,
		creatorName = null,
		day = "2026-11-06",
		masterId = masterId,
		occurrenceDate = occurrenceDate,
		recurrenceFrequency = frequency,
		recurrenceByDay = byDay,
		recurrenceUntil = until,
	)

	private fun json(request: CreateEventRequest): String =
		ApiFactory.json.encodeToString(CreateEventRequest.serializer(), request)

	@Test
	fun `create carries calendar, reminder and repeat`() {
		val form = CalendarForm(
			title = "Dinner",
			date = "2026-11-06",
			startTime = "09:00",
			endTime = "10:00",
			calendarId = "cal-2",
			repeat = RepeatOption.WEEKLY,
			repeatEvery = 2,
			reminderMinutes = 30,
			reminderSet = true,
		)
		val request = requireNotNull(form.createRequest(utc))
		assertEquals("cal-2", request.calendarId)
		assertEquals(30, request.reminderMinutes)
		assertEquals("weekly", request.recurrenceFrequency)
		assertEquals(2, request.recurrenceInterval)
		assertEquals("2026-11-06T09:00:00Z", request.start)
		assertEquals("2026-11-06T10:00:00Z", request.end)
		val body = json(request)
		assertTrue(body.contains("\"calendarId\":\"cal-2\""))
		assertTrue(body.contains("\"recurrenceFrequency\":\"weekly\""))
	}

	@Test
	fun `a plain event sends no recurrence, reminder or calendar keys`() {
		val request = requireNotNull(
			CalendarForm(title = "Dinner", date = "2026-11-06", startTime = "09:00", endTime = "10:00").createRequest(utc),
		)
		val body = json(request)
		assertFalse(body.contains("\"recurrence"))
		assertFalse(body.contains("\"reminderMinutes"))
		assertFalse(body.contains("\"calendarId"))
	}

	@Test
	fun `a timed event with no end time ends one hour later`() {
		val request = requireNotNull(
			CalendarForm(title = "Dinner", date = "2026-11-06", startTime = "23:30").createRequest(utc),
		)
		assertEquals("2026-11-06T23:30:00Z", request.start)
		assertEquals("2026-11-07T00:30:00Z", request.end)
	}

	@Test
	fun `title and date alone saves all-day`() {
		val request = requireNotNull(CalendarForm(title = "Dinner", date = "2026-11-06").createRequest(utc))
		assertEquals(true, request.allDay)
		assertNull(request.end)
		assertEquals("2026-11-06T00:00:00Z", request.start)
	}

	@Test
	fun `a multi-day event ends on its end date`() {
		val request = requireNotNull(
			CalendarForm(
				title = "Trip",
				date = "2026-11-06",
				multiDay = true,
				endDate = "2026-11-08",
				startTime = "09:00",
				endTime = "17:00",
			).createRequest(utc),
		)
		assertEquals("2026-11-06T09:00:00Z", request.start)
		assertEquals("2026-11-08T17:00:00Z", request.end)
	}

	@Test
	fun `an edit sends the server's keys`() {
		val body = requireNotNull(
			CalendarForm(
				title = "Dinner",
				date = "2026-11-06",
				startTime = "20:00",
				endTime = "21:00",
				editId = "e1",
			).updateBody(utc),
		)
		assertEquals("2026-11-06T20:00:00Z", body["start"]?.jsonPrimitive?.content)
		assertEquals("2026-11-06T21:00:00Z", body["end"]?.jsonPrimitive?.content)
		assertEquals("false", body["allDay"]?.jsonPrimitive?.content)
		assertFalse(body.containsKey("date"))
		assertFalse(body.containsKey("startTime"))
		assertFalse(body.containsKey("endTime"))
		assertFalse(body.containsKey("scope"))
	}

	@Test
	fun `clearing the reminder and the rule sends explicit nulls`() {
		val body = requireNotNull(CalendarForm(title = "Dinner", date = "2026-11-06", editId = "e1").updateBody(utc))
		assertTrue(body.containsKey("reminderMinutes"))
		assertTrue(body.containsKey("recurrenceFrequency"))
		assertEquals(JsonNull, body["reminderMinutes"])
		assertEquals(JsonNull, body["recurrenceFrequency"])
	}

	@Test
	fun `an occurrence edit targets that occurrence`() {
		val form = CalendarForm.fromEvent(event(frequency = "weekly", occurrenceDate = "2026-11-06T14:00:00.000Z"), utc, null)
		assertTrue(form.occurrenceEdit)
		assertEquals(SCOPE_THIS, form.scope)
		val body = requireNotNull(form.updateBody(utc))
		assertEquals("this", body["scope"]?.jsonPrimitive?.content)
		assertEquals("2026-11-06T14:00:00.000Z", body["occurrenceDate"]?.jsonPrimitive?.content)
	}

	@Test
	fun `a whole-series save with untouched times keeps the series start`() {
		val occurrence = CalendarForm.fromEvent(event(frequency = "weekly", occurrenceDate = "2026-11-06T14:00:00.000Z"), utc, null)
		val series = requireNotNull(occurrence.copy(scope = SCOPE_ALL, title = "Renamed").updateBody(utc))
		assertFalse(series.containsKey("start"))
		assertFalse(series.containsKey("end"))
		assertFalse(series.containsKey("allDay"))
		val moved = requireNotNull(occurrence.copy(scope = SCOPE_ALL, title = "Renamed", startTime = "15:00").updateBody(utc))
		assertTrue(moved.containsKey("start"))
	}

	@Test
	fun `the weekday list and the end of the rule ride along`() {
		val form = CalendarForm.fromEvent(
			event(frequency = "weekly", occurrenceDate = "2026-11-06T14:00:00.000Z", byDay = listOf("TU", "TH"), until = "2026-12-31T00:00:00.000Z"),
			utc,
			null,
		)
		val body = requireNotNull(form.updateBody(utc))
		assertEquals(listOf("TU", "TH"), body["recurrenceByDay"]?.jsonArray?.map { it.jsonPrimitive.content })
		assertEquals("2026-12-31T00:00:00.000Z", body["recurrenceUntil"]?.jsonPrimitive?.content)
		val daily = requireNotNull(form.copy(repeat = RepeatOption.DAILY).updateBody(utc))
		assertEquals(JsonNull, daily["recurrenceByDay"])
	}

	@Test
	fun `a one-off row carrying a master id and an occurrence date is not repeating`() {
		val row = event(frequency = null, occurrenceDate = "2026-11-06T14:00:00.000Z", masterId = "abc")
		assertFalse(row.isRecurring)
		assertFalse(CalendarForm.fromEvent(row, utc, null).occurrenceEdit)
	}

	@Test
	fun `garbage dates and times fail valid`() {
		val rejected = listOf(
			CalendarForm(title = "Dinner", date = "garbage"),
			CalendarForm(title = "Dinner", date = "2026-13-40"),
			CalendarForm(title = "Dinner", date = "2026-11-06", startTime = "25:99"),
			CalendarForm(title = "Dinner", date = "2026-11-06", startTime = "9:00"),
			CalendarForm(title = "Dinner", date = "2026-11-06", multiDay = true, endDate = "2026-11-01"),
		)
		rejected.forEach { assertFalse(it.toString(), it.valid) }
		assertTrue(CalendarForm(title = "Dinner", date = "2026-11-06", allDay = true, startTime = "garbage").valid)
	}

	@Test
	fun `every valid event form produces a request`() {
		val creates = listOf(
			CalendarForm(title = "Dinner", date = "2026-11-06"),
			CalendarForm(title = "Dinner", date = "2026-11-06", startTime = "19:00"),
			CalendarForm(title = "Dinner", date = "2026-11-06", startTime = "19:00", endTime = "20:00"),
			CalendarForm(title = "Dinner", date = "2026-11-06", multiDay = true, endDate = "2026-11-08"),
			CalendarForm(title = "Dinner", date = "2026-11-06", allDay = true, repeat = RepeatOption.DAILY, repeatEvery = 3),
		)
		creates.forEach {
			assertTrue(it.toString(), it.valid)
			assertNotNull(it.toString(), it.createRequest(utc))
		}
		val edits = creates.map { it.copy(editId = "e1") }
		edits.forEach {
			assertTrue(it.toString(), it.valid)
			assertNotNull(it.toString(), it.updateBody(utc))
		}
	}
}
