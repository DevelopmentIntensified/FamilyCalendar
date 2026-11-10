package com.familyplanz.app.ui.share

import android.content.Intent
import android.os.Looper
import com.familyplanz.app.ui.calendar.CalendarSheet
import com.familyplanz.app.ui.calendar.CalendarViewModel
import com.familyplanz.app.ui.gesture.FakeRepository
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.SHARE_TEXT_PREFIX
import com.familyplanz.app.ui.nav.StartRouteProvider
import com.familyplanz.app.ui.nav.navArgText
import java.time.LocalDate
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

/**
 * #312: sharing text to the app. The one route argument slot holds either a
 * reminder's day or a share's text; the `shared:` prefix is what keeps the
 * two apart, and every consumer demuxes through [navArgText].
 */
class ShareTargetRoutingTest {
	@Test
	fun `a bare date argument reads as a day`() {
		val (day, text) = navArgText("2027-03-05")
		assertEquals(LocalDate.of(2027, 3, 5), day)
		assertNull(text)
	}

	@Test
	fun `a text argument reads as shared text`() {
		val (day, text) = navArgText("shared:Lunch Friday at noon")
		assertNull(day)
		assertEquals("Lunch Friday at noon", text)
		// A date-like phrase a friend shared stays text: the prefix wins over a bare day.
		val (sharedDay, sharedText) = navArgText("shared:2027-03-05")
		assertNull(sharedDay)
		assertEquals("2027-03-05", sharedText)
	}

	@Test
	fun `a non date argument is neither`() {
		val (day, text) = navArgText("hello")
		assertNull(day)
		assertNull(text)
		val (noDay, noText) = navArgText(null)
		assertNull(noDay)
		assertNull(noText)
	}
}

/** The running app's share path: [AppNav.openShareText] hands the text over through the Calendar argument. */
@RunWith(RobolectricTestRunner::class)
class ShareTargetAppNavTest {
	@Test
	fun `openShareText lands the prefixed text on the calendar argument`() = runBlocking {
		val nav = AppNav(AppRoute.CALENDAR)
		nav.applyStart(StartRouteProvider { AppRoute.DASHBOARD }) // start does not interfere
		assertEquals(AppRoute.CALENDAR, nav.route)

		val withShare = AppNav(AppRoute.DASHBOARD)
		withShare.open(AppRoute.CALENDAR, SHARE_TEXT_PREFIX + "Lunch Friday at noon")
		assertNull(withShare.takeArg(AppRoute.TASKS))
		val (day, text) = navArgText(withShare.takeArg(AppRoute.CALENDAR))
		assertNull(day)
		assertEquals("Lunch Friday at noon", text)

		val viaMethod = AppNav(AppRoute.DASHBOARD)
		viaMethod.openShareText("Lunch Friday at noon")
		assertEquals(AppRoute.CALENDAR, viaMethod.route)
		val (sharedDay, sharedText) = navArgText(viaMethod.takeArg(AppRoute.CALENDAR))
		assertNull(sharedDay)
		assertEquals("Lunch Friday at noon", sharedText)

		// Already on Calendar: a new argument must still be observable to the showing tab.
		val live = AppNav(AppRoute.CALENDAR)
		val before = live.argSerial
		live.openShareText("Lunch Friday at noon")
		assertTrue(live.argSerial > before)
		assertEquals("Lunch Friday at noon", navArgText(live.takeArg(AppRoute.CALENDAR)).second)
	}

	/** The ack is the web's copy under a consumed PWA share; the text itself lands in Quick Add. */
	@Test
	fun `open create from shared text prefills quick add and acks`() {
		val vm = CalendarViewModel(FakeRepository())
		shadowOf(Looper.getMainLooper()).idle()

		vm.openCreateFromSharedText("Lunch Friday at noon")
		shadowOf(Looper.getMainLooper()).idle()

		val ui = vm.ui.value
		assertEquals("Lunch Friday at noon", ui.quickAdd)
		assertEquals(CalendarViewModel.SHARED_TARGET_ACK, ui.toast)
		assertTrue(ui.sheet is CalendarSheet.Form)
	}
}

/** The manifest slot itself: a future manifest edit cannot drop SEND silently. */
@RunWith(RobolectricTestRunner::class)
class SendIntentResolvesTest {
	@Test
	fun `the app shares text into it`() {
		val pm = RuntimeEnvironment.getApplication().packageManager
		val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain" }
		val mine = pm.queryIntentActivities(intent, 0).firstOrNull { it.activityInfo.packageName == "com.familyplanz.app" }
		assertNotNull("ACTION_SEND mimeType text/plain resolves to this app", mine)
		assertEquals("MainActivity", mine?.activityInfo?.name?.substringAfterLast('.'))
	}
}
