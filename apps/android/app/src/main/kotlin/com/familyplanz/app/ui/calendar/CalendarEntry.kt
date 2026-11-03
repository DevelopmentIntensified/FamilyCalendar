package com.familyplanz.app.ui.calendar

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.LocalAppModules
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.ShellMenuButton

/**
 * The Calendar tab: month list/grid + quick-add. A reminder tap's day
 * (#271) arrives as the route argument; a 401 ends the session; a quick-add
 * create refreshes the month.
 */
@Composable
fun CalendarEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val shell = LocalShell.current
	val calVm = viewModel { modules.calendar.calendarViewModel() }
	val quickVm = viewModel { modules.calendar.quickAddViewModel() }
	val calUi by calVm.ui.collectAsStateWithLifecycle()
	val quickUi by quickVm.ui.collectAsStateWithLifecycle()
	val quickRefresh by quickVm.needsRefresh.collectAsStateWithLifecycle()

	LaunchedEffect(Unit) {
		nav.takeArg(AppRoute.CALENDAR)?.let(calVm::openDay)
	}
	LaunchedEffect(calUi.unauthorized) {
		if (calUi.unauthorized) shell.endSession()
	}
	LaunchedEffect(quickRefresh) {
		if (quickRefresh) {
			quickVm.consumeRefresh()
			calVm.refresh()
		}
	}
	CalendarScreen(
		state = calUi,
		quickAdd = quickUi,
		quickAddActions = QuickAddActions(
			onParse = quickVm::parse,
			onDismiss = quickVm::dismiss,
			onConfirm = quickVm::confirm,
			onUpdateDraft = quickVm::updateDraft,
		),
		actions = CalendarActions(
			onPrevMonth = { calVm.move(-1) },
			onNextMonth = { calVm.move(1) },
			onSelectDay = calVm::selectDay,
			onClearDay = calVm::clearDay,
		),
		menu = { ShellMenuButton(nav) },
	)
}
