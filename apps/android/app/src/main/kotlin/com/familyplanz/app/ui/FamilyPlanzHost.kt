package com.familyplanz.app.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.familyplanz.app.R
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

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
	val focusPending by vm.focusPending.collectAsStateWithLifecycle()
	val snackbarHostState = remember { SnackbarHostState() }
	var tab by rememberSaveable { mutableIntStateOf(initialTab.ordinal) }

	HostEffects(vm, calVm, quickVm, snackbarHostState)
	SignInEffect(vm, signInVm)

	// #291: app.html theme-color behind the status bar (edge-to-edge draws
	// under it), then the web app's slate-50 page canvas.
	Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
		Box(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(FpTheme.colors.statusBar))
		Box(Modifier.weight(1f).consumeWindowInsets(WindowInsets.statusBars)) {
			when (val state = taskUi) {
				is AppUiState.NeedToken -> {
					val signInUi by signInVm.ui.collectAsStateWithLifecycle()
					SignInScreen(signInUi, state.note, signInVm.actions(vm))
				}

				else -> Scaffold(
					containerColor = MaterialTheme.colorScheme.background,
					snackbarHost = { SnackbarHost(snackbarHostState) { FpToast(it) } },
					bottomBar = { PhoneTabBar(tab) { tab = it.ordinal } },
				) { padding ->
					Column(modifier = Modifier.padding(padding)) {
						banner()
						if (tab == PhoneTab.TASKS.ordinal) {
							if (guestNote) GuestAccountNote(vm.guestNote::dismiss)
							TaskListScreen(
								state = state,
								actions = vm.taskActions(),
								categories = categories,
								focusPending = focusPending,
							)
						} else {
							CalendarSlot(calVm, quickVm)
						}
					}
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

/** BottomNav.svelte: white, slate-200 top rule, icon pill (primary-50/600 when on) + 11px label. */
@Composable
private fun PhoneTabBar(tab: Int, onSelect: (PhoneTab) -> Unit) {
	Column(modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)) {
		HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
		Row(modifier = Modifier.fillMaxWidth().navigationBarsPadding().selectableGroup()) {
			TabItem("Tasks", R.drawable.ic_fp_tasks, tab == PhoneTab.TASKS.ordinal) { onSelect(PhoneTab.TASKS) }
			TabItem("Calendar", R.drawable.ic_fp_calendar, tab == PhoneTab.CALENDAR.ordinal) {
				onSelect(PhoneTab.CALENDAR)
			}
		}
	}
}

@Composable
private fun RowScope.TabItem(label: String, @DrawableRes icon: Int, selected: Boolean, onClick: () -> Unit) {
	val tint = if (selected) MaterialTheme.colorScheme.primary else FpTheme.colors.textMuted
	Column(
		modifier = Modifier
			.weight(1f)
			.heightIn(min = 56.dp)
			.selectable(selected = selected, onClick = onClick, role = Role.Tab)
			.padding(vertical = 8.dp),
		horizontalAlignment = Alignment.CenterHorizontally,
		verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
	) {
		Box(
			modifier = Modifier
				.clip(FpShape.Pill)
				.background(if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
				.padding(horizontal = 16.dp, vertical = 4.dp),
		) {
			Icon(painterResource(icon), contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
		}
		Text(
			label,
			style = MaterialTheme.typography.labelSmall,
			color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
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
