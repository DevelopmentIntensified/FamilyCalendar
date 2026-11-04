package com.familyplanz.app.ui.calendar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.CalendarSource
import com.familyplanz.app.data.TaskRepository
import com.familyplanz.app.data.UnavailableCalendarSource
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.domain.EventMapper
import com.familyplanz.app.ui.calendar.model.CalendarForm
import com.familyplanz.app.ui.calendar.model.RangeSelection
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import kotlin.math.abs

/** Per-day bucket of the shown month (the web's `grouped`, kept for the list headings). */
data class DaySection(val day: String, val events: List<CalendarEvent> = emptyList())

/**
 * The Calendar screen's one state machine (#292 L2): the anchor date every
 * view derives from, the month/task/verse loads, the reading filters, the
 * sheet and form overlays, selection and bulk. Writes live in [CalendarWrites].
 */
@Suppress("TooManyFunctions")
class CalendarViewModel(
	private val repository: TaskRepository,
	private val source: CalendarSource = UnavailableCalendarSource,
	private val prefs: CalendarPrefs = MemoryCalendarPrefs(),
	private val zone: ZoneId = ZoneId.systemDefault(),
	private val now: () -> LocalDate = { LocalDate.now(zone) },
	private val loader: CalendarLoader = CalendarLoader(repository, source, repository),
) : ViewModel() {
	private val _ui = MutableStateFlow(CalendarUiState(anchor = now(), today = now(), zone = zone))
	val ui: StateFlow<CalendarUiState> = _ui

	/** Each month loads once (AC-CAL-35); a write clears what it invalidated. */
	private val loaded = mutableSetOf<YearMonth>()
	private val rows = mutableMapOf<YearMonth, List<CalendarEvent>>()
	private val writes = CalendarWrites(_ui, viewModelScope, repository, source, ::reloadMonth, zone, now)

	init {
		viewModelScope.launch { boot() }
	}

	private suspend fun boot() {
		val boot = loader.boot()
		val meId = boot.meId
		val tasks = loader.tasks(zone, personalCalendarId(boot.calendars))
		val verse = loader.verse(now(), boot.settings.showDailyVerse)
		_ui.update { ui ->
			ui.copy(
				loading = true,
				data = ui.data.copy(
					calendars = boot.calendars,
					settings = boot.settings,
					roster = boot.roster,
					meId = meId,
					tasks = tasks.orEmpty(),
					verse = verse,
				),
				hiddenCalendars = meId?.let(prefs::hiddenCalendars).orEmpty(),
				hiddenAssignees = meId?.let(prefs::hiddenAssignees).orEmpty(),
				firstRunDismissed = meId?.let(prefs::firstRunDismissed) ?: true,
				warnings = buildList {
					if (boot.readsFailed) add(CALENDARS_WARNING)
					if (tasks == null) add(TASKS_WARNING)
				},
				unauthorized = boot.unauthorized,
			)
		}
		loadMonth(YearMonth.from(_ui.value.anchor), first = true)
	}

	private suspend fun loadMonth(month: YearMonth, first: Boolean = false) {
		if (month in loaded) {
			_ui.update { it.copy(loading = false, downloadingMonth = false) }
			return
		}
		_ui.update { it.copy(loading = first, downloadingMonth = !first, errorText = null) }
		val load = loader.month(month, zone, _ui.value.data.calendars, _ui.value.data.settings.showAdsAsEvents)
		if (_ui.value.month != month) return
		when {
			load.unauthorized -> _ui.update { it.copy(loading = false, downloadingMonth = false, unauthorized = true) }
			load.events == null -> _ui.update {
				it.copy(loading = false, downloadingMonth = false, errorText = load.errorText ?: EVENTS_ERROR)
			}

			else -> {
				rows[month] = load.events
				loaded += month
				_ui.update {
					it.copy(loading = false, downloadingMonth = false, errorText = null, data = it.data.copy(events = rows.values.flatten()))
				}
			}
		}
	}

	/** A write happened: refetch the shown month (and only it - the other months stay cached). */
	private suspend fun reloadMonth() {
		loaded.clear()
		rows.clear()
		loadMonth(YearMonth.from(_ui.value.anchor))
	}

	/* ---- Navigation (DayNav, mini picker, view toggle, swipe) ---- */

	fun prev() = movePeriod(-1)

	fun next() = movePeriod(1)

	private fun movePeriod(delta: Long) {
		val state = _ui.value
		goto(
			when (state.view) {
				CalendarView.WEEK -> state.anchor.plusWeeks(delta)
				CalendarView.DAY -> state.anchor.plusDays(delta)
				else -> state.anchor.plusMonths(delta)
			},
		)
	}

	private fun goto(date: LocalDate) {
		_ui.update { it.copy(anchor = date) }
		viewModelScope.launch { loadMonth(YearMonth.from(date)) }
	}

	fun today() {
		val date = now()
		_ui.update { it.copy(today = date) }
		goto(date)
	}

	fun pickMonth(month: YearMonth) = goto(month.atDay(1))

	/** Month is the phone's landing view whatever the stored default says (AC-CAL-1). */
	fun setView(view: CalendarView) {
		if (view == CalendarView.DAY) {
			openDay(_ui.value.anchor)
			return
		}
		_ui.update { it.copy(view = view, sheet = null) }
		viewModelScope.launch { loadMonth(YearMonth.from(_ui.value.anchor)) }
	}

	fun openDay(date: LocalDate) {
		_ui.update {
			it.copy(anchor = date, viewBeforeDay = if (it.view == CalendarView.DAY) it.viewBeforeDay else it.view,
				view = CalendarView.DAY, sheet = null)
		}
		viewModelScope.launch { loadMonth(YearMonth.from(date)) }
	}

	/** Reminder taps and deep links hand the day over as `YYYY-MM-DD`; garbage is ignored. */
	fun openDay(day: String) {
		runCatching { LocalDate.parse(day.take(10)) }.getOrNull()?.let(::openDay)
	}

	fun back() {
		_ui.update { it.copy(view = it.viewBeforeDay, sheet = null) }
	}

	/** Month view only (#048): left is next; a real vertical move is a scroll, not a swipe. */
	fun swipe(dxDp: Float, dyDp: Float) {
		if (_ui.value.view != CalendarView.MONTH) return
		val dx = abs(dxDp)
		if (dx < SWIPE_DP || abs(dyDp) >= dx / 1.5f) return
		if (dxDp < 0) next() else prev()
	}

	/* ---- Sheets, filters, modes ---- */

	fun cellTap(date: LocalDate) {
		if (_ui.value.selectionMode) openDay(date) else openSheet(CalendarSheet.DayActions(date))
	}

	fun openSheet(sheet: CalendarSheet) {
		_ui.update { it.copy(sheet = sheet, range = null) }
		if (sheet is CalendarSheet.Event) writes.loadChecklist(sheet.event.id)
	}

	fun closeSheet() {
		_ui.update { it.copy(sheet = null, range = null, checklist = null, parseFailed = false) }
	}

	fun toggleCalendar(id: String) {
		_ui.update { ui ->
			ui.copy(hiddenCalendars = if (id in ui.hiddenCalendars) ui.hiddenCalendars - id else ui.hiddenCalendars + id)
		}
		persist()
	}

	fun setAllCalendarsHidden(hidden: Boolean) {
		_ui.update { ui -> ui.copy(hiddenCalendars = if (hidden) ui.data.calendars.map { it.id }.toSet() else emptySet()) }
		persist()
	}

	fun toggleAssignee(id: String) {
		_ui.update { ui ->
			ui.copy(hiddenAssignees = if (id in ui.hiddenAssignees) ui.hiddenAssignees - id else ui.hiddenAssignees + id)
		}
		persist()
	}

	fun showEveryone() {
		_ui.update { it.copy(hiddenAssignees = emptySet()) }
		persist()
	}

	private fun persist() {
		val state = _ui.value
		val meId = state.data.meId ?: return
		prefs.setHiddenCalendars(meId, state.hiddenCalendars)
		prefs.setHiddenAssignees(meId, state.hiddenAssignees)
	}

	fun setQuery(text: String) {
		_ui.update { it.copy(query = text) }
	}

	fun dismissFirstRun() {
		_ui.update { it.copy(firstRunDismissed = true) }
		_ui.value.data.meId?.let(prefs::dismissFirstRun)
	}

	fun setSelectionMode(on: Boolean) {
		_ui.update { it.copy(selectionMode = on, selectedIds = if (on) it.selectedIds else emptySet(), addMode = false) }
	}

	fun toggleSelect(id: String) {
		_ui.update { ui -> ui.copy(selectedIds = if (id in ui.selectedIds) ui.selectedIds - id else ui.selectedIds + id) }
	}

	fun clearSelected() {
		_ui.update { it.copy(selectedIds = emptySet()) }
	}

	fun toggleAdd() {
		_ui.update { it.copy(addMode = !it.addMode) }
	}

	fun setRange(range: RangeSelection?) {
		_ui.update { it.copy(range = range) }
	}

	fun retry() {
		viewModelScope.launch {
			loaded.clear()
			_ui.update { it.copy(loading = true, errorText = null) }
			loadMonth(YearMonth.from(_ui.value.anchor), first = true)
		}
	}

	fun refresh() {
		viewModelScope.launch { reloadMonth() }
	}

	fun toastShown() {
		_ui.update { it.copy(toast = null) }
	}

	/* ---- Forms (EventFormModal: create / edit / duplicate / Task tab) ---- */

	fun openCreate(date: LocalDate? = null, range: RangeSelection? = null) {
		openSheet(CalendarSheet.Form(CalendarForm.createAt(date ?: _ui.value.anchor, range, personalCalendarId())))
	}

	fun openTask(date: LocalDate? = null) =
		openSheet(CalendarSheet.Form(CalendarForm.task(date?.toString() ?: _ui.value.anchor.toString(), personalCalendarId())))

	fun openEdit(event: CalendarEvent) =
		openSheet(CalendarSheet.Form(CalendarForm.fromEvent(event, zone, personalCalendarId())))

	/** AC-CAL-27: a copy titled "{title} (copy)" - a preview first, the user confirms. */
	fun openDuplicate(event: CalendarEvent) =
		openSheet(CalendarSheet.Form(CalendarForm.duplicateOf(event, zone, personalCalendarId())))

	fun updateForm(transform: (CalendarForm) -> CalendarForm) {
		_ui.update { ui -> (ui.sheet as? CalendarSheet.Form)?.let { ui.copy(sheet = it.copy(form = transform(it.form))) } ?: ui }
	}

	fun submitForm() {
		val form = (_ui.value.sheet as? CalendarSheet.Form)?.form ?: return
		if (!form.valid) return
		when {
			form.kind == com.familyplanz.app.ui.calendar.model.FormKind.TASK -> form.taskRequest()?.let(writes::createTask)
			form.editId != null -> writes.updateEvent(form.editId, form.updateBody())
			else -> form.createRequest(zone)?.let(writes::createEvent)
		}
	}

	/* ---- Quick Add (inside the create form) ---- */

	fun setQuickAdd(text: String) {
		_ui.update { it.copy(quickAdd = text, parseFailed = false) }
	}

	fun parseQuickAdd() {
		val phrase = _ui.value.quickAdd
		if (phrase.isBlank()) return
		_ui.update { it.copy(parsing = true, parseFailed = false) }
		viewModelScope.launch {
			when (val result = repository.parseQuickAdd(phrase)) {
				is ApiResult.Ok -> {
					val parsed = result.value.parsed ?: result.value.results.firstOrNull()
					_ui.update { ui ->
						val form = (ui.sheet as? CalendarSheet.Form)?.form ?: return@update ui
						ui.copy(
							parsing = false,
							parseFailed = parsed == null,
							sheet = CalendarSheet.Form(CalendarForm.parsedInto(form, parsed)),
						)
					}
				}

				is ApiResult.Err -> _ui.update {
					it.copy(parsing = false, parseFailed = it.quickAdd.isNotBlank())
				}
			}
		}
	}

	/* ---- Server writes (delegated) ---- */

	fun rsvp(event: CalendarEvent, status: String) = writes.rsvp(event, status)

	fun deleteEvent(event: CalendarEvent, scope: String = "all") = writes.delete(event, scope)

	fun duplicate(event: CalendarEvent) {
		val form = CalendarForm.duplicateOf(event, zone, personalCalendarId())
		form.createRequest(zone)?.let(writes::duplicate)
	}

	fun addChecklistTask(eventId: String, title: String) = writes.addChecklist(eventId, title)

	fun completeChecklistTask(task: CalendarTask) = writes.completeChecklistTask(task)

	fun deleteSelected() = writes.deleteSelected(_ui.value.selectedIds)

	fun applyCalendar(calendarId: String) {
		val name = _ui.value.data.calendars.firstOrNull { it.id == calendarId }?.name.orEmpty()
		writes.applyOp(_ui.value.selectedIds, com.familyplanz.app.ui.calendar.model.BulkOps.calendar(calendarId),
			"Moved ${com.familyplanz.app.ui.calendar.model.events(_ui.value.selectedIds.size)} to $name.")
	}

	fun applyLocation(text: String) {
		val count = _ui.value.selectedIds.size
		writes.applyOp(
			_ui.value.selectedIds,
			com.familyplanz.app.ui.calendar.model.BulkOps.location(text),
			"Location updated on ${com.familyplanz.app.ui.calendar.model.events(count)}.",
		)
	}

	fun applyAttendants(names: String) {
		val op = com.familyplanz.app.ui.calendar.model.BulkOps.attendants(names) ?: return
		val count = _ui.value.selectedIds.size
		writes.applyOp(_ui.value.selectedIds, op, "Attendant added to ${com.familyplanz.app.ui.calendar.model.events(count)}.")
	}

	fun planSmart(instruction: String) = writes.planSmart(instruction, _ui.value.selectedIds)

	fun applyPlan() = _ui.value.plan?.let(writes::applyPlan)

	fun discardPlan() = writes.discardPlan()

	private fun personalCalendarId(calendars: List<com.familyplanz.app.data.CalendarDto> = _ui.value.data.calendars): String? =
		_ui.value.data.settings.defaultCalendarId ?: calendars.firstOrNull { it.kind == "personal" }?.id ?: calendars.firstOrNull()?.id

	companion object {
		/** The tap that is a fling, not a scroll (AC-CAL-10). */
		const val SWIPE_DP = 60f
		const val TASKS_WARNING = "Couldn't load tasks just now - everything else is up to date."
		const val CALENDARS_WARNING = "Couldn't load your calendars just now - everything else is up to date."
		const val EVENTS_ERROR = "Couldn't load your events."
	}
}

/**
 * The server page window pads ±7 days around the grid, so a month fetch
 * returns neighbouring-month rows too; bucket strictly to the shown month.
 */
internal fun monthSections(mapped: List<CalendarEvent>, month: YearMonth): List<DaySection> {
	val prefix = "%04d-%02d".format(month.year, month.monthValue)
	return mapped
		.filter { it.day.take(7) == prefix }
		.groupBy { it.day }
		.toSortedMap()
		.entries
		.map { DaySection(it.key, it.value.sortedBy { e -> e.startDate }) }
}

internal fun monthNameOf(month: java.time.Month): String =
	month.name.lowercase().replaceFirstChar { it.uppercase() }

/** Kept for a caller that only has an EventSource (reminder tests, previews). */
internal fun errorTextOf(result: ApiResult<*>): String? =
	(result as? ApiResult.Err)?.takeIf { it.error !is ApiError.NotFound }?.error?.message
