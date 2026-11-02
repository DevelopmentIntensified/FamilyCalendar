package com.familyplanz.app.reminders

import com.familyplanz.app.data.EventDto
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId

/** Issue #271: cache → planner → alarm edge, with fakes at the OS seam. */
class ReminderSyncTest {
	@get:Rule val tmp = TemporaryFolder()

	private class RecordingScheduler : AlarmScheduler {
		val calls = mutableListOf<String>()

		override fun schedule(reminder: PlannedReminder) {
			calls += "schedule:${reminder.occurrenceId}"
		}

		override fun cancel(occurrenceId: String) {
			calls += "cancel:$occurrenceId"
		}
	}

	private val zone = ZoneId.of("UTC")
	private val cache = mutableMapOf<YearMonth, List<EventDto>>()
	private val reads = mutableListOf<YearMonth>()

	private fun ev(id: String, start: String) = EventDto(id = id, title = id, start = start, reminderMinutes = 10)

	private fun sync(scheduler: AlarmScheduler, now: String) = ReminderSync(
		cachedEvents = { reads += it; cache[it] },
		store = FileScheduledReminderStore(tmp.root),
		scheduler = scheduler,
		clock = { Instant.parse(now) },
		zone = { zone },
	)

	@Test
	fun `schedules from both cached months when the horizon crosses a boundary`() = runBlocking {
		cache[YearMonth.of(2026, 11)] = listOf(ev("nov", "2026-11-25T10:00:00Z"))
		cache[YearMonth.of(2026, 12)] = listOf(ev("dec", "2026-12-03T10:00:00Z"))
		val scheduler = RecordingScheduler()
		sync(scheduler, "2026-11-20T08:00:00Z").rescheduleFromCache()
		assertEquals(listOf(YearMonth.of(2026, 11), YearMonth.of(2026, 12)), reads)
		assertEquals(listOf("schedule:nov", "schedule:dec"), scheduler.calls)
	}

	@Test
	fun `missing cache month is treated as empty`() = runBlocking {
		val scheduler = RecordingScheduler()
		val plan = sync(scheduler, "2026-11-20T08:00:00Z").rescheduleFromCache()
		assertTrue(plan.next.isEmpty())
		assertTrue(scheduler.calls.isEmpty())
	}

	@Test
	fun `second run is a no-op when nothing changed`() = runBlocking {
		cache[YearMonth.of(2026, 11)] = listOf(ev("a", "2026-11-05T10:00:00Z"))
		sync(RecordingScheduler(), "2026-11-02T08:00:00Z").rescheduleFromCache()
		val second = RecordingScheduler()
		sync(second, "2026-11-02T09:00:00Z").rescheduleFromCache()
		assertTrue(second.calls.isEmpty())
	}

	@Test
	fun `removed event is cancelled by a fresh instance (process death)`() = runBlocking {
		cache[YearMonth.of(2026, 11)] = listOf(ev("a", "2026-11-05T10:00:00Z"), ev("b", "2026-11-06T10:00:00Z"))
		sync(RecordingScheduler(), "2026-11-02T08:00:00Z").rescheduleFromCache()
		cache[YearMonth.of(2026, 11)] = listOf(ev("b", "2026-11-06T10:00:00Z"))
		val after = RecordingScheduler()
		sync(after, "2026-11-02T09:00:00Z").rescheduleFromCache()
		assertEquals(listOf("cancel:a"), after.calls)
	}

	@Test
	fun `force re-sets every alarm (boot)`() = runBlocking {
		cache[YearMonth.of(2026, 11)] = listOf(ev("a", "2026-11-05T10:00:00Z"))
		sync(RecordingScheduler(), "2026-11-02T08:00:00Z").rescheduleFromCache()
		val boot = RecordingScheduler()
		sync(boot, "2026-11-02T09:00:00Z").rescheduleFromCache(force = true)
		assertEquals(listOf("schedule:a"), boot.calls)
	}

	@Test
	fun `corrupt store file reads as nothing scheduled`() = runBlocking {
		tmp.newFile("scheduled-reminders.json").writeText("{not json")
		assertTrue(FileScheduledReminderStore(tmp.root).load().isEmpty())
	}
}
