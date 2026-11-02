package com.familyplanz.app.reminders

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.familyplanz.app.FP_OPEN_DAY
import com.familyplanz.app.MainActivity
import com.familyplanz.app.R
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** Alarm fired → post the reminder (issue #271). No network, no app process state needed. */
class ReminderReceiver : BroadcastReceiver() {
	override fun onReceive(context: Context, intent: Intent) {
		if (intent.action != ReminderIntents.ACTION_FIRE) return
		val id = intent.getStringExtra(ReminderIntents.EXTRA_ID) ?: return
		ReminderNotifier.post(
			context,
			ReminderNotice(
				occurrenceId = id,
				title = intent.getStringExtra(ReminderIntents.EXTRA_TITLE).orEmpty(),
				startMillis = intent.getLongExtra(ReminderIntents.EXTRA_START, 0L),
				allDay = intent.getBooleanExtra(ReminderIntents.EXTRA_ALL_DAY, false),
				day = intent.getStringExtra(ReminderIntents.EXTRA_DAY).orEmpty(),
			),
		)
	}
}

data class ReminderNotice(
	val occurrenceId: String,
	val title: String,
	val startMillis: Long,
	val allDay: Boolean,
	val day: String,
)

object ReminderNotifier {
	const val CHANNEL_ID = "event_reminders"
	const val CHANNEL_NAME = "Event reminders"

	fun ensureChannel(context: Context) {
		val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
			description = "Alerts before your Family Planz events start"
		}
		context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
	}

	/** Returns false (nothing posted) when notifications are blocked; the in-app banner explains why. */
	fun post(context: Context, notice: ReminderNotice): Boolean {
		if (!canPost(context)) return false
		ensureChannel(context)
		val open = Intent(context, MainActivity::class.java)
			.putExtra(FP_OPEN_DAY, notice.day)
			.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
		val tap = PendingIntent.getActivity(
			context,
			notice.occurrenceId.hashCode(),
			open,
			PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
		)
		val notification = NotificationCompat.Builder(context, CHANNEL_ID)
			.setSmallIcon(R.drawable.ic_stat_reminder)
			.setContentTitle(notice.title.ifBlank { "Upcoming event" })
			.setContentText(whenText(notice))
			.setCategory(NotificationCompat.CATEGORY_EVENT)
			.setPriority(NotificationCompat.PRIORITY_HIGH)
			.setContentIntent(tap)
			.setAutoCancel(true)
			.build()
		return runCatching {
			NotificationManagerCompat.from(context).notify(notice.occurrenceId.hashCode(), notification)
		}.isSuccess
	}

	/** "All day · Thu, Nov 5" or "4:00 PM · Tue, Nov 3" in the device zone/locale. */
	fun whenText(notice: ReminderNotice, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String {
		val start = Instant.ofEpochMilli(notice.startMillis).atZone(zone)
		val fallback = start.toLocalDate()
		val date = if (notice.allDay) runCatching { LocalDate.parse(notice.day) }.getOrDefault(fallback) else fallback
		val dateText = date.format(DateTimeFormatter.ofPattern("EEE, MMM d", locale))
		val timeText = if (notice.allDay) {
			"All day"
		} else {
			start.toLocalTime().format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale))
		}
		return "$timeText · $dateText"
	}

	private fun canPost(context: Context): Boolean {
		val permitted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
			ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
			PackageManager.PERMISSION_GRANTED
		return permitted && NotificationManagerCompat.from(context).areNotificationsEnabled()
	}
}
