package com.familyplanz.app.ui.nav

import java.net.URI
import java.time.LocalDate

/**
 * Every signed-in destination. [webPath] is the website route the screen
 * clones (`src/lib/utils/navItems.ts` for the tabs; Account is `/account`,
 * the menu's "Settings" row; the rest are menu, admin and auth pages).
 */
enum class AppRoute(val webPath: String) {
	CALENDAR("/calendar"),
	DASHBOARD("/calendar/dashboard"),
	TASKS("/calendar/tasks"),
	GROCERIES("/calendar/groceries"),
	ALERTS("/calendar/notifications"),
	FAMILY("/family"),
	ACCOUNT("/account"),

	// Menu / secondary pages (§2.14), all native (owner, 2026-11-03).
	STATS("/calendar/stats"),
	ARCHIVE("/calendar/archive"),
	REPORT_BUG("/report-bug"),
	IMPORT("/calendar/import"),
	PRINT("/calendar/print"),

	// Admin-only pages.
	ADMIN("/admin"),
	ADMIN_BUGS("/admin/bugs"),
	ADMIN_NLP("/admin/nlp"),

	/** Reached from the sign-in screen; listed so the route exists for L5. */
	FORGOT_PASSWORD("/forgot-password"),
}

/**
 * Where a session opens when nothing (deep link, reminder tap) asked for a
 * screen: the user's `defaultView` setting (G3 `GET /api/me/settings`) picks
 * Dashboard or Calendar. Until L0 ships G3 the default answers Calendar.
 */
fun interface StartRouteProvider {
	suspend fun startRoute(): AppRoute

	companion object {
		val Calendar = StartRouteProvider { AppRoute.CALENDAR }
	}
}

/** A web path prefix a lane answers in-app: a link whose path starts with [pathPrefix] opens [route]. */
data class DeepLink(val pathPrefix: String, val route: AppRoute)

/** Web link (push `data.link`, alert row) → in-app route. */
object DeepLinks {
	/** Longest matching prefix wins (so `/calendar/tasks` beats `/calendar`); null = no lane claims it. */
	fun resolve(link: String?, links: List<DeepLink>): AppRoute? {
		val path = link?.let { runCatching { URI(it.trim()).path }.getOrNull() }.orEmpty()
		if (path.isEmpty()) return null
		return links.filter { path.startsWith(it.pathPrefix) }.maxByOrNull { it.pathPrefix.length }?.route
	}

	/** The link's `#fragment` (`/account#calendar` → "calendar"): the section a lane opens on; null when none. */
	fun fragment(link: String?): String? =
		link?.let { runCatching { URI(it.trim()).fragment }.getOrNull() }?.takeIf { it.isNotBlank() }
}

/**
 * The `AppNav` argument slot a route may hold, demuxed. Reminders pass a
 * bare `2026-11-06`; a share target's text can be anything, so it rides a
 * prefix — a friend sharing a date-like phrase can never collide with a
 * real reminder day (#312).
 */
const val SHARE_TEXT_PREFIX = "shared:"

/** A system text selection (`ACTION_PROCESS_TEXT`, #311) rides its own prefix, so it never reads as a share. */
const val SELECTION_PREFIX = "sel:"

/** A reminder tap's day and/or the `shared:`/`sel:` text of a share or selection, from one argument slot. */
fun navArgText(arg: String?): Pair<LocalDate?, String?> = when {
	arg == null -> null to null
	arg.startsWith(SHARE_TEXT_PREFIX) -> null to arg.removePrefix(SHARE_TEXT_PREFIX)
	arg.startsWith(SELECTION_PREFIX) -> null to arg.removePrefix(SELECTION_PREFIX)
	else -> runCatching { LocalDate.parse(arg.take(10)) }.getOrNull() to null
}
