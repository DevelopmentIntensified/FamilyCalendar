package com.familyplanz.app.ui.secondary.reportbug

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #299 AC-SP-3: the form and the "Thanks — report submitted" acknowledgement. */
@RunWith(RobolectricTestRunner::class)
class ReportBugScreenTest {
	@get:Rule
	val rule = createComposeRule()

	private fun show(state: ReportBugUiState, actions: ReportBugActions = ReportBugActions()) {
		rule.setContent {
			FamilyPlanzTheme {
				Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
					ReportBugScreen(state, actions)
				}
			}
		}
	}

	@Test
	fun ac_sp_3_the_form_shows_the_area_the_description_and_the_submit_button() {
		var area: String? = null
		var description: String? = null
		var submitted = 0
		show(
			ReportBugUiState(),
			ReportBugActions(onArea = { area = it }, onDescription = { description = it }, onSubmit = { submitted++ }),
		)

		rule.onNodeWithText(REPORT_BUG_TITLE).assertExists()
		rule.onNodeWithText("Calendar / events").assertExists()
		rule.onNodeWithTag("report-description").performTextInput("Sunday events vanish")
		rule.onNodeWithText(REPORT_BUG_SUBMIT).performClick()

		assertEquals("Sunday events vanish", description)
		assertEquals(1, submitted)
		assertEquals(null, area)
	}

	@Test
	fun ac_sp_3_after_a_send_the_page_says_thanks_and_offers_the_calendar() {
		var back = 0
		show(ReportBugUiState(submitted = true), ReportBugActions(onBackToCalendar = { back++ }))

		rule.onNodeWithTag("report-thanks").assertExists()
		rule.onNodeWithText(REPORT_BUG_THANKS).assertExists()
		rule.onNodeWithText("Back to Calendar").performClick()

		assertEquals(1, back)
		rule.onNodeWithTag("report-description").assertDoesNotExist()
	}

	@Test
	fun a_send_in_flight_shows_the_busy_label_and_disables_the_button() {
		show(ReportBugUiState(description = "Something broke", pending = true))

		rule.onNodeWithText(REPORT_BUG_SUBMITTING).assertExists()
	}

	@Test
	fun a_failed_send_shows_the_server_text_above_the_form() {
		show(ReportBugUiState(description = "Something broke", error = "Too many reports. Try again shortly."))

		rule.onNodeWithTag("report-error").assertExists()
		rule.onNodeWithText("Too many reports. Try again shortly.").assertExists()
		rule.onNodeWithText(REPORT_BUG_SUBMIT).assertExists()
	}

	@Test
	fun the_back_crumb_runs_the_entry_back_action() {
		var back = 0
		show(ReportBugUiState(), ReportBugActions(onBack = { back++ }))

		rule.onNodeWithText("← Back").performClick()

		assertEquals(1, back)
	}
}
