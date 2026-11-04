package com.familyplanz.app.ui.groceries

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.dashboard.LaneToastHost
import com.familyplanz.app.ui.dashboard.rememberLaneToasts
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.LocalAppModules
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.ShellMenuButton

/** L4's Groceries screen (§2.5 of docs/specs/android-mobile-clone.md). */
@Composable
fun GroceriesEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val scope = remember(nav) { nav.takeArg(AppRoute.GROCERIES) }
	GroceriesRoute(viewModel { modules.groceries.groceriesViewModel() }, nav, scope)
}

/**
 * The Groceries page over [vm]: toasts go to the shell's host (Undo included),
 * a 401 ends the session, and [scope] (from a dashboard card) picks the list.
 */
@Composable
fun GroceriesRoute(vm: GroceriesViewModel, nav: AppNav, scope: String? = null) {
	val shell = LocalShell.current
	val toasts = rememberLaneToasts()
	val state by vm.ui.collectAsStateWithLifecycle()

	LaunchedEffect(scope) { vm.applyScope(scope) }
	LaunchedEffect(state.unauthorized) { if (state.unauthorized) shell.endSession() }
	LaunchedEffect(vm) {
		vm.toasts.collect { toast ->
			val undo = toast.undo
			toasts.show(toast.text, if (undo != null) "Undo" else null) { undo?.invoke() }
		}
	}
	Box(Modifier.fillMaxSize()) {
		Column(Modifier.fillMaxSize().background(Color.White)) {
			FpHeader("Family Planz") { ShellMenuButton(nav) }
			GroceriesScreen(
				state = state,
				actions = GroceriesActions(
					onFilter = vm::setFilter,
					onSearch = vm::setSearch,
					onInput = vm::typeItem,
					onStoreInput = vm::setStoreInput,
					onAddScope = vm::setAddScope,
					onUseSuggestion = vm::useSuggestion,
					onAdd = vm::add,
					onCheck = vm.rows::check,
					onUncheck = vm.rows::uncheck,
					onEdit = vm::openStores,
					onEditStores = vm::typeStores,
					onSaveStores = vm.rows::saveStores,
					onCancelEdit = vm::closeStores,
					onMove = vm.rows::move,
					onRemove = vm.rows::remove,
					onColour = vm.rows::setColour,
					onOpenColours = vm::openColour,
					onCloseColours = vm::closeColour,
					onColourScope = vm::setColourScope,
					onRailScope = vm::setRailScope,
					onRetry = vm::reload,
					onDismissError = vm::dismissError,
				),
			)
		}
		LaneToastHost(toasts, Modifier.align(Alignment.BottomCenter))
	}
}
