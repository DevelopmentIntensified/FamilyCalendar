package com.familyplanz.app.push

import com.familyplanz.app.ui.PhoneTab
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Issue #273: FCM message → action (#272 payload shapes), via fake WorkManager/notifier seams. */
class PushHandlerTest {
	private var refreshes = 0
	private val actors = mutableListOf<String?>()
	private val posted = mutableListOf<PushAction.ShowActivity>()
	private var signedIn = true

	private val handler = PushHandler(
		refresh = {
			refreshes++
			actors += it
		},
		poster = { posted += it },
		signedIn = { signedIn },
	)

	private fun payload(
		type: String?,
		title: String? = null,
		body: String? = null,
		link: String? = null,
		actorId: String? = null,
	) = PushPayload(type = type, title = title, body = body, link = link, actorId = actorId)

	@Test
	fun `events_changed enqueues one refresh and posts nothing`() = runBlocking {
		assertEquals(PushAction.RefreshEvents, handler.handle(payload("events_changed")))
		assertEquals(1, refreshes)
		assertTrue(posted.isEmpty())
	}

	@Test
	fun `events_changed hands its actorId to the refresh (#281), null when blank or absent`() = runBlocking {
		handler.handle(payload("events_changed", actorId = "me-1"))
		handler.handle(payload("events_changed", actorId = " "))
		handler.handle(payload("events_changed"))
		assertEquals(listOf("me-1", null, null), actors)
	}

	@Test
	fun `notification posts title, body and link`() = runBlocking {
		val action = handler.handle(payload("notification", "Task assigned", "Dad gave you Dishes", "/calendar/tasks"))
		val expected = PushAction.ShowActivity("Task assigned", "Dad gave you Dishes", "/calendar/tasks")
		assertEquals(expected, action)
		assertEquals(listOf(expected), posted)
		assertEquals(0, refreshes)
	}

	@Test
	fun `notification without link or title still posts with an app-name title`() = runBlocking {
		val action = handler.handle(payload("notification", title = " ", body = "Something happened"))
		assertEquals(PushAction.ShowActivity("Family Planz", "Something happened", null), action)
	}

	@Test
	fun `empty notification, unknown or missing type are ignored`() = runBlocking {
		val cases = listOf(payload("notification"), payload("rsvp"), payload(null, "t", "b"), payload(""))
		cases.forEach { assertEquals(it.toString(), PushAction.Ignore, handler.handle(it)) }
		assertEquals(0, refreshes)
		assertTrue(posted.isEmpty())
	}

	@Test
	fun `signed-out phone ignores every push`() = runBlocking {
		signedIn = false
		assertEquals(PushAction.Ignore, handler.handle(payload("events_changed")))
		assertEquals(PushAction.Ignore, handler.handle(payload("notification", "t", "b")))
		assertEquals(0, refreshes)
		assertTrue(posted.isEmpty())
	}

	@Test
	fun `link picks the tab best effort`() {
		assertEquals(PhoneTab.TASKS, PushLinks.tabFor("/calendar/tasks"))
		assertEquals(PhoneTab.TASKS, PushLinks.tabFor("https://familyplanz.com/calendar/tasks?x=1"))
		assertEquals(PhoneTab.CALENDAR, PushLinks.tabFor("/calendar"))
		assertEquals(PhoneTab.CALENDAR, PushLinks.tabFor("/calendar/2026-11-03"))
		assertNull(PushLinks.tabFor("/family/abc"))
		assertNull(PushLinks.tabFor(null))
		assertNull(PushLinks.tabFor(""))
	}
}
