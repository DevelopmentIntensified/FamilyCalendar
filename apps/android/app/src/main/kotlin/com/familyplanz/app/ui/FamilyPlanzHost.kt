package com.familyplanz.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.AppModules
import com.familyplanz.app.ui.auth.SessionCredentials
import com.familyplanz.app.ui.auth.SignInActions
import com.familyplanz.app.ui.auth.SignInScreen
import com.familyplanz.app.ui.auth.SignInViewModel
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.BANNER_ROUTES
import com.familyplanz.app.ui.shell.BANNER_STACK_TAG
import com.familyplanz.app.ui.shell.BellActions
import com.familyplanz.app.ui.shell.FpAccountBanner
import com.familyplanz.app.ui.shell.FpBottomNav
import com.familyplanz.app.ui.shell.FpMobileMenu
import com.familyplanz.app.ui.shell.FpNavbar
import com.familyplanz.app.ui.shell.FpNotificationBell
import com.familyplanz.app.ui.shell.FpOfflineBanner
import com.familyplanz.app.ui.shell.FpToaster
import com.familyplanz.app.ui.shell.navHiddenByKeyboard
import com.familyplanz.app.ui.shell.LocalAppModules
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.MenuActions
import com.familyplanz.app.ui.shell.MenuState
import com.familyplanz.app.ui.shell.RouteEntry
import com.familyplanz.app.ui.shell.SessionState
import com.familyplanz.app.ui.shell.SessionViewModel
import com.familyplanz.app.ui.shell.ShellChromeViewModel
import com.familyplanz.app.ui.shell.VerifyActions
import com.familyplanz.app.ui.shell.accountBanner
import com.familyplanz.app.ui.tasks.TasksEntry
import com.familyplanz.app.ui.theme.FpColors
import com.familyplanz.app.ui.theme.FpMotion
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.rememberReducedMotion
import java.time.Instant

/** Routes that paint the slate-50 canvas (`tasks/+page.svelte:364`, family, account, login); the rest are white. */
private val SLATE_CANVAS = setOf(AppRoute.TASKS, AppRoute.FAMILY, AppRoute.ACCOUNT, AppRoute.FORGOT_PASSWORD)

/** Page canvas per screen (spec §1.1 / AC-SH-21). */
fun canvasFor(route: AppRoute, colors: FpColors = FpColors()): Color =
	if (route in SLATE_CANVAS) colors.canvasSlate else colors.canvasWhite

/**
 * Single host: the sign-in screen (#288) until a working session exists,
 * then the web shell (#292 §2.1): Navbar, mobile menu, banner stack, the
 * entry, the six-tab bar and the toaster. Every lane reports a 401 through
 * the shell, which swaps back to sign-in and drops that session's ViewModels.
 * [banner] is the native permission banner (#286), kept on every screen.
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

	SignInEffect(session, signInVm)

	val canvas = if (sessionState is SessionState.SignedIn) canvasFor(nav.route, FpTheme.colors) else FpTheme.colors.canvasSlate
	Column(modifier = Modifier.fillMaxSize().background(canvas)) {
		// #291: app.html theme-color behind the status bar (edge-to-edge draws under it).
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
					SignedInShell(modules, nav, session, banner)
				}
			}
		}
	}
}

@Composable
private fun SignedInShell(
	modules: AppModules,
	nav: AppNav,
	session: SessionViewModel,
	banner: @Composable () -> Unit,
) {
	val chrome = viewModel { modules.session.chromeViewModel(session.toasts) { session.invalidateSession() } }
	var menuOpen by rememberSaveable { mutableStateOf(false) }
	val unread by chrome.unread.collectAsStateWithLifecycle()
	val me by chrome.me.collectAsStateWithLifecycle()

	LaunchedEffect(chrome) { chrome.loadMe() }
	// BottomNav: refetch the badge on every route change (and close the menu, #253).
	LaunchedEffect(nav.route) {
		menuOpen = false
		chrome.refreshBadge()
	}
	// ...and on app resume (`visibilitychange`).
	LifecycleResumeEffect(chrome) {
		chrome.refreshBadge()
		onPauseOrDispose { }
	}
	val open: (AppRoute) -> Unit = { route ->
		menuOpen = false
		nav.open(route)
	}
	// #304: system back walks the route history. With none left the app does not intercept it, so the system closes the app.
	BackHandler(enabled = nav.canGoBack) { nav.back() }
	val goForward: () -> Unit = { nav.forward() }
	val density = LocalDensity.current
	val imeOpen = navHiddenByKeyboard(with(density) { WindowInsets.ime.getBottom(this).toDp().value })

	BoxWithConstraints(Modifier.fillMaxSize()) {
		val menuMax = maxHeight * 0.8f
		Column(Modifier.fillMaxSize()) {
			FpNavbar(
				menuOpen,
				onLogo = { open(AppRoute.CALENDAR) },
				onToggleMenu = { menuOpen = !menuOpen },
				onForward = goForward.takeIf { nav.canGoForward },
			)
			FpMobileMenu(
				state = MenuState(open = menuOpen, active = nav.route, admin = me?.roles?.contains("admin") == true),
				actions = MenuActions(
					onOpen = open,
					onLogout = {
						menuOpen = false
						session.shell.signOut()
					},
				),
				bell = { ShellBell(chrome, unread, nav) { menuOpen = false } },
				modifier = Modifier.heightIn(max = menuMax),
			)
			if (nav.route in BANNER_ROUTES) BannerStack(chrome, open)
			banner()
			Box(Modifier.weight(1f).fillMaxWidth()) { FadingEntry(nav) }
			FpBottomNav(nav.tab, unread, hidden = imeOpen) { open(it.route) }
		}
		FpToaster(session.toasts, Modifier.align(Alignment.BottomCenter))
	}
}

/** The bell row at the top of the menu; a row tap marks it read and follows its link in-app. */
@Composable
private fun ShellBell(chrome: ShellChromeViewModel, unread: Int, nav: AppNav, closeMenu: () -> Unit) {
	var open by remember { mutableStateOf(false) }
	val list by chrome.bell.collectAsStateWithLifecycle()
	FpNotificationBell(
		unread = unread,
		open = open,
		list = list,
		actions = BellActions(
			onToggle = {
				open = !open
				if (open) chrome.loadBell()
			},
			onRetry = chrome::loadBell,
			onRow = { row ->
				open = false
				chrome.markRead(row)
				if (nav.openLink(row.link)) closeMenu()
			},
			onMarkAll = chrome::markAllRead,
		),
	)
}

/** `calendar/+layout.svelte` banner stack: offline, then the one account notice. */
@Composable
private fun BannerStack(chrome: ShellChromeViewModel, open: (AppRoute) -> Unit) {
	val modules = LocalAppModules.current
	val me by chrome.me.collectAsStateWithLifecycle()
	val verify by chrome.verify.form.collectAsStateWithLifecycle()
	Column(Modifier.fillMaxWidth().testTag(BANNER_STACK_TAG)) {
		FpOfflineBanner(modules.session.network, modules.session.pendingWrites)
		FpAccountBanner(
			banner = accountBanner(me, Instant.now(), verify.dismissed),
			verify = verify,
			actions = VerifyActions(
				onCode = chrome.verify::setCode,
				onSubmit = chrome.verify::submit,
				onResend = chrome.verify::resend,
				onDismiss = chrome.verify::dismiss,
				onResentShown = chrome.verify::clearResent,
			),
			// G13 claim lives on the Account identity card (L5).
			onClaim = { open(AppRoute.ACCOUNT) },
		)
	}
}

/** `<div in:fade={{duration: 100}}>`: each new page fades in over 100 ms. */
@Composable
private fun FadingEntry(nav: AppNav) {
	val reduced = rememberReducedMotion()
	key(nav.route) {
		val alpha = remember { Animatable(if (reduced) 1f else 0f) }
		LaunchedEffect(Unit) { alpha.animateTo(1f, FpMotion.spec(FpMotion.PAGE_FADE_MS, reduced)) }
		Box(
			Modifier.fillMaxSize()
				.graphicsLayer { this.alpha = alpha.value }
				.testTag("entry-${nav.route.name.lowercase()}"),
		) { RouteEntry(nav) }
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
