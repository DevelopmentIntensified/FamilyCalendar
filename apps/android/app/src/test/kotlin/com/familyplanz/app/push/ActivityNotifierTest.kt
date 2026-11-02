package com.familyplanz.app.push

import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import com.familyplanz.app.MainActivity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

/** Issue #273: a `notification` push lands on 'Family activity' and taps open the app. */
@RunWith(RobolectricTestRunner::class)
class ActivityNotifierTest {
	private val app: Application = RuntimeEnvironment.getApplication()
	private val notifications get() = app.getSystemService(NotificationManager::class.java)

	@Before
	fun grant() {
		shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
	}

	@Test
	fun `posts title and body on the Family activity channel, tap opens MainActivity with the link`() {
		val posted = ActivityNotifier.post(app, PushAction.ShowActivity("Task assigned", "Dad gave you Dishes", "/calendar/tasks"))

		assertTrue(posted)
		val notification = shadowOf(notifications).allNotifications.single()
		assertEquals("Task assigned", notification.extras.getString(Notification.EXTRA_TITLE))
		assertEquals("Dad gave you Dishes", notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString())
		assertEquals(ActivityNotifier.CHANNEL_ID, notification.channelId)
		assertEquals("Family activity", notifications.getNotificationChannel(ActivityNotifier.CHANNEL_ID).name)
		val tap = shadowOf(notification.contentIntent).savedIntent
		assertEquals(MainActivity::class.java.name, tap.component?.className)
		assertEquals("/calendar/tasks", tap.getStringExtra(ActivityNotifier.EXTRA_LINK))
	}

	@Test
	fun `two pushes stack as two notifications and a missing link stays null`() {
		ActivityNotifier.post(app, PushAction.ShowActivity("One", "a", null))
		ActivityNotifier.post(app, PushAction.ShowActivity("Two", "b", null))

		val all = shadowOf(notifications).allNotifications
		assertEquals(2, all.size)
		assertNull(shadowOf(all.first().contentIntent).savedIntent.getStringExtra(ActivityNotifier.EXTRA_LINK))
	}

	@Test
	fun `nothing is posted without the notification permission`() {
		shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
		assertFalse(ActivityNotifier.post(app, PushAction.ShowActivity("t", "b", null)))
		assertTrue(shadowOf(notifications).allNotifications.isEmpty())
	}
}
