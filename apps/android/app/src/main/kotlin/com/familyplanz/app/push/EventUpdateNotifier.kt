package com.familyplanz.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.familyplanz.app.FP_OPEN_DAY
import com.familyplanz.app.MainActivity
import com.familyplanz.app.R
import com.familyplanz.app.reminders.ReminderNotifier
import java.util.concurrent.atomic.AtomicInteger

/**
 * 'Event updates' (issue #273 extra): one summary per `events_changed`
 * refresh. Its own channel so a family can mute it in system settings
 * without losing reminders or Family activity. Tap → that day, like reminders.
 */
object EventUpdateNotifier {
	const val CHANNEL_ID = "event_updates"
	const val CHANNEL_NAME = "Event updates"

	private val nextId = AtomicInteger((System.currentTimeMillis() % Int.MAX_VALUE).toInt())

	fun ensureChannel(context: Context) {
		val manager = context.getSystemService(NotificationManager::class.java)
		if (manager.getNotificationChannel(CHANNEL_ID) != null) return
		val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT).apply {
			description = "Events in the next 24 hours that were added, moved, changed or cancelled"
		}
		manager.createNotificationChannel(channel)
	}

	/** False when notifications or this channel are off (POST_NOTIFICATIONS via #271's gate). */
	fun post(context: Context, notice: EventUpdateNotice): Boolean {
		if (!enabled(context)) return false
		val id = nextId.incrementAndGet()
		val open = Intent(context, MainActivity::class.java)
			.putExtra(FP_OPEN_DAY, notice.day)
			.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
		val tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
		val style = NotificationCompat.InboxStyle().also { inbox -> notice.lines.forEach { inbox.addLine(it) } }
		val notification = NotificationCompat.Builder(context, CHANNEL_ID)
			.setSmallIcon(R.drawable.ic_stat_reminder)
			.setContentTitle(notice.title)
			.setContentText(notice.text)
			.setStyle(style)
			.setCategory(NotificationCompat.CATEGORY_EVENT)
			.setContentIntent(tap)
			.setAutoCancel(true)
			.build()
		return runCatching { NotificationManagerCompat.from(context).notify(id, notification) }.isSuccess
	}

	private fun enabled(context: Context): Boolean {
		if (!ReminderNotifier.canPost(context)) return false
		ensureChannel(context)
		val channel = context.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL_ID)
		return channel?.importance != NotificationManager.IMPORTANCE_NONE
	}
}
