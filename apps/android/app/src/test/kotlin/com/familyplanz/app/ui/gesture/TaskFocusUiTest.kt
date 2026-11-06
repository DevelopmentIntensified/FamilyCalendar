package com.familyplanz.app.ui.gesture

import android.os.Looper
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import java.time.Duration
import java.time.Instant

/** #289 TaskFocus fusion: live focus time, Focusing chip, start/stop through the desktop. */
@RunWith(RobolectricTestRunner::class)
class TaskFocusUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule)

	private fun startedMinutesAgo(minutes: Long) = Instant.now().minus(Duration.ofMinutes(minutes)).toString()

	private fun launch(vararg tasks: com.familyplanz.app.data.TaskDto) {
		host.repo.tasks = ApiResult.Ok(tasks.toList())
		host.launch()
		host.waitForText(tasks.first().title)
	}

	@Test
	fun running_task_shows_live_time_and_the_focusing_chip_idle_task_its_closed_minutes() {
		launch(
			focusTask("t1", "Write report", focusMinutes = 10, focusStartedAt = startedMinutesAgo(25)),
			focusTask("t2", "Read book", focusMinutes = 40),
		)

		host.waitForText("35m focus", substring = true)
		rule.onNodeWithText("40m focus", substring = true).assertExists()
		assertEquals(1, rule.onAllNodesWithTag("focusing-chip").fetchSemanticsNodes().size)
		rule.onNodeWithTag("focusing-chip").assertExists()
		rule.onNodeWithText("Focusing now: Write report").assertExists()
	}

	@Test
	fun no_focus_time_and_not_running_shows_no_focus_text_or_chip() {
		launch(task("t1", "Walk the dog"))

		rule.onNodeWithText("m focus", substring = true).assertDoesNotExist()
		rule.onNodeWithText("Focusing now", substring = true).assertDoesNotExist()
		assertEquals(0, rule.onAllNodesWithTag("focusing-chip").fetchSemanticsNodes().size)
	}

	@Test
	fun start_shows_pending_disabled_until_the_server_answers_then_toasts_without_flipping_state() {
		val gate = CompletableDeferred<Unit>()
		host.repo.focusGate = gate
		launch(task("t1", "Walk the dog"))

		rule.onNodeWithText("Focus on desktop").performClick()

		host.waitFor { host.repo.focusStarts == listOf("t1") }
		host.waitForText("Asking…")
		rule.onNodeWithText("Asking…").assertIsNotEnabled()
		rule.onNodeWithText("Stop focus").assertIsNotEnabled()

		gate.complete(Unit)

		host.waitForText("Asked your desktop to start focus")
		rule.onNodeWithText("Focus on desktop").assertIsEnabled()
		assertEquals(0, rule.onAllNodesWithTag("focusing-chip").fetchSemanticsNodes().size)
	}

	@Test
	fun a_refresh_shortly_after_a_command_shows_the_servers_truth() {
		launch(task("t1", "Walk the dog"))
		val readsBefore = host.repo.allTasksCalls

		rule.onNodeWithText("Focus on desktop").performClick()
		host.waitForText("Asked your desktop to start focus")
		host.repo.tasks = ApiResult.Ok(listOf(focusTask("t1", "Walk the dog", focusStartedAt = startedMinutesAgo(0))))
		assertEquals(readsBefore, host.repo.allTasksCalls)

		shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(4))

		host.waitFor { host.repo.allTasksCalls == readsBefore + 1 }
		host.waitFor { rule.onAllNodesWithTag("focusing-chip").fetchSemanticsNodes().isNotEmpty() }
		rule.onNodeWithText("Walk the dog").assertExists()
	}

	@Test
	fun the_running_row_offers_stop_which_asks_the_desktop_to_stop() {
		launch(focusTask("t1", "Write report", focusStartedAt = startedMinutesAgo(5)))

		rule.onNodeWithText("Stop").performClick()

		host.waitFor { host.repo.focusStops == 1 }
		host.waitForText("Asked your desktop to stop")
		assertEquals(emptyList<String>(), host.repo.focusStarts)
	}

	@Test
	fun a_server_without_the_command_api_says_so() {
		host.repo.focusResult = ApiResult.Err(ApiError.Unsupported)
		launch(task("t1", "Walk the dog"))

		rule.onNodeWithText("Focus on desktop").performClick()

		host.waitForText("This FamilyPlanz server can't reach TaskFocus yet")
		rule.onNodeWithText("Walk the dog").assertExists()
	}

	@Test
	fun a_failed_command_shows_the_error_and_keeps_the_list() {
		host.repo.focusResult = ApiResult.Err(ApiError.Server("Database connection lost"))
		launch(task("t1", "Walk the dog"))

		rule.onNodeWithText("Focus on desktop").performClick()

		host.waitForText("Database connection lost")
		rule.onNodeWithText("Walk the dog").assertExists()
		rule.onNodeWithText("Focus on desktop").assertIsEnabled()
	}
}



