package com.familyplanz.app.ui.secondary.archive

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.testing.fixturesArchive
import com.familyplanz.app.testing.fixturesArchiveGate
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #299 AC-SP-2: Menu › Archive lists past events within the plan's retention, or the plan-gate copy. */
@RunWith(RobolectricTestRunner::class)
class ArchiveScreenTest {
	@get:Rule
	val rule = createComposeRule()

	private fun show(state: Load<com.familyplanz.app.data.ArchiveResponse>, actions: ArchiveActions = ArchiveActions()) {
		rule.setContent {
			FamilyPlanzTheme {
				Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
					ArchiveScreen(state, actions)
				}
			}
		}
	}

	@Test
	fun ac_sp_2_an_allowed_plan_lists_the_events_grouped_by_month_inside_the_retention_window() {
		var opened: String? = null
		show(Load.Loaded(fixturesArchive()), ArchiveActions(onOpenEvent = { opened = it }))

		rule.onNodeWithText("Archive").assertExists()
		rule.onNodeWithTag("retention-gate").assertExists()
		rule.onNodeWithText("ON THE FAMILY PLAN").assertExists()
		rule.onNodeWithText("You can look back 30 days").assertExists()
		rule.onNodeWithText("and events stay in the archive for 90 days").assertExists()
		rule.onNodeWithText("2 families").assertExists()
		rule.onNodeWithText("November 2026").assertExists()
		assertEquals(3, rule.onAllNodesWithTag("archive-event").fetchSemanticsNodes().size)
		rule.onNodeWithTag("retention-track-fill").assertExists()

		rule.onNodeWithText("Autumn fair").performClick()
		assertEquals("e1", opened)
	}

	@Test
	fun ac_sp_2_a_plan_without_the_archive_shows_the_gate_copy_and_the_upgrade_button() {
		var upgraded = 0
		show(Load.Loaded(fixturesArchiveGate()), ArchiveActions(onUpgrade = { upgraded++ }))

		rule.onNodeWithText("Archive view unlocks on the Family plan.").assertExists()
		rule.onNodeWithText(ARCHIVE_UPGRADE).performClick()

		assertEquals(1, upgraded)
		rule.onNodeWithTag("archive-month").assertDoesNotExist()
	}

	@Test
	fun a_plan_with_the_archive_but_no_events_says_so() {
		show(Load.Loaded(fixturesArchive().copy(events = emptyList())))

		rule.onNodeWithText(ARCHIVE_EMPTY).assertExists()
	}

	@Test
	fun a_gate_without_a_reason_still_says_archive_is_not_available() {
		show(Load.Loaded(fixturesArchiveGate().copy(reason = null)))

		rule.onNodeWithText(ARCHIVE_NOT_ALLOWED).assertExists()
	}

	@Test
	fun a_failed_load_offers_retry_and_the_crumb_goes_back_to_the_calendar() {
		var retried = 0
		var calendar = 0
		show(
			Load.Failed(ApiError.Network("timeout").message),
			ArchiveActions(onRetry = { retried++ }, onOpenCalendar = { calendar++ }),
		)

		rule.onNodeWithText("Try again").performClick()
		rule.onNodeWithText("Calendar").performClick()

		assertEquals(1, retried)
		assertEquals(1, calendar)
	}
}
