package com.familyplanz.app.ui.calendar

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.LocalAppModules
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.ShellMenuButton
import java.time.LocalDate

/**
 * The Calendar tab (#292 L2): one ViewModel, one page. A reminder tap's day
 * (#271) arrives as the route argument, a 401 ends the session and every
 * toast names what happened.
 */
@Composable
fun CalendarEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val shell = LocalShell.current
	val context = LocalContext.current
	val calVm = viewModel { modules.calendar.calendarViewModel(context) }
	val ui by calVm.ui.collectAsStateWithLifecycle()

	LaunchedEffect(Unit) {
		nav.takeArg(AppRoute.CALENDAR)?.let(calVm::openDay)
	}
	LaunchedEffect(ui.unauthorized) {
		if (ui.unauthorized) shell.endSession()
	}
	LaunchedEffect(ui.toast) {
		ui.toast?.let {
			shell.showSnack(it)
			calVm.toastShown()
		}
	}
	CalendarScreen(
		state = ui,
		actions = CalActions(calVm, nav),
		onBrowseTasks = { nav.open(AppRoute.TASKS) },
		menu = { ShellMenuButton(nav) },
	)
}

private fun CalActions(vm: CalendarViewModel, nav: AppNav) = CalendarActions(
	nav = CalendarNavActions(
		onPrev = vm::prev,
		onNext = vm::next,
		onToday = vm::today,
		onPickMonth = vm::pickMonth,
		onSetView = vm::setView,
		onOpenDay = { day: LocalDate -> vm.openDay(day) },
		onBack = vm::back,
		onSwipe = vm::swipe,
	),
	sheets = CalendarSheetActions(
		onCellTap = { day: LocalDate -> vm.cellTap(day) },
		onOpen = vm::openSheet,
		onClose = vm::closeSheet,
		onMenu = { action -> menu(vm, nav, action) },
	),
	filters = CalendarFilterActions(
		onToggleCalendar = vm::toggleCalendar,
		onHideAll = vm::setAllCalendarsHidden,
		onToggleAssignee = vm::toggleAssignee,
		onShowEveryone = vm::showEveryone,
		onQuery = vm::setQuery,
		onDismissFirstRun = vm::dismissFirstRun,
	),
	modes = CalendarModeActions(
		onSetSelection = vm::setSelectionMode,
		onToggleSelect = vm::toggleSelect,
		onToggleAdd = vm::toggleAdd,
		onRange = vm::setRange,
		onRetry = vm::retry,
	),
	form = CalendarFormActions(
		onCreate = { date, range -> vm.openCreate(date, range) },
		onCreateTask = { date -> vm.openTask(date) },
		onEdit = vm::openEdit,
		onDuplicate = vm::openDuplicate,
		onUpdate = vm::updateForm,
		onSubmit = vm::submitForm,
		onClose = vm::closeSheet,
		onQuickAdd = vm::setQuickAdd,
		onParse = vm::parseQuickAdd,
	),
	events = CalendarEventActions(
		onRsvp = vm::rsvp,
		onDelete = { event, scope -> vm.deleteEvent(event, scope) },
		onAddChecklist = vm::addChecklistTask,
		onCompleteTask = vm::completeChecklistTask,
	),
	bulk = CalendarBulkActions(
		onDelete = vm::deleteSelected,
		onDone = { vm.setSelectionMode(false) },
		onCalendar = vm::applyCalendar,
		onLocation = vm::applyLocation,
		onAttendants = vm::applyAttendants,
		onPlan = vm::planSmart,
		onApplyPlan = vm::applyPlan,
		onDiscardPlan = vm::discardPlan,
	),
)

/** Actions menu rows land on the calendar's own sheets or a menu page (§2.14). */
private fun menu(vm: CalendarViewModel, nav: AppNav, action: CalendarMenuAction) {
	when (action) {
		CalendarMenuAction.FILTERS -> vm.openSheet(CalendarSheet.Filters)
		CalendarMenuAction.DASHBOARD -> nav.open(AppRoute.DASHBOARD)
		CalendarMenuAction.IMPORT -> nav.open(AppRoute.IMPORT)
		CalendarMenuAction.PRINT -> nav.open(AppRoute.PRINT)
		CalendarMenuAction.SETTINGS -> nav.open(AppRoute.ACCOUNT)
	}
}
