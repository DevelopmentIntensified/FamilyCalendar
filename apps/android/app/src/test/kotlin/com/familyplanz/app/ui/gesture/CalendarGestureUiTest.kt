package com.familyplanz.app.ui.gesture

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.calendar.monthNameOf
import java.time.YearMonth
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Issue 269: Calendar month navigation and the day filter. */
@RunWith(RobolectricTestRunner::class)
class CalendarGestureUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule)
	private val now = YearMonth.now()

	private fun heading(month: YearMonth) = "${monthNameOf(month.month)} ${month.year}"

	@Test
	fun next_moves_the_heading_forward_and_requests_that_month() {
		host.launch(PhoneTab.CALENDAR)
		host.waitForText(heading(now))

		rule.onNodeWithContentDescription("Next period").performClick()

		host.waitForText(heading(now.plusMonths(1)))
		host.waitFor { host.repo.monthRequests.lastOrNull() == now.plusMonths(1) }
	}

	@Test
	fun prev_moves_the_heading_back_and_requests_that_month() {
		host.launch(PhoneTab.CALENDAR)
		host.waitForText(heading(now))

		rule.onNodeWithContentDescription("Previous period").performClick()

		host.waitForText(heading(now.minusMonths(1)))
		host.waitFor { host.repo.monthRequests.lastOrNull() == now.minusMonths(1) }
	}

	@Test
	fun day_view_shows_only_that_days_events_and_all_days_restores() {
		val early = now.atDay(3).toString()
		val late = now.atDay(20).toString()
		host.repo.events = ApiResult.Ok(listOf(event("e1", "Piano lesson", early), event("e2", "Soccer game", late)))
		host.launch(PhoneTab.CALENDAR)
		host.waitForText("Soccer game")

		rule.onNodeWithTag("cell-$early").performClick()

		// Cell tap opens the DayActionSheet (MonthDays.svelte:96-108); the day
		// view is reached from the sheet's "Open Day View" row.
		host.waitForText("Open Day View")
		rule.onNodeWithText("Open Day View").performClick()

		host.waitForGone("Soccer game")
		rule.onNodeWithText("Piano lesson").assertExists()
		host.waitForText("Back")

		rule.onNodeWithText("Back").performClick()

		host.waitForText("Soccer game")
		host.waitForText(heading(now))
	}
}

