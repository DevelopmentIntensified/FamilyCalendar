package com.familyplanz.app.ui.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.familyplanz.app.ui.PhoneTab

/**
 * The app's one navigation state: which [AppRoute] shows, the routes behind
 * it (system back walks them, #304), the ones a back step left ahead (the
 * navbar's forward button), and an optional one-shot argument for the shown
 * route (e.g. the day a reminder tap opens). No nav library: flat destinations.
 *
 * [initial] null = "follow the user's start setting": Calendar shows until
 * [applyStart] lands the [StartRouteProvider]'s answer. An explicit route
 * (deep link, reminder tap) or any [open] wins over that answer.
 */
@Stable
class AppNav(
	initial: AppRoute? = null,
	private val deepLinks: List<DeepLink> = emptyList(),
	arg: String? = null,
) {
	var route: AppRoute by mutableStateOf(initial ?: AppRoute.CALENDAR)
		private set

	/** True once something chose the screen; the start setting then no longer applies. */
	var startDecided: Boolean = initial != null
		private set

	/** Routes system back returns to, oldest first; empty on the start screen (back then closes the app). */
	var backStack: List<AppRoute> by mutableStateOf(emptyList())
		private set

	/** Routes a back step left ahead, nearest last; any new [open] clears them. */
	var forwardStack: List<AppRoute> by mutableStateOf(emptyList())
		private set

	val canGoBack: Boolean get() = backStack.isNotEmpty()

	val canGoForward: Boolean get() = forwardStack.isNotEmpty()

	private var pending: Pair<AppRoute, String>? = arg?.let { route to it }

	/** The bottom-bar tab for [route]; null on menu-only destinations. */
	val tab: PhoneTab? get() = PhoneTab.of(route)

	/** Show [route]; the screen being left joins the back history. Re-opening the shown route only hands over [arg]. */
	fun open(route: AppRoute, arg: String? = null) {
		startDecided = true
		pending = arg?.let { route to it }
		if (route == this.route) return
		backStack = (backStack + this.route).takeLast(HISTORY_LIMIT)
		forwardStack = emptyList()
		this.route = route
	}

	/** System back: the previous route. False = already on the start screen (the caller lets the app close). */
	fun back(): Boolean {
		val previous = backStack.lastOrNull() ?: return false
		backStack = backStack.dropLast(1)
		forwardStack = forwardStack + route
		pending = null
		route = previous
		return true
	}

	/** Redo the last [back]; false when nothing is ahead. */
	fun forward(): Boolean {
		val next = forwardStack.lastOrNull() ?: return false
		forwardStack = forwardStack.dropLast(1)
		backStack = backStack + route
		pending = null
		route = next
		return true
	}

	/**
	 * Open the lane that claims [link] (see [DeepLinks]); false = nobody does, stay put.
	 * Without an explicit [arg] the link's `#fragment` rides along (`/account#calendar`).
	 */
	fun openLink(link: String?, arg: String? = null): Boolean {
		val target = DeepLinks.resolve(link, deepLinks) ?: return false
		open(target, arg ?: DeepLinks.fragment(link))
		return true
	}

	/**
	 * The session's start screen from the user's setting; ignored once anything chose a screen.
	 * It replaces the Calendar placeholder, so it adds no history.
	 */
	suspend fun applyStart(provider: StartRouteProvider) {
		if (startDecided) return
		val start = provider.startRoute()
		if (startDecided) return
		startDecided = true
		route = start
	}

	/** The argument [open] passed for [route], once; null when none is waiting. */
	fun takeArg(route: AppRoute): String? {
		val waiting = pending?.takeIf { it.first == route } ?: return null
		pending = null
		return waiting.second
	}

	private fun encode(): String =
		listOf(route.name, backStack.joinToString(",") { it.name }, forwardStack.joinToString(",") { it.name }).joinToString("|")

	companion object {
		/** Back steps kept; older ones fall off (bounds the saved state). */
		const val HISTORY_LIMIT = 50

		/**
		 * Keeps the route and both histories across rotation/process death as
		 * `route|back,back|forward,forward`; a consumed argument is not replayed.
		 */
		fun saver(deepLinks: List<DeepLink>): Saver<AppNav, String> = Saver(
			save = { if (it.startDecided) it.encode() else "" },
			restore = { saved -> decode(saved, deepLinks) },
		)

		private fun decode(saved: String, deepLinks: List<DeepLink>): AppNav {
			val parts = saved.split('|')
			val nav = AppNav(routeOf(parts.first()), deepLinks)
			nav.backStack = routesOf(parts.getOrNull(1))
			nav.forwardStack = routesOf(parts.getOrNull(2))
			return nav
		}

		private fun routeOf(name: String): AppRoute? = AppRoute.entries.firstOrNull { it.name == name }

		private fun routesOf(names: String?): List<AppRoute> = names.orEmpty().split(',').mapNotNull(::routeOf)
	}
}

@Composable
fun rememberAppNav(initial: AppRoute? = null, deepLinks: List<DeepLink> = emptyList(), arg: String? = null): AppNav =
	rememberSaveable(saver = AppNav.saver(deepLinks)) { AppNav(initial, deepLinks, arg) }
