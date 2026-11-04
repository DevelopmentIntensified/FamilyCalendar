package com.familyplanz.app.ui.secondary.stats

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.secondary.PageEffects
import com.familyplanz.app.ui.secondary.PageScaffold
import com.familyplanz.app.ui.shell.LocalAppModules

/** The menu's Task stats page (§2.14, G15). */
@Composable
fun StatsEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val vm = viewModel { modules.secondary.statsViewModel() }
	val state by vm.ui.collectAsStateWithLifecycle()
	PageEffects(vm)
	PageScaffold(STATS_TITLE, nav) { StatsScreen(state, onRetry = vm::load) }
}
