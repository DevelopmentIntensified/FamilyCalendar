package com.familyplanz.app.ui.gesture

import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.familyplanz.app.data.ApiResult
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Issue 269: Tasks tab gestures — complete toggle, focus start/stop. */
@RunWith(RobolectricTestRunner::class)
class TaskGestureUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule)

	private fun launchWithOneTask() {
		host.repo.tasks = ApiResult.Ok(listOf(task("t1", "Walk the dog")))
		host.launch()
		host.waitForText("Walk the dog")
	}

	@Test
	fun tapping_the_checkbox_toggles_completion_and_the_row_updates() {
		launchWithOneTask()
		rule.onNode(isToggleable()).assertIsOff()
		rule.onNodeWithText("Focus").assertExists()

		rule.onNode(isToggleable()).performClick()

		host.waitFor { host.repo.toggled == listOf("t1") }
		host.waitForGone("Focus")
		rule.onNode(isToggleable()).assertIsOn()
	}

	@Test
	fun tapping_focus_queues_a_start_for_that_task_and_says_so() {
		launchWithOneTask()

		rule.onNodeWithText("Focus").performClick()

		host.waitFor { host.repo.focusStarts == listOf("t1") }
		host.waitForText("Asked your desktop to start focus")
	}

	@Test
	fun tapping_stop_focus_queues_a_stop_and_says_so() {
		launchWithOneTask()

		rule.onNodeWithText("Stop focus").performClick()

		host.waitFor { host.repo.focusStops == 1 }
		host.waitForText("Asked your desktop to stop")
		assertEquals(emptyList<String>(), host.repo.focusStarts)
	}
}
