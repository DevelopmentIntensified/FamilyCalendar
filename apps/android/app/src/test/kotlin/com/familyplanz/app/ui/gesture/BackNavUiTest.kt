package com.familyplanz.app.ui.gesture

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.GO_FORWARD
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #304: system back walks the route history, and the navbar's forward button redoes a back step. */
@RunWith(RobolectricTestRunner::class)
class BackNavUiTest {
	@get:Rule
	val rule = createAndroidComposeRule<ComponentActivity>()

	private val host = HostHarness(rule)

	private fun pressBack() = rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }

	private fun entryTag(route: AppRoute) = "entry-${route.name.lowercase()}"

	private fun entryShown(route: AppRoute) {
		host.waitFor { rule.onAllNodesWithTag(entryTag(route)).fetchSemanticsNodes().isNotEmpty() }
	}

	private fun forwardShown(): Boolean = rule.onAllNodesWithContentDescription(GO_FORWARD).fetchSemanticsNodes().isNotEmpty()

	@Test
	fun `back returns to the screen before and the app stays open`() {
		host.launch(PhoneTab.CALENDAR)
		entryShown(AppRoute.CALENDAR)

		rule.onNodeWithText("Dashboard").performClick()
		entryShown(AppRoute.DASHBOARD)

		pressBack()
		entryShown(AppRoute.CALENDAR)
		host.waitFor { rule.onAllNodesWithTag(entryTag(AppRoute.DASHBOARD)).fetchSemanticsNodes().isEmpty() }
		assertFalse(rule.runOnUiThread { rule.activity.isFinishing })
	}

	@Test
	fun `after back the forward button appears and returns`() {
		host.launch(PhoneTab.CALENDAR)
		entryShown(AppRoute.CALENDAR)

		rule.onNodeWithText("Dashboard").performClick()
		entryShown(AppRoute.DASHBOARD)
		assertFalse(forwardShown())

		pressBack()
		entryShown(AppRoute.CALENDAR)
		host.waitFor { forwardShown() }

		rule.onNodeWithContentDescription(GO_FORWARD).performClick()
		entryShown(AppRoute.DASHBOARD)
		host.waitFor { !forwardShown() }
	}

	@Test
	fun `no forward button before any back step`() {
		host.launch(PhoneTab.CALENDAR)
		entryShown(AppRoute.CALENDAR)

		rule.onNodeWithText("Dashboard").performClick()
		entryShown(AppRoute.DASHBOARD)
		assertFalse(forwardShown())
	}

	@Test
	fun `on the start screen the app leaves back to the system`() {
		host.launch(PhoneTab.CALENDAR)
		entryShown(AppRoute.CALENDAR)

		// Nothing behind the start screen: no callback, so the system closes the app.
		assertFalse(rule.runOnUiThread { rule.activity.onBackPressedDispatcher.hasEnabledCallbacks() })

		rule.onNodeWithText("Dashboard").performClick()
		entryShown(AppRoute.DASHBOARD)
		assertTrue(rule.runOnUiThread { rule.activity.onBackPressedDispatcher.hasEnabledCallbacks() })
	}
}
