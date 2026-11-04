package com.familyplanz.app.ui.secondary.archive

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalUriHandler
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.secondary.PageEffects
import com.familyplanz.app.ui.secondary.PageScaffold
import com.familyplanz.app.ui.shell.LocalAppModules

/** The menu's Archive page (§2.14, G16). A row opens the event on the calendar; the upgrade pill opens the pricing page. */
@Composable
fun ArchiveEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val vm = viewModel { modules.secondary.archiveViewModel() }
	val state by vm.ui.collectAsStateWithLifecycle()
	val uriHandler = LocalUriHandler.current
	PageEffects(vm)
	PageScaffold(ARCHIVE_TITLE, nav) {
		ArchiveScreen(
			state,
			ArchiveActions(
				onRetry = vm::load,
				onOpenCalendar = { nav.open(AppRoute.CALENDAR) },
				onOpenEvent = { id -> nav.openLink("/calendar/event/$id") },
				onUpgrade = { uriHandler.openUri(BuildConfig.API_BASE_URL + "pricing") },
			),
		)
	}
}
