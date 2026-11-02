package com.familyplanz.app.reminders

import com.familyplanz.app.data.EventDto
import kotlinx.serialization.Serializable
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

/**
 * One alarm the phone owns (issue #271). Persisted as the "scheduled set",
 * so equality doubles as the change check: any field differing means the
 * alarm is re-set (same occurrence id → the PendingIntent is replaced).
 */
@Serializable
data class PlannedReminder(
	/** Server id; recurring occurrences carry the composite `{masterId}~{occ}`. */
	val occurrenceId: String,
	val title: String,
	val fireAtMillis: Long,
	val startMillis: Long,
	val allDay: Boolean,
	/** YYYY-MM-DD in the device zone; the notification tap opens this day. */
	val day: String,
)

data class ReminderPlan(
	val toSchedule: List<PlannedReminder>,
	/** Occurrence ids whose alarm must go (event removed / reminder off / out of window). */
	val toCancel: List<String>,
	/** The scheduled set after applying this plan (persist it). */
	val next: List<PlannedReminder>,
)

/**
 * Pure planner. Rules (documented in docs/issues/271):
 * - `reminderMinutes` null or negative → no reminder; 0 → at start.
 * - Timed: fire = start − reminder. All-day: fire = local start-of-day (device
 *   zone) − reminder, so "1 day before" on an all-day event fires at midnight
 *   of the previous day, like the zone-less all-day semantics of the web.
 * - Window: fire ≥ now − 1 min grace and ≤ now + 14 days. Late fire times are
 *   dropped (no burst of stale alerts after a long offline spell).
 * - Dedupe by occurrence id (multi-day split entries); a mirror whose
 *   original is in the same set is dropped; declined RSVPs never remind.
 */
object ReminderPlanner {
	val HORIZON: Duration = Duration.ofDays(14)
	private val GRACE: Duration = Duration.ofMinutes(1)
	private const val DECLINED = "declined"

	fun desired(events: List<EventDto>, now: Instant, zone: ZoneId): List<PlannedReminder> {
		val ids = events.mapTo(HashSet()) { it.id }
		val earliest = now.minus(GRACE).toEpochMilli()
		val latest = now.plus(HORIZON).toEpochMilli()
		return events
			.asSequence()
			.filterNot { it.mirrorOf != null && it.mirrorOf in ids }
			.filterNot { it.rsvpStatus == DECLINED }
			.mapNotNull { toReminder(it, zone) }
			.filter { it.fireAtMillis in earliest..latest }
			.sortedBy { it.fireAtMillis }
			.distinctBy { it.occurrenceId }
			.toList()
	}

	/** `force` re-sets every desired alarm (after boot / clock change the OS dropped or shifted them). */
	fun plan(
		events: List<EventDto>,
		now: Instant,
		zone: ZoneId,
		scheduled: List<PlannedReminder>,
		force: Boolean = false,
	): ReminderPlan {
		val next = desired(events, now, zone)
		val nextIds = next.mapTo(HashSet()) { it.occurrenceId }
		val already = scheduled.toSet()
		return ReminderPlan(
			toSchedule = if (force) next else next.filterNot { it in already },
			toCancel = scheduled.map { it.occurrenceId }.distinct().filterNot { it in nextIds },
			next = next,
		)
	}

	/** Months whose cached events can hold a reminder inside the horizon (today … today+14d). */
	fun monthsToCover(today: LocalDate): List<YearMonth> =
		listOf(YearMonth.from(today), YearMonth.from(today.plusDays(HORIZON.toDays()))).distinct()

	private fun toReminder(dto: EventDto, zone: ZoneId): PlannedReminder? {
		val minutes = dto.reminderMinutes?.takeIf { it >= 0 } ?: return null
		return startOf(dto, zone)?.let { start ->
			PlannedReminder(
				occurrenceId = dto.id,
				title = dto.title,
				fireAtMillis = start.minus(Duration.ofMinutes(minutes.toLong())).toEpochMilli(),
				startMillis = start.toEpochMilli(),
				allDay = dto.allDay,
				day = start.atZone(zone).toLocalDate().toString(),
			)
		}
	}

	private fun startOf(dto: EventDto, zone: ZoneId): Instant? = runCatching {
		if (dto.allDay) {
			LocalDate.parse(dto.start.take(DATE_LENGTH)).atStartOfDay(zone).toInstant()
		} else {
			Instant.parse(dto.start)
		}
	}.getOrNull()

	private const val DATE_LENGTH = 10
}
