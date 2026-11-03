package com.familyplanz.app.ui.alerts

import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink
import com.familyplanz.app.ui.nav.DeepLinks
import java.net.URI

/** Where an alert's web `link` goes on the phone (§2.6 "Map web links to native destinations"). */
sealed interface AlertTarget {
	/** An in-app screen, plus its one-shot argument (the Calendar day, or `event:<id>`). */
	data class InApp(val route: AppRoute, val arg: String? = null) : AlertTarget

	/** No screen claims it: open the website (Custom Tab / browser). */
	data class Web(val url: String) : AlertTarget
}

/** `event:<id>`: the Calendar argument an event link carries (L2's EventSheet opens it). */
const val EVENT_ARG_PREFIX = "event:"

private val DATE = Regex("""^\d{4}-\d{2}-\d{2}$""")

/**
 * The fixed table first (tasks, family, an event, a calendar day), then any
 * lane's declared [links]; anything left is a web page on [baseUrl].
 */
fun alertTarget(link: String, links: List<DeepLink>, baseUrl: String): AlertTarget {
	val uri = runCatching { URI(link.trim()) }.getOrNull() ?: return AlertTarget.Web(link)
	val path = uri.path.orEmpty()
	val date = queryParam(uri, "date")?.takeIf { DATE.matches(it) }
	return when {
		path.startsWith("/calendar/tasks") || path.startsWith("/tasks") -> AlertTarget.InApp(AppRoute.TASKS)
		path.startsWith("/family") -> AlertTarget.InApp(AppRoute.FAMILY)
		path.startsWith("/calendar/event/") ->
			AlertTarget.InApp(AppRoute.CALENDAR, EVENT_ARG_PREFIX + path.removePrefix("/calendar/event/").substringBefore('/'))
		path.startsWith("/calendar") && date != null -> AlertTarget.InApp(AppRoute.CALENDAR, date)
		else -> DeepLinks.resolve(link, links)?.let { AlertTarget.InApp(it) } ?: AlertTarget.Web(absolute(uri, baseUrl))
	}
}

private fun queryParam(uri: URI, name: String): String? =
	uri.rawQuery?.split('&')?.map { it.split('=', limit = 2) }
		?.firstOrNull { it.first() == name }?.getOrNull(1)

private fun absolute(uri: URI, baseUrl: String): String =
	if (uri.isAbsolute) uri.toString() else URI(baseUrl).resolve(uri).toString()
