package com.familyplanz.app.ui.nav

import androidx.compose.runtime.saveable.SaverScope
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

	/** Per-lane deep links (`AppModules.DEEP_LINKS`) as the Family lane now declares
	 * its own web paths (`FamilyModule.deepLinks`, c16d749 L5a); a path nobody
	 * claims stays null. */
	@Test
	fun `deep links resolve by longest prefix`() {
		assertEquals(AppRoute.TASKS, DeepLinks.resolve("/calendar/tasks", links))
		assertEquals(AppRoute.TASKS, DeepLinks.resolve("https://familyplanz.com/calendar/tasks?x=1", links))
		assertEquals(AppRoute.CALENDAR, DeepLinks.resolve("/calendar/2026-11-03", links))
		assertEquals(AppRoute.ALERTS, DeepLinks.resolve("/calendar/notifications", links + DeepLink("/calendar/notifications", AppRoute.ALERTS)))
		assertEquals(AppRoute.FAMILY, DeepLinks.resolve("/family/abc", links))
		assertNull(DeepLinks.resolve(null, links))
		assertNull(DeepLinks.resolve("/nope", links))
	}

	@Test
	fun `open link moves to the claiming lane, an unclaimed link stays put`() {
		val nav = AppNav(AppRoute.CALENDAR, links)
		assertFalse(nav.openLink("/nope"))
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

	@Test
	fun `back returns to the previous route and forward redoes it`() {
		val nav = AppNav(AppRoute.CALENDAR)
		nav.open(AppRoute.DASHBOARD)
		assertTrue(nav.canGoBack)
		assertFalse(nav.canGoForward)

		assertTrue(nav.back())
		assertEquals(AppRoute.CALENDAR, nav.route)
		assertTrue(nav.canGoForward)
		assertFalse(nav.canGoBack)

		assertTrue(nav.forward())
		assertEquals(AppRoute.DASHBOARD, nav.route)
		assertFalse(nav.canGoForward)
		assertTrue(nav.canGoBack)
	}

	@Test
	fun `back on the start route reports false so the app can close`() {
		val nav = AppNav(AppRoute.CALENDAR)
		assertFalse(nav.back())
		assertEquals(AppRoute.CALENDAR, nav.route)
		assertFalse(nav.canGoBack)
	}

	@Test
	fun `a new destination drops the forward history`() {
		val nav = AppNav(AppRoute.CALENDAR)
		nav.open(AppRoute.DASHBOARD)
		nav.open(AppRoute.TASKS)
		assertTrue(nav.back())
		assertEquals(AppRoute.DASHBOARD, nav.route)
		assertTrue(nav.canGoForward)

		nav.open(AppRoute.GROCERIES)
		assertFalse(nav.canGoForward)

		assertTrue(nav.back())
		assertEquals(AppRoute.DASHBOARD, nav.route)
		assertTrue(nav.back())
		assertEquals(AppRoute.CALENDAR, nav.route)
		assertFalse(nav.back())
	}

	@Test
	fun `re-opening the shown route adds no history`() {
		val nav = AppNav(AppRoute.CALENDAR)
		nav.open(AppRoute.TASKS)
		nav.open(AppRoute.TASKS)
		assertTrue(nav.back())
		assertEquals(AppRoute.CALENDAR, nav.route)
		assertFalse(nav.canGoBack)
	}

	@Test
	fun `the start setting replaces the placeholder without adding history`() = runBlocking {
		val nav = AppNav()
		nav.applyStart(StartRouteProvider { AppRoute.DASHBOARD })
		assertEquals(AppRoute.DASHBOARD, nav.route)
		assertTrue(nav.startDecided)
		assertFalse(nav.canGoBack)
	}

	@Test
	fun `a deep link joins the history like any navigation`() {
		val nav = AppNav(AppRoute.CALENDAR, links)
		assertTrue(nav.openLink("/calendar/tasks"))
		assertEquals(AppRoute.TASKS, nav.route)
		assertTrue(nav.canGoBack)
		assertTrue(nav.back())
		assertEquals(AppRoute.CALENDAR, nav.route)
		assertTrue(nav.canGoForward)
	}

	@Test
	fun `a back step drops a waiting argument`() {
		val nav = AppNav(AppRoute.TASKS)
		nav.open(AppRoute.CALENDAR, "2027-03-05")
		assertTrue(nav.back())
		assertTrue(nav.forward())
		assertEquals(AppRoute.CALENDAR, nav.route)
		assertNull(nav.takeArg(AppRoute.CALENDAR))
	}

	@Test
	fun `the histories survive a save and restore`() {
		val saver = AppNav.saver(links)
		val nav = AppNav(AppRoute.CALENDAR, links)
		nav.open(AppRoute.DASHBOARD)
		nav.open(AppRoute.TASKS)
		nav.back()
		val saved = with(saver) { SaverScope { true }.save(nav) }
		val restored = saver.restore(saved!!)!!
		assertEquals(AppRoute.DASHBOARD, restored.route)
		assertEquals(listOf(AppRoute.CALENDAR), restored.backStack)
		assertEquals(listOf(AppRoute.TASKS), restored.forwardStack)
		assertEquals(saved, with(saver) { SaverScope { true }.save(restored) })
	}

	@Test
	fun `an undecided nav restores undecided and still follows the setting`() = runBlocking {
		val saver = AppNav.saver(links)
		val saved = with(saver) { SaverScope { true }.save(AppNav()) }
		val restored = saver.restore(saved!!)!!
		assertFalse(restored.startDecided)
		assertFalse(restored.canGoBack)
		restored.applyStart(StartRouteProvider { AppRoute.DASHBOARD })
		assertEquals(AppRoute.DASHBOARD, restored.route)
	}
}
