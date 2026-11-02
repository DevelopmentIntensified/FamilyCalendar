package com.familyplanz.app.reminders

import com.familyplanz.app.data.EventDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId

/** OS alarm edge (AlarmManager in prod, a recorder in tests). Same id → replaces. */
interface AlarmScheduler {
	fun schedule(reminder: PlannedReminder)

	fun cancel(occurrenceId: String)
}

/** The scheduled set survives process death so later cancels still find their alarms. */
interface ScheduledReminderStore {
	suspend fun load(): List<PlannedReminder>

	suspend fun save(reminders: List<PlannedReminder>)
}

class FileScheduledReminderStore(private val filesDir: File) : ScheduledReminderStore {
	private val file get() = File(filesDir, "scheduled-reminders.json")

	override suspend fun load(): List<PlannedReminder> = withContext(Dispatchers.IO) {
		val text = file.takeIf { it.exists() }?.readText() ?: return@withContext emptyList()
		runCatching { JSON.decodeFromString<List<PlannedReminder>>(text) }.getOrDefault(emptyList())
	}

	override suspend fun save(reminders: List<PlannedReminder>) = withContext(Dispatchers.IO) {
		file.writeText(JSON.encodeToString(reminders))
	}

	private companion object {
		val JSON = Json { ignoreUnknownKeys = true }
	}
}

/**
 * Cache → alarms (issue #271). Reads the cached months covering the 14-day
 * horizon, plans against the persisted set, applies cancels then schedules,
 * and stores the new set. Never touches the network: callers refresh first.
 */
class ReminderSync(
	private val cachedEvents: suspend (YearMonth) -> List<EventDto>?,
	private val store: ScheduledReminderStore,
	private val scheduler: AlarmScheduler,
	private val clock: () -> Instant = Instant::now,
	private val zone: () -> ZoneId = ZoneId::systemDefault,
) {
	suspend fun rescheduleFromCache(force: Boolean = false): ReminderPlan {
		val now = clock()
		val zoneId = zone()
		val months = ReminderPlanner.monthsToCover(now.atZone(zoneId).toLocalDate())
		val events = months.flatMap { cachedEvents(it).orEmpty() }
		val plan = ReminderPlanner.plan(events, now, zoneId, store.load(), force)
		plan.toCancel.forEach(scheduler::cancel)
		plan.toSchedule.forEach(scheduler::schedule)
		store.save(plan.next)
		return plan
	}
}
