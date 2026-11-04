package com.familyplanz.app.ui.calendar

import com.familyplanz.app.data.AccountSource
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.CalendarDto
import com.familyplanz.app.data.CalendarSettingsDto
import com.familyplanz.app.data.CalendarSource
import com.familyplanz.app.data.EventDto
import com.familyplanz.app.data.EventSource
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.domain.EventMapper
import com.familyplanz.app.ui.calendar.chips.chipColor
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

/** The page-load legs that are not months: who, settings, calendars, roster. */
data class CalendarBoot(
	val meId: String?,
	val settings: CalendarSettingsDto,
	val calendars: List<CalendarDto>,
	val roster: List<com.familyplanz.app.data.RosterMemberDto>,
	val unauthorized: Boolean,
)

/** One month's rows, or why not. `failed` with rows = served from the offline cache. */
data class MonthLoad(val events: List<CalendarEvent>?, val unauthorized: Boolean = false, val errorText: String? = null)

/**
 * The fetches behind [CalendarViewModel], mapped to domain rows: calendar
 * colours stamped on each event (G2), sponsored rows (G6) merged into the
 * month, the offline cache as the month's fallback.
 */
class CalendarLoader(
	private val events: EventSource,
	private val calendar: CalendarSource,
	private val account: AccountSource,
) {
	suspend fun boot(): CalendarBoot = coroutineScope {
		val me = async { account.me() }
		val settings = async { calendar.settings() }
		val calendars = async { calendar.calendars() }
		val roster = async { calendar.roster() }
		val results = listOf(me.await(), settings.await(), calendars.await(), roster.await())
		CalendarBoot(
			meId = (me.await() as? ApiResult.Ok)?.value?.id,
			settings = (settings.await() as? ApiResult.Ok)?.value ?: CalendarSettingsDto(),
			calendars = (calendars.await() as? ApiResult.Ok)?.value.orEmpty(),
			roster = (roster.await() as? ApiResult.Ok)?.value.orEmpty(),
			unauthorized = results.any { (it as? ApiResult.Err)?.error == ApiError.Unauthorized },
		)
	}

	suspend fun month(month: YearMonth, zone: ZoneId, calendars: List<CalendarDto>, ads: Boolean): MonthLoad = coroutineScope {
		val sponsored = async { if (ads) calendar.sponsoredEvents(month.toString()) else ApiResult.Ok(emptyList()) }
		val result = events.monthEvents(month.year, month.monthValue)
		val adRows = (sponsored.await() as? ApiResult.Ok)?.value.orEmpty()
		when (result) {
			is ApiResult.Ok -> MonthLoad(map(result.value + adRows, zone, calendars))
			is ApiResult.Err -> when (result.error) {
				ApiError.Unauthorized -> MonthLoad(null, unauthorized = true)
				else -> events.cachedEvents(month.year, month.monthValue)
					?.let { MonthLoad(map(it, zone, calendars)) }
					?: MonthLoad(null, errorText = "Couldn't load your events.")
			}
		}
	}

	/** Due tasks; null = this leg failed (an amber "Couldn't load tasks" line, never an error screen). */
	suspend fun tasks(zone: ZoneId, personalCalendarId: String?): List<CalendarTask>? =
		when (val result = calendar.calendarTasks()) {
			is ApiResult.Ok -> result.value
				.filter { it.completedAt == null }
				.mapNotNull { EventMapper.taskFromDto(it, zone, personalCalendarId) }

			is ApiResult.Err -> null
		}

	suspend fun verse(today: LocalDate, enabled: Boolean) =
		if (enabled) (calendar.dailyVerse(today.toString()) as? ApiResult.Ok)?.value else null

	private fun map(rows: List<EventDto>, zone: ZoneId, calendars: List<CalendarDto>): List<CalendarEvent> {
		val colours = calendars.associate { it.id to it.color }
		return rows.map { dto ->
			val event = EventMapper.fromDto(dto, zone)
			if (event.isAd) event.copy(color = dto.color ?: SPONSORED_HEX) else event.copy(color = colours[dto.calendarId])
		}
	}

	companion object {
		const val SPONSORED_HEX = "#f59e0b"

		/** chipColor for a row, resolved once. */
		fun colorOf(event: CalendarEvent) = chipColor(event.color)
	}
}
