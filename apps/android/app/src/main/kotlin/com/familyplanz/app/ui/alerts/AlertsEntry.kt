package com.familyplanz.app.ui.alerts

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.AppModules
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.shell.LocalAppModules
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.ShellMenuButton

/** L4's Alerts screen (§2.6 of docs/specs/android-mobile-clone.md). */
@Composable
fun AlertsEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	AlertsRoute(viewModel { modules.alerts.alertsViewModel() }, nav)
}

/** The Alerts screen over [vm]: toasts go to the shell, a 401 ends the session, a tap opens its link. */
@Composable
fun AlertsRoute(vm: AlertsViewModel, nav: AppNav, baseUrl: String = BuildConfig.API_BASE_URL) {
	val shell = LocalShell.current
	val uri = LocalUriHandler.current
	val state by vm.ui.collectAsStateWithLifecycle()

	LaunchedEffect(state.unauthorized) { if (state.unauthorized) shell.endSession() }
	LaunchedEffect(vm) {
		vm.effects.collect { effect ->
			when (effect) {
				is AlertsEffect.Toast -> shell.showSnack(effect.text)
				is AlertsEffect.Open -> when (val target = alertTarget(effect.link, AppModules.DEEP_LINKS, baseUrl)) {
					is AlertTarget.InApp -> nav.open(target.route, target.arg)
					is AlertTarget.Web -> runCatching { uri.openUri(target.url) }
				}
			}
		}
	}
	Column(Modifier.fillMaxSize().background(Color.White)) {
		FpHeader("Family Planz") { ShellMenuButton(nav) }
		AlertsScreen(
			state = state,
			actions = AlertsActions(
				onFilter = vm::setFilter,
				onOpen = vm::open,
				onMarkAllRead = vm::markAllRead,
				onAskPrune = vm::askToPrune,
				onPrune = vm::pruneRead,
				onRetry = vm::reload,
			),
		)
	}
}
