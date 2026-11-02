package com.familyplanz.app.ui.gesture

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.ui.PhoneTab
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Issue 269: error states render inline (401 -> token screen, offline -> snack/inline). */
@RunWith(RobolectricTestRunner::class)
class ErrorStatesUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule)

	@Test
	fun no_stored_token_starts_on_the_token_screen() {
		host.launch(token = null)

		host.waitForText("Save and sync")
		assertTrue(host.repo.allTasksCalls == 0)
	}

	@Test
	fun task_401_swaps_to_the_token_screen_with_the_reason() {
		host.repo.tasks = ApiResult.Err(ApiError.Unauthorized)
		host.launch()

		host.waitForText("Save and sync")
		rule.onNodeWithText(ApiError.Unauthorized.message).assertExists()
	}

	@Test
	fun calendar_401_swaps_to_the_token_screen() {
		host.repo.events = ApiResult.Err(ApiError.Unauthorized)
		host.launch(PhoneTab.CALENDAR)

		host.waitForText("Save and sync")
		host.waitForText("Sign in again", substring = true)
	}

	@Test
	fun network_error_with_cache_shows_cached_tasks_and_the_offline_snack() {
		host.repo.tasks = ApiResult.Err(ApiError.Network("timeout"))
		host.repo.cachedTasks = listOf(task("c1", "Cached chore"))
		host.launch()

		host.waitForText("Offline - showing the last synced tasks")
		rule.onNodeWithText("Cached chore").assertExists()
	}

	@Test
	fun network_error_without_cache_fails_inline_and_retry_refetches() {
		host.repo.tasks = ApiResult.Err(ApiError.Network("timeout"))
		host.launch()
		host.waitForText("Retry")
		assertTrue(rule.onAllNodesWithText("Network problem (timeout)").fetchSemanticsNodes().isNotEmpty())
		val callsBefore = host.repo.allTasksCalls

		rule.onNodeWithText("Retry").performClick()

		host.waitFor { host.repo.allTasksCalls > callsBefore }
	}

	@Test
	fun calendar_network_error_without_cache_fails_inline() {
		host.repo.events = ApiResult.Err(ApiError.Network("timeout"))
		host.launch(PhoneTab.CALENDAR)

		host.waitForText("Network problem (timeout)")
		rule.onNodeWithText("Retry").assertExists()
	}
}
