package com.familyplanz.app.reminders

import android.Manifest
import android.app.AlarmManager
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import com.familyplanz.app.FP_OPEN_DAY
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/** Issue #271: alarm → notification on 'Event reminders', and the AlarmManager edge. */
@RunWith(RobolectricTestRunner::class)
class ReminderReceiverTest {
	private val app: Application = RuntimeEnvironment.getApplication()
	private val notifications get() = app.getSystemService(NotificationManager::class.java)
	private val alarms get() = app.getSystemService(AlarmManager::class.java)

	private val reminder = PlannedReminder(
		occurrenceId = "abc~2026-11-08",
		title = "Family gym",
		fireAtMillis = Instant.parse("2026-11-08T13:45:00Z").toEpochMilli(),
		startMillis = Instant.parse("2026-11-08T14:00:00Z").toEpochMilli(),
		allDay = false,
		day = "2026-11-08",
	)

	@Before
	fun grant() {
		shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
	}

	@Test
	fun `receiver posts the reminder with title and time on the Event reminders channel`() {
		ReminderReceiver().onReceive(app, ReminderIntents.alarm(app, reminder))

		val posted = shadowOf(notifications).allNotifications.single()
		assertEquals("Family gym", posted.extras.getString(Notification.EXTRA_TITLE))
		val text = posted.extras.getCharSequence(Notification.EXTRA_TEXT).toString()
		assertEquals(ReminderNotifier.whenText(ReminderNotice("x", "", reminder.startMillis, false, reminder.day)), text)
		assertEquals(ReminderNotifier.CHANNEL_ID, posted.channelId)
		assertEquals("Event reminders", notifications.getNotificationChannel(ReminderNotifier.CHANNEL_ID).name)
		val tap = shadowOf(posted.contentIntent).savedIntent
		assertEquals("2026-11-08", tap.getStringExtra(FP_OPEN_DAY))
	}

	@Test
	fun `nothing is posted without the notification permission`() {
		shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
		ReminderReceiver().onReceive(app, ReminderIntents.alarm(app, reminder))
		assertTrue(shadowOf(notifications).allNotifications.isEmpty())
	}

	@Test
	fun `foreign actions are ignored`() {
		ReminderReceiver().onReceive(app, ReminderIntents.alarm(app, reminder).setAction("other"))
		assertTrue(shadowOf(notifications).allNotifications.isEmpty())
	}

	@Test
	fun `when text names time and date for timed events and All day otherwise`() {
		val utc = ZoneId.of("UTC")
		val timed = ReminderNotifier.whenText(ReminderNotice("x", "t", reminder.startMillis, false, "2026-11-08"), utc, Locale.US)
		assertTrue(timed, timed.startsWith("2:00") && timed.endsWith("Sun, Nov 8"))
		val allDay = ReminderNotifier.whenText(ReminderNotice("x", "t", reminder.startMillis, true, "2026-11-08"), utc, Locale.US)
		assertEquals("All day · Sun, Nov 8", allDay)
	}

	@Test
	fun `scheduler sets an alarm at fire time and cancel removes it`() {
		val scheduler = AndroidAlarmScheduler(app)
		scheduler.schedule(reminder)
		val next = shadowOf(alarms).peekNextScheduledAlarm()
		assertNotNull(next)
		assertEquals(reminder.fireAtMillis, next!!.triggerAtMs)

		scheduler.cancel(reminder.occurrenceId)
		assertNull(shadowOf(alarms).peekNextScheduledAlarm())
	}

	@Test
	fun `rescheduling the same occurrence replaces rather than duplicates`() {
		val scheduler = AndroidAlarmScheduler(app)
		scheduler.schedule(reminder)
		scheduler.schedule(reminder.copy(fireAtMillis = reminder.fireAtMillis + 60_000))
		val scheduled = shadowOf(alarms).scheduledAlarms
		assertEquals(1, scheduled.size)
		assertEquals(reminder.fireAtMillis + 60_000, scheduled.single().triggerAtMs)
	}
}
