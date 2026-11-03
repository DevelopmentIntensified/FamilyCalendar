package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Single host: the sign-in screen (#288) until a working session exists,
 * then the tab bar. Every 401 anywhere (any VM) swaps back to sign-in.
 * Snacks name what happened + the next step (ack <100ms UI rule).
 */
@Composable
fun FamilyPlanzHost(
	vms: HostViewModels,
	initialTab: PhoneTab,
	banner: @Composable () -> Unit = {},
) {
	val vm = vms.app
	val calVm = vms.calendar
	val quickVm = vms.quickAdd
	val signInVm = vms.signIn
	val taskUi by vm.ui.collectAsStateWithLifecycle()
	val categories by vm.categories.collectAsStateWithLifecycle()
	val guestNote by vm.guestNote.visible.collectAsStateWithLifecycle()
	val snackbarHostState = remember { SnackbarHostState() }
	var tab by rememberSaveable { mutableIntStateOf(initialTab.ordinal) }

	HostEffects(vm, calVm, quickVm, snackbarHostState)
	SignInEffect(vm, signInVm)

	when (val state = taskUi) {
		is AppUiState.NeedToken -> {
			val signInUi by signInVm.ui.collectAsStateWithLifecycle()
			SignInScreen(signInUi, state.note, signInVm.actions(vm))
		}

		else -> Scaffold(
			snackbarHost = { SnackbarHost(snackbarHostState) },
			bottomBar = { PhoneTabBar(tab) { tab = it.ordinal } },
		) { padding ->
			Column(modifier = Modifier.padding(padding)) {
				banner()
				if (tab == PhoneTab.TASKS.ordinal) {
					if (guestNote) GuestAccountNote(vm.guestNote::dismiss)
					TaskListScreen(state = state, actions = vm.taskActions(), categories = categories)
				} else {
					CalendarSlot(calVm, quickVm)
				}
			}
		}
	}
}

/** Cross-VM wiring: snack display, calendar 401 -> token entry, post-create refresh. */
@Composable
private fun HostEffects(
	vm: AppViewModel,
	calVm: CalendarViewModel,
	quickVm: QuickAddViewModel,
	snackbarHostState: SnackbarHostState,
) {
	val calUi by calVm.ui.collectAsStateWithLifecycle()
	val quickRefresh by quickVm.needsRefresh.collectAsStateWithLifecycle()
	val snackFlow by vm.snack.collectAsStateWithLifecycle()

	LaunchedEffect(snackFlow) {
		snackFlow?.let {
			snackbarHostState.showSnackbar(it.text)
			vm.consumeSnack()
		}
	}
	LaunchedEffect(calUi.unauthorized) {
		if (calUi.unauthorized) vm.invalidateSession()
	}
	LaunchedEffect(quickRefresh) {
		if (quickRefresh) {
			quickVm.consumeRefresh()
			calVm.refresh()
		}
	}
}

/** A finished sign-in opens the session through the same path as a pasted token. */
@Composable
private fun SignInEffect(vm: AppViewModel, signInVm: SignInViewModel) {
	val signedIn by signInVm.signedIn.collectAsStateWithLifecycle()
	LaunchedEffect(signedIn) {
		signedIn?.let {
			vm.signIn(it)
			signInVm.consumeSignedIn()
		}
	}
}

private fun SignInViewModel.actions(vm: AppViewModel) = SignInActions(
	onRequestCode = ::requestCode,
	onVerifyCode = ::verifyCode,
	onResendCode = ::resendCode,
	onPassword = ::signInWithPassword,
	onGuest = ::continueAsGuest,
	onIntent = ::setIntent,
	onStep = ::showStep,
	onSaveToken = { vm.signIn(SessionCredentials(it)) },
)

@Composable
private fun PhoneTabBar(tab: Int, onSelect: (PhoneTab) -> Unit) {
	NavigationBar {
		NavigationBarItem(
			selected = tab == PhoneTab.TASKS.ordinal,
			onClick = { onSelect(PhoneTab.TASKS) },
			icon = { Icon(Icons.Filled.Check, contentDescription = null) },
			label = { Text("Tasks") },
		)
		NavigationBarItem(
			selected = tab == PhoneTab.CALENDAR.ordinal,
			onClick = { onSelect(PhoneTab.CALENDAR) },
			icon = { Icon(Icons.Filled.DateRange, contentDescription = null) },
			label = { Text("Calendar") },
		)
	}
}

private fun AppViewModel.taskActions() = TaskActions(
	onRefresh = ::refresh,
	onOpenSettings = ::clearToken,
	onToggleComplete = ::toggleComplete,
	onStartFocus = ::queueFocus,
	onStopFocus = { queueFocus(null) },
	onRespond = ::respondAssignment,
	onCreate = ::createTask,
)

@Composable
private fun CalendarSlot(
	calVm: CalendarViewModel,
	quickVm: QuickAddViewModel,
) {
	val calUi by calVm.ui.collectAsStateWithLifecycle()
	val quickUi by quickVm.ui.collectAsStateWithLifecycle()
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
	)
}
