package com.familyplanz.app.ui

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
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.AppModules
import com.familyplanz.app.ui.account.AccountEntry
import com.familyplanz.app.ui.alerts.AlertsEntry
import com.familyplanz.app.ui.auth.SessionCredentials
import com.familyplanz.app.ui.auth.SignInActions
import com.familyplanz.app.ui.auth.SignInScreen
import com.familyplanz.app.ui.auth.SignInViewModel
import com.familyplanz.app.ui.calendar.CalendarEntry
import com.familyplanz.app.ui.dashboard.DashboardEntry
import com.familyplanz.app.ui.family.FamilyEntry
import com.familyplanz.app.ui.groceries.GroceriesEntry
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.LocalAppModules
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.SessionState
import com.familyplanz.app.ui.shell.SessionViewModel
import com.familyplanz.app.ui.tasks.TasksEntry
import com.familyplanz.app.ui.admin.AdminBugsEntry
import com.familyplanz.app.ui.admin.AdminEntry
import com.familyplanz.app.ui.admin.AdminNlpEntry
import com.familyplanz.app.ui.auth.ForgotPasswordEntry
import com.familyplanz.app.ui.secondary.archive.ArchiveEntry
import com.familyplanz.app.ui.secondary.importer.ImportEntry
import com.familyplanz.app.ui.secondary.print.PrintEntry
import com.familyplanz.app.ui.secondary.reportbug.ReportBugEntry
import com.familyplanz.app.ui.secondary.stats.StatsEntry
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/**
 * Single host: the sign-in screen (#288) until a working session exists,
 * then the tab bar over [nav]'s entry. Every lane reports a 401 through the
 * shell, which swaps back to sign-in and drops that session's ViewModels.
 * Snacks name what happened + the next step (ack <100ms UI rule).
 */
@Composable
fun FamilyPlanzHost(
	modules: AppModules,
	nav: AppNav,
	banner: @Composable () -> Unit = {},
) {
	val session = viewModel { modules.session.sessionViewModel() }
	val signInVm = viewModel { modules.auth.signInViewModel() }
	val sessionState by session.state.collectAsStateWithLifecycle()
	val snackbarHostState = remember { SnackbarHostState() }

	SnackEffect(session, snackbarHostState)
	SignInEffect(session, signInVm)

	// #291: app.html theme-color behind the status bar (edge-to-edge draws
	// under it), then the web app's slate-50 page canvas.
	Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
		Box(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(FpTheme.colors.statusBar))
		Box(Modifier.weight(1f).consumeWindowInsets(WindowInsets.statusBars)) {
			when (val state = sessionState) {
				SessionState.Checking -> Unit

				is SessionState.SignedOut -> {
					val signInUi by signInVm.ui.collectAsStateWithLifecycle()
					SignInScreen(signInUi, state.note, signInVm.actions(session))
				}

				is SessionState.SignedIn -> CompositionLocalProvider(
					LocalViewModelStoreOwner provides state.lanes,
					LocalAppModules provides modules,
					LocalShell provides session.shell,
				) {
					// Owner 2026-11-03: open on the user's default view (Dashboard or Calendar).
					LaunchedEffect(state) { nav.applyStart(modules.session.startRoute) }
					Scaffold(
						containerColor = MaterialTheme.colorScheme.background,
						snackbarHost = { SnackbarHost(snackbarHostState) { FpToast(it) } },
						bottomBar = { PhoneTabBar(nav.tab) { nav.open(it.route) } },
					) { padding ->
						Column(modifier = Modifier.padding(padding)) {
							banner()
							Box(Modifier.weight(1f).testTag("entry-${nav.route.name.lowercase()}")) { RouteEntry(nav) }
						}
					}
				}
			}
		}
	}
}

/** One entry per [AppRoute]; each lane owns what its entry renders. */
@Composable
private fun RouteEntry(nav: AppNav) {
	when (nav.route) {
		AppRoute.CALENDAR -> CalendarEntry(nav)
		AppRoute.DASHBOARD -> DashboardEntry(nav)
		AppRoute.TASKS -> TasksEntry(nav)
		AppRoute.GROCERIES -> GroceriesEntry(nav)
		AppRoute.ALERTS -> AlertsEntry(nav)
		AppRoute.FAMILY -> FamilyEntry(nav)
		else -> MenuRouteEntry(nav)
	}
}

/** The menu, admin and auth destinations (no tab). */
@Composable
private fun MenuRouteEntry(nav: AppNav) {
	when (nav.route) {
		AppRoute.ACCOUNT -> AccountEntry(nav)
		AppRoute.STATS -> StatsEntry(nav)
		AppRoute.ARCHIVE -> ArchiveEntry(nav)
		AppRoute.REPORT_BUG -> ReportBugEntry(nav)
		AppRoute.IMPORT -> ImportEntry(nav)
		AppRoute.PRINT -> PrintEntry(nav)
		AppRoute.ADMIN -> AdminEntry(nav)
		AppRoute.ADMIN_BUGS -> AdminBugsEntry(nav)
		AppRoute.ADMIN_NLP -> AdminNlpEntry(nav)
		AppRoute.FORGOT_PASSWORD -> ForgotPasswordEntry(nav)
		else -> Unit
	}
}

@Composable
private fun SnackEffect(session: SessionViewModel, snackbarHostState: SnackbarHostState) {
	val snack by session.snack.collectAsStateWithLifecycle()
	LaunchedEffect(snack) {
		snack?.let {
			snackbarHostState.showSnackbar(it.text)
			session.consumeSnack()
		}
	}
}

/** A finished sign-in opens the session through the same path as a pasted token. */
@Composable
private fun SignInEffect(session: SessionViewModel, signInVm: SignInViewModel) {
	val signedIn by signInVm.signedIn.collectAsStateWithLifecycle()
	LaunchedEffect(signedIn) {
		signedIn?.let {
			session.signIn(it)
			signInVm.consumeSignedIn()
		}
	}
}

private fun SignInViewModel.actions(session: SessionViewModel) = SignInActions(
	onRequestCode = ::requestCode,
	onVerifyCode = ::verifyCode,
	onResendCode = ::resendCode,
	onPassword = ::signInWithPassword,
	onGuest = ::continueAsGuest,
	onIntent = ::setIntent,
	onStep = ::showStep,
	onSaveToken = { session.signIn(SessionCredentials(it)) },
)

/** BottomNav.svelte: white, slate-200 top rule, the six web tabs, icon pill (primary-50/600 when on) + 11px label. */
@Composable
private fun PhoneTabBar(selected: PhoneTab?, onSelect: (PhoneTab) -> Unit) {
	Column(modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)) {
		HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
		Row(modifier = Modifier.fillMaxWidth().navigationBarsPadding().selectableGroup()) {
			PhoneTab.entries.forEach { tab -> TabItem(tab, tab == selected) { onSelect(tab) } }
		}
	}
}

@Composable
private fun RowScope.TabItem(tab: PhoneTab, selected: Boolean, onClick: () -> Unit) {
	val tint = if (selected) MaterialTheme.colorScheme.primary else FpTheme.colors.textMuted
	Column(
		modifier = Modifier
			.weight(1f)
			.heightIn(min = 56.dp)
			.selectable(selected = selected, onClick = onClick, role = Role.Tab)
			.then(if (tab.description != tab.label) Modifier.semantics { contentDescription = tab.description } else Modifier)
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
			Icon(painterResource(tab.icon), contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
		}
		Text(
			tab.label,
			style = MaterialTheme.typography.labelSmall,
			color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
			maxLines = 1,
			overflow = TextOverflow.Ellipsis,
		)
	}
}
