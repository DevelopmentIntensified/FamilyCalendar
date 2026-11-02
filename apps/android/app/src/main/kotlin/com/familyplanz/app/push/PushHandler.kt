package com.familyplanz.app.push

import com.familyplanz.app.ui.PhoneTab
import java.net.URI

/** The fields of an FCM message the app reads (#272: every data value is a string). */
data class PushPayload(
	val type: String?,
	val title: String?,
	val body: String?,
	val link: String?,
)

sealed interface PushAction {
	data object RefreshEvents : PushAction

	data class ShowActivity(val title: String, val body: String, val link: String?) : PushAction

	data object Ignore : PushAction
}

/** Expedited one-off cache refresh + reminder re-plan (WorkManager in prod). */
fun interface EventsRefreshScheduler {
	fun enqueue()
}

/** Posts a 'Family activity' notification (NotificationManager in prod). */
fun interface ActivityPoster {
	fun post(notice: PushAction.ShowActivity)
}

/** FCM message → action. Signed out → everything is ignored (no stale account's activity on screen). */
class PushHandler(
	private val refresh: EventsRefreshScheduler,
	private val poster: ActivityPoster,
	private val signedIn: suspend () -> Boolean,
) {
	suspend fun handle(payload: PushPayload): PushAction {
		val action = if (signedIn()) route(payload) else PushAction.Ignore
		when (action) {
			PushAction.RefreshEvents -> refresh.enqueue()
			is PushAction.ShowActivity -> poster.post(action)
			PushAction.Ignore -> Unit
		}
		return action
	}

	private fun route(payload: PushPayload): PushAction = when (payload.type) {
		TYPE_EVENTS_CHANGED -> PushAction.RefreshEvents
		TYPE_NOTIFICATION -> notice(payload)
		else -> PushAction.Ignore
	}

	private fun notice(payload: PushPayload): PushAction {
		val title = payload.title?.trim().orEmpty()
		val body = payload.body?.trim().orEmpty()
		if (title.isEmpty() && body.isEmpty()) return PushAction.Ignore
		return PushAction.ShowActivity(title.ifEmpty { APP_NAME }, body, payload.link?.takeIf { it.isNotBlank() })
	}

	private companion object {
		const val TYPE_EVENTS_CHANGED = "events_changed"
		const val TYPE_NOTIFICATION = "notification"
		const val APP_NAME = "Family Planz"
	}
}

/** Web paths from `data.link` → the phone tab showing the same thing; null = app default. */
object PushLinks {
	fun tabFor(link: String?): PhoneTab? {
		val path = link?.let { runCatching { URI(it.trim()).path }.getOrNull() }.orEmpty()
		return when {
			path.startsWith("/calendar/tasks") || path.startsWith("/tasks") -> PhoneTab.TASKS
			path.startsWith("/calendar") -> PhoneTab.CALENDAR
			else -> null
		}
	}
}
