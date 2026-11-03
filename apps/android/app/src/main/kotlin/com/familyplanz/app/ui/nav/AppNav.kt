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
 * The app's one navigation state: which [AppRoute] shows, plus an optional
 * one-shot argument for it (e.g. the day a reminder tap opens). No nav
 * library: flat destinations, no back stack beyond the system's.
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

	private var pending: Pair<AppRoute, String>? = arg?.let { route to it }

	/** The bottom-bar tab for [route]; null on menu-only destinations. */
	val tab: PhoneTab? get() = PhoneTab.of(route)

	fun open(route: AppRoute, arg: String? = null) {
		startDecided = true
		pending = arg?.let { route to it }
		this.route = route
	}

	/** Open the lane that claims [link] (see [DeepLinks]); false = nobody does, stay put. */
	fun openLink(link: String?, arg: String? = null): Boolean {
		val target = DeepLinks.resolve(link, deepLinks) ?: return false
		open(target, arg)
		return true
	}

	/** The session's start screen from the user's setting; ignored once anything chose a screen. */
	suspend fun applyStart(provider: StartRouteProvider) {
		if (startDecided) return
		val start = provider.startRoute()
		if (!startDecided) open(start)
	}

	/** The argument [open] passed for [route], once; null when none is waiting. */
	fun takeArg(route: AppRoute): String? {
		val waiting = pending?.takeIf { it.first == route } ?: return null
		pending = null
		return waiting.second
	}

	companion object {
		/** Keeps the route across rotation/process death; a consumed argument is not replayed. */
		fun saver(deepLinks: List<DeepLink>): Saver<AppNav, String> = Saver(
			save = { if (it.startDecided) it.route.name else "" },
			restore = { saved -> AppNav(saved.takeIf { it.isNotEmpty() }?.let(AppRoute::valueOf), deepLinks) },
		)
	}
}

@Composable
fun rememberAppNav(initial: AppRoute? = null, deepLinks: List<DeepLink> = emptyList(), arg: String? = null): AppNav =
	rememberSaveable(saver = AppNav.saver(deepLinks)) { AppNav(initial, deepLinks, arg) }
