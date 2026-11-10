package com.familyplanz.app.ui.account

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.LocalAppModules
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.ShellMenuButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate

/** The Account screen (§2.12, #310): the menu's "Settings" row and every `/account` link land here. */
@Composable
fun AccountEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val vm = viewModel { modules.account.accountViewModel(modules.family.source) }
	AccountRoute(vm, nav)
}

/** The screen over its ViewModel: the section a link asked for, the data-export save and sign-out after a delete. */
@Composable
fun AccountRoute(vm: AccountViewModel, nav: AppNav, baseUrl: String = BuildConfig.API_BASE_URL) {
	val shell = LocalShell.current
	val uri = LocalUriHandler.current
	val context = LocalContext.current
	val state by vm.state.collectAsStateWithLifecycle()

	// `/account#calendar`: the link's fragment arrives as the route argument (AC-AC-2).
	LaunchedEffect(Unit) {
		nav.takeArg(AppRoute.ACCOUNT)?.let { vm.selectSection(AccountSection.fromHash(it)) }
	}
	// AC-AC-12: a deleted account has no session left.
	LaunchedEffect(state.deleted) {
		if (state.deleted) shell.signOut()
	}
	// #189: the user picks where the export goes (the system "save as" sheet), then it is fetched and written there.
	val saveExport = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(EXPORT_MIME)) { target ->
		if (target != null) {
			vm.exportData { json -> withContext(Dispatchers.IO) { saveOrDiscard(context, target, json) } }
		}
	}
	AccountScreen(
		state = state,
		actions = accountActions(
			vm = vm,
			nav = nav,
			openWeb = { path -> runCatching { uri.openUri(baseUrl.trimEnd('/') + path) } },
			onExport = { saveExport.launch(exportFileName(LocalDate.now())) },
		),
		menu = { ShellMenuButton(nav) },
	)
}

/** One callback per control; web-only pages (pricing, claim) open in the browser. */
@Suppress("LongMethod")
private fun accountActions(vm: AccountViewModel, nav: AppNav, openWeb: (String) -> Unit, onExport: () -> Unit) = AccountActions(
	onSelectSection = vm::selectSection,
	onBack = { nav.open(AppRoute.CALENDAR) },
	onFirstName = vm::setFirstName,
	onLastName = vm::setLastName,
	onSaveProfile = vm::saveProfile,
	onEmail = vm::setEmail,
	onSaveEmail = vm::saveEmail,
	onWeekStart = { vm.setWeekStart(it) },
	onDefaultView = { vm.setDefaultView(it) },
	onTimeZone = { vm.setTimeZone(it) },
	onColour = { vm.setColor(it) },
	onSyncToFamily = { vm.setSyncToFamily(it) },
	onSmartCreation = { vm.setSmartCreation(it) },
	onDailyVerse = { vm.setDailyVerse(it) },
	onTranslation = { vm.setVerseTranslation(it) },
	onSponsorship = { vm.setSponsorship(it) },
	onModule = vm::toggleDashboardModule,
	onNotification = vm::setNotificationPreference,
	onRevokeSessions = vm::revokeOtherSessions,
	onTokenName = vm::setTokenName,
	onCreateToken = vm::createToken,
	onRevokeToken = vm::revokeToken,
	onDismissToken = vm::dismissCreatedToken,
	onDeleteConfirm = vm::setDeleteConfirm,
	onDelete = vm::deleteAccount,
	onOpenPlans = { openWeb(PRICING_PATH) },
	onJoinWaitlist = { openWeb(PRICING_PATH) },
	onOpenAlerts = { nav.open(AppRoute.ALERTS) },
	onOpenFamily = { nav.open(AppRoute.FAMILY) },
	onCreateFamily = { nav.open(AppRoute.FAMILY) },
	onClaim = { openWeb(CLAIM_PATH) },
	onReportBug = { nav.open(AppRoute.REPORT_BUG) },
	onExport = onExport,
)

/** The web's pricing page (`AccountSubscriptionSection.svelte:199`). */
private const val PRICING_PATH = "/pricing"

private const val EXPORT_MIME = "application/json"

/** The web's download name (`AccountDangerSection.svelte:27`). */
internal fun exportFileName(today: LocalDate): String = "familyplanz-export-$today.json"

/** Writes [json] into the picked document; a failed fetch (null) or a failed write removes the empty file again. */
private fun saveOrDiscard(context: Context, target: Uri, json: String?): Boolean {
	val resolver = context.contentResolver
	val saved = json != null &&
		runCatching { resolver.openOutputStream(target)?.use { it.write(json.toByteArray()) } != null }.getOrDefault(false)
	if (!saved) runCatching { DocumentsContract.deleteDocument(resolver, target) }
	return saved
}
