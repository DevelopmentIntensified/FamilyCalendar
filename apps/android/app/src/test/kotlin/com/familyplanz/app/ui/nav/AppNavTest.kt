package com.familyplanz.app.ui.nav

import com.familyplanz.app.AppModules
import com.familyplanz.app.ui.PhoneTab
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** #292 S1a: routes, the deep-link hook and the start-screen decision. */
class AppNavTest {
	private val links = AppModules.DEEP_LINKS

	@Test
	fun `deep links resolve by longest prefix`() {
		assertEquals(AppRoute.TASKS, DeepLinks.resolve("/calendar/tasks", links))
		assertEquals(AppRoute.TASKS, DeepLinks.resolve("https://familyplanz.com/calendar/tasks?x=1", links))
		assertEquals(AppRoute.CALENDAR, DeepLinks.resolve("/calendar/2026-11-03", links))
		assertEquals(AppRoute.ALERTS, DeepLinks.resolve("/calendar/notifications", links + DeepLink("/calendar/notifications", AppRoute.ALERTS)))
		assertNull(DeepLinks.resolve("/family/abc", links))
		assertNull(DeepLinks.resolve(null, links))
	}

	@Test
	fun `open link moves to the claiming lane, an unclaimed link stays put`() {
		val nav = AppNav(AppRoute.CALENDAR, links)
		assertFalse(nav.openLink("/family/abc"))
		assertEquals(AppRoute.CALENDAR, nav.route)
		assertTrue(nav.openLink("/calendar/tasks"))
		assertEquals(AppRoute.TASKS, nav.route)
		assertEquals(PhoneTab.TASKS, nav.tab)
	}

	@Test
	fun `a route argument is handed out once, to its route only`() {
		val nav = AppNav(AppRoute.CALENDAR, arg = "2027-03-05")
		assertNull(nav.takeArg(AppRoute.TASKS))
		assertEquals("2027-03-05", nav.takeArg(AppRoute.CALENDAR))
		assertNull(nav.takeArg(AppRoute.CALENDAR))
	}

	@Test
	fun `account is a route without a tab`() {
		val nav = AppNav(AppRoute.TASKS)
		nav.open(AppRoute.ACCOUNT)
		assertNull(nav.tab)
	}

	@Test
	fun `the start setting applies only while nothing chose a screen`() = runBlocking {
		val dashboard = StartRouteProvider { AppRoute.DASHBOARD }

		val fresh = AppNav()
		assertEquals(AppRoute.CALENDAR, fresh.route)
		fresh.applyStart(dashboard)
		assertEquals(AppRoute.DASHBOARD, fresh.route)

		val linked = AppNav(AppRoute.TASKS)
		linked.applyStart(dashboard)
		assertEquals(AppRoute.TASKS, linked.route)

		val moved = AppNav()
		moved.open(AppRoute.FAMILY)
		moved.applyStart(dashboard)
		assertEquals(AppRoute.FAMILY, moved.route)
	}
}
