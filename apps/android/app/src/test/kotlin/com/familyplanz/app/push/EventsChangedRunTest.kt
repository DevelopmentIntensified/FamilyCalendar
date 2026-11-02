package com.familyplanz.app.push

import com.familyplanz.app.data.EventDto
import com.familyplanz.app.data.TaskCache
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.sync.RefreshOutcome
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.util.Locale

/** Issue #281: the editor's own phone refreshes silently; everyone else still gets "Event updates". */
class EventsChangedRunTest {
	private val zone = ZoneId.of("America/New_York")
	private val now = Instant.parse("2026-11-03T14:00:00Z")
	private val today = LocalDate.of(2026, 11, 3)
	private val november = YearMonth.of(2026, 11)
	private val dentist = EventDto(id = "d", title = "Dentist", start = "2026-11-03T18:00:00Z", end = "2026-11-03T19:00:00Z")

	private val cache = MemoryCache().apply { months[november] = listOf(dentist) }
	private var refreshes = 0
	private var meId: String? = ME
	private val posted = mutableListOf<EventUpdateNotice>()

	private val run = EventsChangedRun(
		cache = cache,
		refresh = {
			refreshes++
			cache.months[november] = listOf(dentist.copy(start = "2026-11-03T20:00:00Z"))
			RefreshOutcome.REFRESHED
		},
		meId = { meId },
		post = { posted += it },
		clock = EventsChangedRun.Clock({ now }, zone, Locale.US),
	)

	@Test
	fun `own edit refreshes and re-plans but posts nothing`() = runBlocking {
		assertEquals(RefreshOutcome.REFRESHED, run.run(actorId = ME, today = today))
		assertEquals(1, refreshes)
		assertTrue(posted.isEmpty())
	}

	@Test
	fun `another member's edit posts the update`() = runBlocking {
		run.run(actorId = "spouse", today = today)
		assertEquals(listOf("Dentist moved to 3:00 PM · today"), posted.single().lines)
	}

	@Test
	fun `missing actorId (older server) or unknown me keeps announcing`() = runBlocking {
		run.run(actorId = null, today = today)
		meId = null
		cache.months[november] = listOf(dentist)
		run.run(actorId = ME, today = today)
		assertEquals(2, posted.size)
		assertEquals(2, refreshes)
	}

	@Test
	fun `own-edit rule table`() {
		assertTrue(EventsChangedRun.isOwnEdit("me", "me"))
		listOf("me" to "other", null to "me", "me" to null, null to null, "" to "").forEach { (actor, me) ->
			assertEquals("$actor/$me", false, EventsChangedRun.isOwnEdit(actor, me))
		}
	}

	private class MemoryCache : TaskCache {
		val months = mutableMapOf<YearMonth, List<EventDto>>()

		override suspend fun saveTasks(tasks: List<TaskDto>) = Unit

		override suspend fun loadTasks(): List<TaskDto>? = null

		override suspend fun saveEvents(year: Int, month: Int, events: List<EventDto>) {
			months[YearMonth.of(year, month)] = events
		}

		override suspend fun loadEvents(year: Int, month: Int): List<EventDto>? = months[YearMonth.of(year, month)]
	}

	private companion object {
		const val ME = "me-1"
	}
}
