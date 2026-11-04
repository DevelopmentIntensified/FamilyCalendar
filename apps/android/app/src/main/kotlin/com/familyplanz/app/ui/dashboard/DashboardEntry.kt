package com.familyplanz.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.LocalAppModules
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.ShellMenuButton

/** L4's Day Dashboard (§2.3 of docs/specs/android-mobile-clone.md). */
@Composable
fun DashboardEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	DashboardRoute(viewModel { modules.dashboard.dashboardViewModel() }, nav)
}

/** The Dashboard over [vm]: toasts and links go through the shell; a 401 ends the session. */
@Composable
fun DashboardRoute(vm: DashboardViewModel, nav: AppNav) {
	val shell = LocalShell.current
	val state by vm.ui.collectAsStateWithLifecycle()

	LaunchedEffect(state.unauthorized) { if (state.unauthorized) shell.endSession() }
	LaunchedEffect(vm) {
		vm.effects.collect { effect ->
			when (effect) {
				is DashboardEffect.Toast -> shell.showSnack(effect.text)
				DashboardEffect.OpenTasks -> nav.open(AppRoute.TASKS)
				DashboardEffect.OpenFamilyTasks -> nav.open(AppRoute.FAMILY)
				DashboardEffect.OpenCalendar -> nav.open(AppRoute.CALENDAR)
				is DashboardEffect.OpenGroceries -> nav.open(AppRoute.GROCERIES, effect.scope)
				is DashboardEffect.OpenDayView -> nav.open(AppRoute.CALENDAR, effect.date)
			}
		}
	}
	Column(Modifier.fillMaxSize().background(Color.White)) {
		FpHeader("Family Planz") { ShellMenuButton(nav) }
		DashboardScreen(
			state = state,
			actions = DashboardActions(
				onPrev = { vm.moveDay(-1) },
				onNext = { vm.moveDay(1) },
				onToday = vm::goToday,
				onOpenDayView = vm::openDayView,
				onBackToCalendar = vm::openCalendar,
				onRetry = vm::reload,
				onToggleTask = vm::toggleTask,
				onPriority = vm::setPriority,
				onQuickType = vm::typeQuick,
				onQuickCategory = vm::setCategory,
				onQuickAdd = vm::addQuick,
				onOpenTasks = vm::openTasks,
				onOpenFamilyTasks = vm::openFamilyTasks,
				onOpenGroceries = vm::openGroceries,
			),
		)
	}
}
