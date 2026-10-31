package com.familyplanz.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.material3.SnackbarHostState
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Single host for both app states: token entry until a working session
 * exists, task list afterwards. Snacks name what happened (ack <100ms
 * UI rule: optimistic wording + next step).
 */
@Composable
fun FamilyPlanzHost(vm: AppViewModel) {
	val ui by vm.ui.collectAsStateWithLifecycle()
	val snackFlow by vm.snack.collectAsStateWithLifecycle()
	val snackbarHostState = remember { SnackbarHostState() }

	LaunchedEffect(snackFlow) {
		snackFlow?.let {
			snackbarHostState.showSnackbar(it.text)
			vm.consumeSnack()
		}
	}

	when (val state = ui) {
		is AppUiState.NeedToken ->
			SettingsScreen(
				note = state.note,
				onSave = vm::saveToken,
				onCancel = vm::refresh,
			)

		else ->
			TaskListScreen(
				state = state,
				onRefresh = vm::refresh,
				onOpenSettings = vm::clearToken,
				onToggleComplete = vm::toggleComplete,
				onStartFocus = vm::startFocus,
				onStopFocus = vm::stopFocus,
				snackbarHostState = snackbarHostState,
			)
	}
}
