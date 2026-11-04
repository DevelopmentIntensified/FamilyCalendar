package com.familyplanz.app.ui.calendar

import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.ui.calendar.model.CalendarForm
import com.familyplanz.app.ui.calendar.model.RangeSelection
import java.time.LocalDate
import java.time.YearMonth

/* What the Calendar screen can ask of its ViewModel; grouped so no composable
 * takes a dozen unrelated lambdas (#292 L2). */

/** DayNav, mini picker, view toggle and the body swipe. */
data class CalendarNavActions(
	val onPrev: () -> Unit,
	val onNext: () -> Unit,
	val onToday: () -> Unit,
	val onPickMonth: (YearMonth) -> Unit,
	val onSetView: (CalendarView) -> Unit,
	val onOpenDay: (LocalDate) -> Unit,
	val onBack: () -> Unit,
	val onSwipe: (Float, Float) -> Unit,
)

/** Every overlay the page can open, plus the actions menu's destinations. */
data class CalendarSheetActions(
	val onCellTap: (LocalDate) -> Unit,
	val onOpen: (CalendarSheet) -> Unit,
	val onClose: () -> Unit,
	val onMenu: (CalendarMenuAction) -> Unit,
)

/** The actions menu rows (`+page.svelte:130-137`). */
enum class CalendarMenuAction(val label: String) {
	FILTERS("Filters"),
	IMPORT("Import"),
	PRINT("Print"),
	DASHBOARD("Day dashboard"),
	SETTINGS("Calendar settings"),
}

/** The reading filters plus search and the first-run dismissal. */
data class CalendarFilterActions(
	val onToggleCalendar: (String) -> Unit,
	val onHideAll: (Boolean) -> Unit,
	val onToggleAssignee: (String) -> Unit,
	val onShowEveryone: () -> Unit,
	val onQuery: (String) -> Unit,
	val onDismissFirstRun: () -> Unit,
)

/** Selection, Add mode, the range popover and the retry/refresh paths. */
data class CalendarModeActions(
	val onSetSelection: (Boolean) -> Unit,
	val onToggleSelect: (String) -> Unit,
	val onToggleAdd: () -> Unit,
	val onRange: (RangeSelection?) -> Unit,
	val onRetry: () -> Unit,
)

/** Create / edit / duplicate / Task tab and Quick Add. */
data class CalendarFormActions(
	val onCreate: (LocalDate?, RangeSelection?) -> Unit,
	val onCreateTask: (LocalDate?) -> Unit,
	val onEdit: (CalendarEvent) -> Unit,
	val onDuplicate: (CalendarEvent) -> Unit,
	val onUpdate: ((CalendarForm) -> CalendarForm) -> Unit,
	val onSubmit: () -> Unit,
	val onClose: () -> Unit,
	val onQuickAdd: (String) -> Unit,
	val onParse: () -> Unit,
)

/** The event detail sheet's writes. */
data class CalendarEventActions(
	val onRsvp: (CalendarEvent, String) -> Unit,
	val onDelete: (CalendarEvent, String) -> Unit,
	val onAddChecklist: (String, String) -> Unit,
	val onCompleteTask: (CalendarTask) -> Unit,
)

/** Selection mode's bulk ops and the smart plan review. */
data class CalendarBulkActions(
	val onDelete: () -> Unit,
	val onDone: () -> Unit,
	val onCalendar: (String) -> Unit,
	val onLocation: (String) -> Unit,
	val onAttendants: (String) -> Unit,
	val onPlan: (String) -> Unit,
	val onApplyPlan: () -> Unit,
	val onDiscardPlan: () -> Unit,
)

data class CalendarActions(
	val nav: CalendarNavActions,
	val sheets: CalendarSheetActions,
	val filters: CalendarFilterActions,
	val modes: CalendarModeActions,
	val form: CalendarFormActions,
	val events: CalendarEventActions,
	val bulk: CalendarBulkActions,
)
