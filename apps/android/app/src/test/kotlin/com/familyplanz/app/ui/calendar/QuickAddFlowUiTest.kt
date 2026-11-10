package com.familyplanz.app.ui.calendar

import android.os.Looper
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.ParsedEventDto
import com.familyplanz.app.data.QuickParseResponse
import com.familyplanz.app.data.QuickParseResult
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.gesture.HostHarness
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.Duration
import java.time.YearMonth

/**
 * #302: the create form's Quick Add over the real host - typing auto-parses
 * after the 300 ms debounce, a multi phrase hangs the "N events detected"
 * panel, and the parse-wrong report settles into its ack line.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h2000dp")
class QuickAddFlowUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule)
	private val date = YearMonth.now().atDay(10).toString()

	private fun openCreateForm() {
		host.launch(PhoneTab.CALENDAR)
		rule.onNodeWithTag("calendar-fab").performClick()
		host.waitForText("Parse")
	}

	/** Robolectric's clock is frozen; advancing past the debounce lets the auto parse land. */
	private fun type(phrase: String) {
		rule.onNodeWithTag("quick-add").performTextInput(phrase)
		shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(CalendarQuickAdd.AUTOPARSE_DELAY_MS + 50))
		rule.waitForIdle()
	}

	private fun multiPhrase() {
		host.repo.parse = ApiResult.Ok(
			QuickParseResponse(
				results = listOf(
					QuickParseResult(ParsedEventDto(title = "Dinner", date = "2026-11-06")),
					QuickParseResult(ParsedEventDto(title = "Movie", date = "2026-11-07")),
				),
				method = "regex-list",
			),
		)
	}

	@Test
	fun typing_a_phrase_auto_parses_within_a_second() {
		host.repo.parse = ApiResult.Ok(
			QuickParseResponse(
				parsed = ParsedEventDto(title = "Family dinner", date = date, startTime = "19:00"),
				method = "ai",
			),
		)
		openCreateForm()

		type("family dinner on the 10th at 7")

		host.waitFor { host.repo.parsed.isNotEmpty() }
		assertEquals("family dinner on the 10th at 7", host.repo.parsed.first())
		host.waitForText("Family dinner")
	}

	@Test
	fun multi_events_panel_offers_both() {
		multiPhrase()
		openCreateForm()

		type("dinner Friday and movie Saturday")

		rule.onNodeWithTag("quick-add-multi").assertExists()
		rule.onNodeWithText("Create 2 events").assertExists()
		rule.onNodeWithText("Create 2 events").performClick()

		host.waitFor { host.repo.created.size == 2 }
		assertEquals(listOf("Dinner", "Movie"), host.repo.created.map { it.title })
	}

	@Test
	fun the_parse_report_is_almost_written_right() {
		host.repo.parse = ApiResult.Err(ApiError.Unsupported)
		openCreateForm()

		type("zzz")
		host.waitForText("Parsed wrong? Report this phrase")

		rule.onNodeWithText("Parsed wrong? Report this phrase").performClick()

		host.waitForText("Thanks — we'll teach the parser.")
		rule.onAllNodesWithText("Parsed wrong? Report this phrase").fetchSemanticsNodes().isEmpty()
	}

	@Test
	fun a_multi_panel_can_be_dismissed() {
		multiPhrase()
		openCreateForm()

		type("dinner Friday and movie Saturday")
		rule.onNodeWithTag("quick-add-multi").assertExists()

		rule.onNodeWithText("Just the first").performClick()

		rule.onAllNodesWithTag("quick-add-multi").fetchSemanticsNodes().isEmpty()
		assertEquals(0, host.repo.created.size)
	}
}
