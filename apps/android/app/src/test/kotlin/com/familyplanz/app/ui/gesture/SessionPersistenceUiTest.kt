package com.familyplanz.app.ui.gesture

import com.familyplanz.app.ui.auth.GUEST_LABEL
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Owner report 2026-11-03: "sessions expire immediately". Before sign-in the
 * calendar's first month load 401s (no token yet); that stale 401 must not
 * end the session the user opens a moment later.
 */
@RunWith(RobolectricTestRunner::class)
class SessionPersistenceUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule, auth = FakeAuthSource())

	@Test
	fun a_pre_sign_in_calendar_401_does_not_end_the_new_session() {
		host.repo.events = ApiResult.Err(ApiError.Unauthorized)
		host.launch(token = null)
		host.waitForText(GUEST_LABEL)

		host.repo.events = ApiResult.Ok(emptyList())
		host.repo.tasks = ApiResult.Ok(listOf(task("t1", "Water the plants")))
		rule.onNodeWithText(GUEST_LABEL).performClick()
		host.waitForText("Water the plants")

		rule.mainClock.advanceTimeBy(5_000)
		rule.waitForIdle()
		rule.onNodeWithText("Water the plants").assertExists()
		assertEquals(false, runBlocking { host.store.token() }.isNullOrBlank())
	}
}
