package com.familyplanz.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.familyplanz.app.AppModules
import com.familyplanz.app.MainActivity
import com.familyplanz.app.R
import com.familyplanz.app.reminders.ReminderNotifier
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLinks
import java.util.concurrent.atomic.AtomicInteger

/**
 * 'Family activity' notifications from FCM (issue #273). The same channel id
 * is the manifest's FCM default, so a push that arrives while the app is in
 * the background (system-displayed) lands here too, with `link` as an extra.
 *
 * #292 L4: a tap only ever opens an in-app screen. A link no lane claims (or
 * no link) opens Alerts, where the same activity is listed.
 */
object ActivityNotifier {
	const val CHANNEL_ID = "family_activity"
	const val CHANNEL_NAME = "Family activity"

	/** FCM copies `data` keys into the launch intent's extras; ours uses the same key. */
	const val EXTRA_LINK = "link"

	private val nextId = AtomicInteger((System.currentTimeMillis() % Int.MAX_VALUE).toInt())

	/** [link] when a screen in the app answers it, else the Alerts page. */
	fun inAppLink(link: String?): String =
		link?.takeIf { DeepLinks.resolve(it, AppModules.DEEP_LINKS) != null } ?: AppRoute.ALERTS.webPath

	fun ensureChannel(context: Context) {
		val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
			description = "Tasks assigned to you and other family updates"
		}
		context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
	}

	/** False (nothing posted) when notifications are blocked — #271's permission banner explains why. */
	fun post(context: Context, notice: PushAction.ShowActivity): Boolean {
		if (!ReminderNotifier.canPost(context)) return false
		ensureChannel(context)
		val id = nextId.incrementAndGet()
		val open = Intent(context, MainActivity::class.java)
			.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
		open.putExtra(EXTRA_LINK, inAppLink(notice.link))
		val tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
		val notification = NotificationCompat.Builder(context, CHANNEL_ID)
			.setSmallIcon(R.drawable.ic_stat_reminder)
			.setContentTitle(notice.title)
			.setContentText(notice.body)
			.setStyle(NotificationCompat.BigTextStyle().bigText(notice.body))
			.setCategory(NotificationCompat.CATEGORY_SOCIAL)
			.setPriority(NotificationCompat.PRIORITY_HIGH)
			.setContentIntent(tap)
			.setAutoCancel(true)
			.build()
		return runCatching { NotificationManagerCompat.from(context).notify(id, notification) }.isSuccess
	}
}
