package com.familyplanz.app.ui.gesture

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.familyplanz.app.ui.NotificationAccess
import com.familyplanz.app.ui.ReminderPermissionBanner
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Issue #271: POST_NOTIFICATIONS gets an inline rationale, never a silent failure. */
@RunWith(RobolectricTestRunner::class)
class ReminderPermissionUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val taps = mutableListOf<String>()

	private fun show(access: NotificationAccess) = rule.setContent {
		MaterialTheme {
			ReminderPermissionBanner(
				access = access,
				onAllow = { taps += "allow" },
				onOpenSettings = { taps += "settings" },
				onDismiss = { taps += "dismiss" },
			)
		}
	}

	@Test
	fun ask_state_explains_and_requests_permission() {
		show(NotificationAccess.ASK)
		rule.onNodeWithText("Get reminders and family updates").assertExists()
		rule.onNodeWithText("Allow notifications").performClick()
		assertEquals(listOf("allow"), taps)
	}

	@Test
	fun blocked_state_says_reminders_are_off_and_links_settings() {
		show(NotificationAccess.BLOCKED)
		rule.onNodeWithText("Notifications are off").assertExists()
		rule.onNodeWithText("Open settings").performClick()
		rule.onNodeWithText("Not now").performClick()
		assertEquals(listOf("settings", "dismiss"), taps)
	}

	@Test
	fun granted_state_shows_nothing() {
		show(NotificationAccess.GRANTED)
		assertTrue(rule.onAllNodesWithText("Allow notifications").fetchSemanticsNodes().isEmpty())
		assertTrue(rule.onAllNodesWithText("Event reminders are off").fetchSemanticsNodes().isEmpty())
	}
}
