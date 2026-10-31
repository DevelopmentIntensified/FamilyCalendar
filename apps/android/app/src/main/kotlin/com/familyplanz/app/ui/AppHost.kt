package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** Top-level tabs; no nav library until a fourth screen demands it. */
enum class PhoneTab { TASKS, CALENDAR }

/**
 * Single host: token entry until a working session exists, then the tab
 * bar. Every 401 anywhere (any VM) swaps back to token entry. Snacks name
 * what happened + the next step (ack <100ms UI rule).
 */
@Composable
fun FamilyPlanzHost(
	vm: AppViewModel,
	calVm: CalendarViewModel,
	initialTab: PhoneTab,
) {
	val taskUi by vm.ui.collectAsStateWithLifecycle()
	val calUi by calVm.ui.collectAsStateWithLifecycle()
	val snackFlow by vm.snack.collectAsStateWithLifecycle()
	val snackbarHostState = remember { SnackbarHostState() }
	var tab by rememberSaveable { mutableIntStateOf(initialTab.ordinal) }

	LaunchedEffect(snackFlow) {
		snackFlow?.let {
			snackbarHostState.showSnackbar(it.text)
			vm.consumeSnack()
		}
	}
	LaunchedEffect(calUi.unauthorized) {
		if (calUi.unauthorized) vm.invalidateSession()
	}

	when (val state = taskUi) {
		is AppUiState.NeedToken ->
			SettingsScreen(
				note = state.note,
				onSave = vm::saveToken,
				onCancel = vm::refresh,
			)

		else -> Scaffold(
			snackbarHost = { SnackbarHost(snackbarHostState) },
			bottomBar = {
				NavigationBar {
					NavigationBarItem(
						selected = tab == PhoneTab.TASKS.ordinal,
						onClick = { tab = PhoneTab.TASKS.ordinal },
						icon = { Icon(Icons.Filled.Check, contentDescription = null) },
						label = { Text("Tasks") },
					)
					NavigationBarItem(
						selected = tab == PhoneTab.CALENDAR.ordinal,
						onClick = { tab = PhoneTab.CALENDAR.ordinal },
						icon = { Icon(Icons.Filled.DateRange, contentDescription = null) },
						label = { Text("Calendar") },
					)
				}
			},
		) { padding ->
			Box(modifier = Modifier.padding(padding)) {
				when (tab) {
					PhoneTab.TASKS.ordinal -> TaskListScreen(
						state = state,
						onRefresh = vm::refresh,
						onOpenSettings = vm::clearToken,
						onToggleComplete = vm::toggleComplete,
						onStartFocus = vm::startFocus,
						onStopFocus = vm::stopFocus,
					)

					else -> CalendarScreen(
						state = calUi,
						onPrevMonth = { calVm.move(-1) },
						onNextMonth = { calVm.move(1) },
						onSelectDay = calVm::selectDay,
						onClearDay = calVm::clearDay,
					)
				}
			}
		}
	}
}
