package com.familyplanz.app.push

import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import com.familyplanz.app.FP_OPEN_DAY
import com.familyplanz.app.MainActivity
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

/** Issue #273 extra: one summary on the user-mutable 'Event updates' channel; tap opens that day. */
@RunWith(RobolectricTestRunner::class)
class EventUpdateNotifierTest {
	private val app: Application = RuntimeEnvironment.getApplication()
	private val notifications get() = app.getSystemService(NotificationManager::class.java)

	private val notice = EventUpdateNotice(
		title = "2 event updates",
		text = "Dentist moved to 3:00 PM · today and 1 more",
		lines = listOf("Dentist moved to 3:00 PM · today", "Cancelled: Piano lesson"),
		day = "2026-11-03",
	)

	@Before
	fun grant() {
		shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
	}

	@Test
	fun `posts one summary with every line on the Event updates channel, tap opens the day`() {
		assertTrue(EventUpdateNotifier.post(app, notice))

		val posted = shadowOf(notifications).allNotifications.single()
		assertEquals("2 event updates", posted.extras.getString(Notification.EXTRA_TITLE))
		assertEquals(notice.text, posted.extras.getCharSequence(Notification.EXTRA_TEXT).toString())
		val lines = posted.extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)!!.map(CharSequence::toString)
		assertArrayEquals(notice.lines.toTypedArray(), lines.toTypedArray())
		assertEquals(EventUpdateNotifier.CHANNEL_ID, posted.channelId)
		val channel = notifications.getNotificationChannel(EventUpdateNotifier.CHANNEL_ID)
		assertEquals("Event updates", channel.name)
		assertTrue(channel.importance > NotificationManager.IMPORTANCE_NONE)
		val tap = shadowOf(posted.contentIntent).savedIntent
		assertEquals(MainActivity::class.java.name, tap.component?.className)
		assertEquals("2026-11-03", tap.getStringExtra(FP_OPEN_DAY))
	}

	@Test
	fun `nothing is posted without the notification permission`() {
		shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
		assertFalse(EventUpdateNotifier.post(app, notice))
		assertTrue(shadowOf(notifications).allNotifications.isEmpty())
	}

	@Test
	fun `nothing is posted when the user turned the Event updates channel off`() {
		EventUpdateNotifier.ensureChannel(app)
		val off = notifications.getNotificationChannel(EventUpdateNotifier.CHANNEL_ID).apply { importance = NotificationManager.IMPORTANCE_NONE }
		notifications.createNotificationChannel(off)
		assertFalse(EventUpdateNotifier.post(app, notice))
		assertTrue(shadowOf(notifications).allNotifications.isEmpty())
	}
}
