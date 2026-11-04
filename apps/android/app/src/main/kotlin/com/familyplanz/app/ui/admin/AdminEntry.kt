package com.familyplanz.app.ui.admin

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.secondary.PageEffects
import com.familyplanz.app.ui.shell.LocalAppModules
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.ShellMenuButton

/** The admin layout: header, tab strip, then the page body on the slate-50 canvas. */
@Composable
private fun AdminFrame(
	nav: AppNav,
	title: String,
	active: AdminTab?,
	badges: AdminBadges,
	content: @Composable () -> Unit,
) {
	Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
		FpHeader(title) { ShellMenuButton(nav) }
		AdminTabs(
			active = active,
			badges = badges,
			onOpenAdmin = { nav.open(AppRoute.ADMIN) },
			onTab = { nav.open(if (it == AdminTab.BUGS) AppRoute.ADMIN_BUGS else AppRoute.ADMIN_NLP) },
			onBackToApp = { nav.open(AppRoute.CALENDAR) },
		)
		Column(
			modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 32.dp),
			verticalArrangement = Arrangement.spacedBy(16.dp),
		) { content() }
	}
}

/** Copy + download wiring shared by the two registers. */
private class ExportHandlers(val copy: (String) -> Unit, val download: (String) -> Unit)

@Composable
private fun rememberExport(fileBase: String): ExportHandlers {
	val clipboard = LocalClipboardManager.current
	val shell = LocalShell.current
	val context = LocalContext.current
	val pending = remember { arrayOf("") }
	val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
		if (uri != null) {
			context.contentResolver.openOutputStream(uri)?.use { it.write(pending[0].toByteArray()) }
			shell.showSnack("Saved ${fileBase}.txt.")
		}
	}
	return remember(clipboard, saver) {
		ExportHandlers(
			copy = {
				clipboard.setText(AnnotatedString(it))
				shell.showSnack(EXPORT_COPIED)
			},
			download = {
				pending[0] = it
				saver.launch("$fileBase-${java.time.LocalDate.now()}.txt")
			},
		)
	}
}

/** `/admin`: the counts and the two doors. */
@Composable
fun AdminEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val vm = viewModel { modules.admin.adminViewModel() }
	val state by vm.ui.collectAsStateWithLifecycle()
	PageEffects(vm)
	AdminFrame(nav, ADMIN_TITLE, null, AdminBadges()) {
		AdminHomeScreen(
			state,
			onRetry = vm::load,
			onBugs = { nav.open(AppRoute.ADMIN_BUGS) },
			onNlp = { nav.open(AppRoute.ADMIN_NLP) },
		)
	}
}

/** `/admin/bugs`. */
@Composable
fun AdminBugsEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val vm = viewModel { modules.admin.adminBugsViewModel() }
	val state by vm.ui.collectAsStateWithLifecycle()
	val badges by vm.badges.collectAsStateWithLifecycle()
	val export = rememberExport("bug-reports")
	val uri = LocalUriHandler.current
	PageEffects(vm)
	AdminFrame(nav, BUGS_TITLE, AdminTab.BUGS, badges) {
		AdminBugsScreen(
			state,
			BugActions(
				onRetry = vm::load,
				onResolve = vm::resolve,
				onCopy = export.copy,
				onDownload = export.download,
				onOpenUrl = { uri.openUri(if (it.startsWith("/")) BuildConfig.API_BASE_URL.trimEnd('/') + it else it) },
			),
		)
	}
}

/** `/admin/nlp`. */
@Composable
fun AdminNlpEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val vm = viewModel { modules.admin.adminNlpViewModel() }
	val state by vm.ui.collectAsStateWithLifecycle()
	val badges by vm.badges.collectAsStateWithLifecycle()
	val export = rememberExport("unmatched-phrases")
	PageEffects(vm)
	AdminFrame(nav, NLP_TITLE, AdminTab.NLP, badges) {
		AdminNlpScreen(state, NlpActions(onRetry = vm::load, onResolve = vm::resolve, onCopy = export.copy, onDownload = export.download))
	}
}
