package com.familyplanz.app.ui.calendar

import com.familyplanz.app.ui.calendar.model.RangeSelection
import java.time.LocalDate
import java.time.YearMonth

/** Everything the Calendar screen can ask of [CalendarViewModel], one sealed family per concern. */
sealed interface CalendarAction

/** DayNav, mini picker, view toggle, swipe (Calendar.svelte goPrevious / goNext / changeView). */
sealed interface NavAction : CalendarAction {
	data object Prev : NavAction

	data object Next : NavAction

	data object Today : NavAction

	data class PickMonth(val month: YearMonth) : NavAction

	data class SetView(val view: CalendarView) : NavAction

	/** Day view for [date] (sheet row, selection-mode cell tap, reminder tap). */
	data class OpenDay(val date: LocalDate) : NavAction

	/** Day view's Back: the view it came from. */
	data object Back : NavAction

	/** A finished horizontal drag on the body; only the month view navigates (#048). */
	data class Swipe(val dx: Float, val dy: Float, val thresholdPx: Float) : NavAction
}

sealed interface SheetAction : CalendarAction {
	/** MonthDayCell tap: the day sheet, or Day view in selection mode. */
	data class CellTap(val date: LocalDate) : SheetAction

	data class Open(val sheet: CalendarSheet) : SheetAction

	data object Close : SheetAction
}

sealed interface FilterAction : CalendarAction {
	data class ToggleCalendar(val id: String) : FilterAction

	data class SetAllCalendarsHidden(val hidden: Boolean) : FilterAction

	data class ToggleAssignee(val id: String) : FilterAction

	data object ShowEveryone : FilterAction

	data class Query(val text: String) : FilterAction

	data object DismissFirstRun : FilterAction
}

sealed interface ModeAction : CalendarAction {
	data class SetSelection(val on: Boolean) : ModeAction

	data class ToggleSelect(val id: String) : ModeAction

	data object ClearSelected : ModeAction

	data object ToggleAdd : ModeAction

	data class Range(val selection: RangeSelection?) : ModeAction

	data object Retry : ModeAction

	/** Something changed on the server (create, edit, delete, bulk): reload what is loaded. */
	data object Refresh : ModeAction

	data object ToastShown : ModeAction
}
