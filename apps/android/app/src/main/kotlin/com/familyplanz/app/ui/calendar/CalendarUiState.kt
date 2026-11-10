package com.familyplanz.app.ui.calendar

import com.familyplanz.app.data.CalendarDto
import com.familyplanz.app.data.CalendarSettingsDto
import com.familyplanz.app.data.ParsedEventDto
import com.familyplanz.app.data.RosterMemberDto
import com.familyplanz.app.data.VerseDto
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.ui.calendar.model.CalendarForm
import com.familyplanz.app.ui.calendar.model.RangeSelection
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

/** The four views. There is no Day segment on the phone toggle (Day comes from the sheet). */
enum class CalendarView(val label: String) { MONTH("Month"), WEEK("Week"), LIST("List"), DAY("Day") }

/** What the page load gives every view (`calendar/+page.server.ts` + G2-G7). */
data class CalendarData(
	val events: List<CalendarEvent> = emptyList(),
	val tasks: List<CalendarTask> = emptyList(),
	val calendars: List<CalendarDto> = emptyList(),
	val roster: List<RosterMemberDto> = emptyList(),
	val settings: CalendarSettingsDto = CalendarSettingsDto(),
	val verse: VerseDto? = null,
	val meId: String? = null,
) {
	val mondayFirst: Boolean get() = settings.weekStart == "monday"

	/** (id, name) pairs for chip attribution, pickers and plans. */
	val calendarRefs: List<Pair<String, String>> get() = calendars.map { it.id to it.name }
}

/** At most one overlay shows at a time; each carries what it opened on. */
sealed interface CalendarSheet {
	data class DayActions(val date: LocalDate) : CalendarSheet

	data class DayEvents(val date: LocalDate) : CalendarSheet

	data class Event(val event: CalendarEvent) : CalendarSheet

	data class Task(val task: CalendarTask) : CalendarSheet

	data class MonthPicker(val year: Int) : CalendarSheet

	data class Form(val form: CalendarForm) : CalendarSheet

	data object Filters : CalendarSheet

	data object Actions : CalendarSheet
}

/** A reviewed smart plan (`POST /api/events/bulk` with `dryRun`): what it says before it applies. */
data class SmartPlan(
	val descriptions: List<String>,
	val ops: List<JsonObject>,
	val movesToPast: Boolean,
	val instruction: String = "",
	val ids: List<String> = emptyList(),
)

data class CalendarUiState(
	/** The web's one `currentDate`: the month, week or day on screen all derive from it. */
	val anchor: LocalDate,
	val today: LocalDate,
	val zone: ZoneId,
	val view: CalendarView = CalendarView.MONTH,
	val viewBeforeDay: CalendarView = CalendarView.MONTH,
	/** First load (skeleton). */
	val loading: Boolean = true,
	/** A later month's range is in flight ("Downloading this month."). */
	val downloadingMonth: Boolean = false,
	val errorText: String? = null,
	val warnings: List<String> = emptyList(),
	val unauthorized: Boolean = false,
	val data: CalendarData = CalendarData(),
	val hiddenCalendars: Set<String> = emptySet(),
	val hiddenAssignees: Set<String> = emptySet(),
	val query: String = "",
	val selectionMode: Boolean = false,
	val selectedIds: Set<String> = emptySet(),
	val addMode: Boolean = false,
	val firstRunDismissed: Boolean = true,
	val sheet: CalendarSheet? = null,
	val range: RangeSelection? = null,
	val plan: SmartPlan? = null,
	val checklist: List<CalendarTask>? = null,
	/** Create form's Quick Add: the phrase, the in-flight spinner and the amber fallback line (#302). */
	val quickAdd: String = "",
	val parsing: Boolean = false,
	val parseFailed: Boolean = false,
	/** The phrase the parser failed on, for the report affordance; false = nothing to report. */
	val parseReportable: Boolean = false,
	/** Once reported, the affordance flips to its ack line. */
	val parseReported: Boolean = false,
	/** A multi-event phrase hangs the panel here until the user creates or dismisses. */
	val quickAddList: List<ParsedEventDto>? = null,
	val toast: String? = null,
) {
	val month: YearMonth get() = YearMonth.from(anchor)

	val mondayFirst: Boolean get() = data.mondayFirst

	/** The web's day view selection (`selectedDay`); only a Day view has one. */
	val selectedDay: String? get() = if (view == CalendarView.DAY) anchor.toString() else null

	/** The shown month, bucketed by the server's `day` key (list headings, day filter). */
	val grouped: List<DaySection> get() = monthSections(data.events, month)
}
