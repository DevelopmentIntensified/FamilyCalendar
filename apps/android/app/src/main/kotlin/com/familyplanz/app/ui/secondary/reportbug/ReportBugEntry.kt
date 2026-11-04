package com.familyplanz.app.ui.secondary.reportbug

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.secondary.PageEffects
import com.familyplanz.app.ui.secondary.PageScaffold
import com.familyplanz.app.ui.shell.LocalAppModules

/**
 * The menu's Report a Bug form (§2.14). The screen the bug was on arrives as
 * the route argument (`nav.open(REPORT_BUG, arg = <web path>)`); without one
 * the report says `/report-bug`, as the web does for a direct visit.
 */
@Composable
fun ReportBugEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val vm = viewModel { modules.secondary.reportBugViewModel() }
	val state by vm.ui.collectAsStateWithLifecycle()
	val from = remember { nav.takeArg(AppRoute.REPORT_BUG) }
	PageEffects(vm)
	PageScaffold(REPORT_BUG_TITLE, nav) {
		ReportBugScreen(
			state,
			ReportBugActions(
				onArea = vm::setArea,
				onDescription = vm::setDescription,
				onSubmit = { vm.submit(from) },
				onBack = { if (from == null || !nav.openLink(from)) nav.open(AppRoute.CALENDAR) },
				onBackToCalendar = { nav.open(AppRoute.CALENDAR) },
			),
		)
	}
}
