package com.familyplanz.app.ui.gesture

import android.os.Looper
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.ParsedEventDto
import com.familyplanz.app.data.QuickParseResponse
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.calendar.CalendarQuickAdd
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.RobolectricTestRunner
import java.time.Duration
import java.time.YearMonth

/** Issue 269: quick-add phrase -> parsed form fields -> confirm creates (AC-CAL-29..31). */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w400dp-h1200dp")
class QuickAddUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule)
	private val date = YearMonth.now().atDay(10).toString()

	/** The auto-parse is debounced (#302); Robolectric's clock is frozen until a test advances it. */
	private fun pastAutoparseDebounce() {
		shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(CalendarQuickAdd.AUTOPARSE_DELAY_MS + 50))
		rule.waitForIdle()
	}

	private fun parseToFilledForm() {
		host.repo.parse = ApiResult.Ok(
			QuickParseResponse(
				parsed = ParsedEventDto(title = "Family dinner", date = date, startTime = "19:00"),
				method = "ai",
			),
		)
		host.launch(PhoneTab.CALENDAR)
		rule.onNodeWithTag("calendar-fab").performClick()
		host.waitForText("Parse")

		rule.onNodeWithTag("quick-add").performTextInput("family dinner on the 10th at 7")
		pastAutoparseDebounce()
		rule.onNodeWithText("Parse").performClick()

		host.waitFor { host.repo.parsed.isNotEmpty() }
		host.waitForText("Family dinner")
	}

	@Test
	fun parse_fills_the_form_and_confirm_creates_the_event() {
		parseToFilledForm()
		val fetchesBefore = host.repo.monthRequests.size

		rule.onNodeWithText("Create").performClick()

		host.waitFor { host.repo.created.size == 1 }
		val request = host.repo.created.single()
		assertEquals("Family dinner", request.title)
		assertTrue(request.start, request.start.startsWith("${date}T19:00"))
		host.waitForGone("Create")
		host.waitFor { host.repo.monthRequests.size > fetchesBefore }
	}

	@Test
	fun cancel_drops_the_draft_without_creating() {
		parseToFilledForm()

		rule.onNodeWithText("Cancel").performClick()

		host.waitForGone("Create")
		assertEquals(0, host.repo.created.size)
	}

	@Test
	fun an_unreadable_phrase_fails_inline() {
		host.repo.parse = ApiResult.Err(ApiError.Unsupported)
		host.launch(PhoneTab.CALENDAR)
		rule.onNodeWithTag("calendar-fab").performClick()
		host.waitForText("Parse")

		rule.onNodeWithTag("quick-add").performTextInput("zzz")
		pastAutoparseDebounce()
		rule.onNodeWithText("Parse").performClick()

		host.waitForText("Parsed wrong? Report this phrase")
		rule.onNodeWithText("Couldn't check that with the parser just now - fill the fields below manually.").assertExists()
		assertEquals(0, host.repo.created.size)

		// The report line stays as long as no report was sent (#302): a re-type keeps it offering.
		val parsedBefore = host.repo.parsed.size
		rule.onNodeWithTag("quick-add").performTextInput(" again")
		pastAutoparseDebounce()
		host.waitFor { host.repo.parsed.size > parsedBefore }
		host.waitForText("Parsed wrong? Report this phrase")
		assertEquals(0, host.repo.created.size)
	}
}
