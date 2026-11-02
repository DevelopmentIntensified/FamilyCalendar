package com.familyplanz.app.push

import com.familyplanz.app.data.TaskCache
import com.familyplanz.app.reminders.ReminderPlanner
import com.familyplanz.app.sync.RefreshOutcome
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale

/**
 * One `events_changed` run minus Android (#273, #281): snapshot the
 * reminder-horizon months, [refresh] (network → cache + reminder re-plan),
 * then post the 'Event updates' diff — unless the push came from this user's
 * own edit. Only months that had a snapshot are compared.
 */
class EventsChangedRun(
	private val cache: TaskCache,
	private val refresh: suspend () -> RefreshOutcome,
	private val meId: suspend () -> String?,
	private val post: (EventUpdateNotice) -> Unit,
	private val clock: Clock = Clock(Instant::now, ZoneId.systemDefault(), Locale.getDefault()),
) {
	class Clock(val now: () -> Instant, val zone: ZoneId, val locale: Locale)

	suspend fun run(actorId: String?, today: LocalDate): RefreshOutcome {
		val months = ReminderPlanner.monthsToCover(today)
		val before = months.associateWith { cache.loadEvents(it.year, it.monthValue) }
		val outcome = refresh()
		val snapshotted = months.filter { before[it] != null }
		if (outcome == RefreshOutcome.REFRESHED && snapshotted.isNotEmpty() && !isOwnEdit(actorId, meId())) {
			val old = snapshotted.flatMap { before[it].orEmpty() }
			val new = snapshotted.flatMap { cache.loadEvents(it.year, it.monthValue).orEmpty() }
			EventUpdatePlanner.notice(old, new, clock.now(), clock.zone, clock.locale)?.let(post)
		}
		return outcome
	}

	companion object {
		/** Unknown on either side (older server, `GET /api/me` not answered yet) → announce as before. */
		fun isOwnEdit(actorId: String?, meId: String?): Boolean =
			!actorId.isNullOrBlank() && actorId == meId
	}
}
