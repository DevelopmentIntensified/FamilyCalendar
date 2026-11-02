package com.familyplanz.app.ui.gesture

import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.ParsedEventDto
import com.familyplanz.app.data.QuickParseResponse
import com.familyplanz.app.ui.PhoneTab
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.time.YearMonth

/** Issue 269: quick-add phrase -> editable draft card -> confirm creates. */
@RunWith(RobolectricTestRunner::class)
class QuickAddUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule)
	private val date = YearMonth.now().atDay(10).toString()

	private fun parseToDraft() {
		host.repo.parse = ApiResult.Ok(
			QuickParseResponse(
				parsed = ParsedEventDto(title = "Family dinner", date = date, startTime = "19:00"),
				method = "ai",
			),
		)
		host.launch(PhoneTab.CALENDAR)
		host.waitForText("Parse")

		rule.onNode(hasSetTextAction()).performTextInput("family dinner on the 10th at 7")
		rule.onNodeWithText("Parse").performClick()

		host.waitFor { host.repo.parsed == listOf("family dinner on the 10th at 7") }
		host.waitForText("Create event")
	}

	@Test
	fun parse_shows_a_draft_card_and_confirm_creates_the_event() {
		parseToDraft()
		rule.onNodeWithText("Family dinner").assertExists()
		val fetchesBefore = host.repo.monthRequests.size

		rule.onNodeWithText("Create event").performClick()

		host.waitFor { host.repo.created.size == 1 }
		val request = host.repo.created.single()
		assertEquals("Family dinner", request.title)
		assertTrue(request.start, request.start.startsWith("${date}T19:00"))
		host.waitForGone("Create event")
		host.waitFor { host.repo.monthRequests.size > fetchesBefore }
	}

	@Test
	fun cancel_drops_the_draft_without_creating() {
		parseToDraft()

		rule.onNodeWithText("Cancel").performClick()

		host.waitForGone("Create event")
		assertEquals(0, host.repo.created.size)
	}

	@Test
	fun an_unreadable_phrase_fails_inline() {
		host.launch(PhoneTab.CALENDAR)
		host.waitForText("Parse")

		rule.onNode(hasSetTextAction()).performTextInput("zzz")
		rule.onNodeWithText("Parse").performClick()

		host.waitForText("Could not read that phrase", substring = true)
		rule.onNodeWithText("Dismiss").assertExists()
	}
}
