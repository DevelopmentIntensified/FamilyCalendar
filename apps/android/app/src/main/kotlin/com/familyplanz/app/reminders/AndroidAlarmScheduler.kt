package com.familyplanz.app.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * AlarmManager edge (issue #271). Exact alarms via USE_EXACT_ALARM (API 33+,
 * calendar apps qualify under Play's exact-alarm policy) / SCHEDULE_EXACT_ALARM
 * (API 31–32); when `canScheduleExactAlarms()` says no, fall back to inexact
 * `setAndAllowWhileIdle` (may land minutes late in Doze, never lost).
 */
class AndroidAlarmScheduler(private val context: Context) : AlarmScheduler {
	private val alarms = context.getSystemService(AlarmManager::class.java)

	override fun schedule(reminder: PlannedReminder) {
		val pending = PendingIntent.getBroadcast(
			context,
			0,
			ReminderIntents.alarm(context, reminder),
			PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
		)
		val exact = canScheduleExact() &&
			runCatching {
				alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.fireAtMillis, pending)
			}.isSuccess
		if (!exact) alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.fireAtMillis, pending)
	}

	override fun cancel(occurrenceId: String) {
		val pending = PendingIntent.getBroadcast(
			context,
			0,
			ReminderIntents.identity(context, occurrenceId),
			PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
		) ?: return
		alarms.cancel(pending)
		pending.cancel()
	}

	private fun canScheduleExact(): Boolean =
		Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
}

/** One PendingIntent identity per occurrence: the data URI carries the id (extras don't count). */
object ReminderIntents {
	const val ACTION_FIRE = "com.familyplanz.app.action.EVENT_REMINDER"
	const val EXTRA_ID = "fp_reminder_id"
	const val EXTRA_TITLE = "fp_reminder_title"
	const val EXTRA_START = "fp_reminder_start"
	const val EXTRA_ALL_DAY = "fp_reminder_all_day"
	const val EXTRA_DAY = "fp_reminder_day"

	fun identity(context: Context, occurrenceId: String): Intent =
		Intent(context, ReminderReceiver::class.java)
			.setAction(ACTION_FIRE)
			.setData(Uri.Builder().scheme("familyplanz").authority("reminder").appendPath(occurrenceId).build())

	fun alarm(context: Context, reminder: PlannedReminder): Intent =
		identity(context, reminder.occurrenceId)
			.putExtra(EXTRA_ID, reminder.occurrenceId)
			.putExtra(EXTRA_TITLE, reminder.title)
			.putExtra(EXTRA_START, reminder.startMillis)
			.putExtra(EXTRA_ALL_DAY, reminder.allDay)
			.putExtra(EXTRA_DAY, reminder.day)
}
