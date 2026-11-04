package com.familyplanz.app.ui.secondary.stats

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.testing.fixturesStats
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #299 AC-SP-1: Menu › Task Stats shows the streak, "Recently completed" and "This month" from G15. */
@RunWith(RobolectricTestRunner::class)
class StatsScreenTest {
	@get:Rule
	val rule = createComposeRule()

	private fun show(state: Load<com.familyplanz.app.data.StatsResponse>, onRetry: () -> Unit = {}) {
		rule.setContent {
			FamilyPlanzTheme {
				Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
					StatsScreen(state, onRetry)
				}
			}
		}
	}

	@Test
	fun ac_sp_1_the_page_shows_the_streak_recent_completions_and_this_month() {
		show(Load.Loaded(fixturesStats()))

		rule.onNodeWithText("Task stats").assertExists()
		rule.onNodeWithTag("streak-hero").assertExists()
		rule.onNodeWithTag("streak-weeks").assertTextEquals("4")
		rule.onNodeWithText("Best: 9 weeks · one frozen").assertExists()
		assertEquals(7, rule.onAllNodesWithTag("streak-week").fetchSemanticsNodes().size)

		rule.onNodeWithTag("recently-completed").assertExists()
		rule.onNodeWithText("Water the plants").assertExists()
		rule.onNodeWithText("Take out bins").assertExists()
		rule.onNodeWithText("↻ repeating").assertExists()

		rule.onNodeWithText("This month").assertExists()
		rule.onNodeWithText("November 2026").assertExists()
		rule.onNodeWithTag("month-completed").assertTextEquals("7")
		rule.onNodeWithTag("month-recurring").assertTextEquals("2")
	}

	@Test
	fun ac_sp_1_the_two_assignment_charts_draw_one_bar_per_person() {
		show(Load.Loaded(fixturesStats()))

		rule.onNodeWithText("Tasks land on").assertExists()
		rule.onNodeWithText("Tasks come from").assertExists()
		rule.onNodeWithText("Cleo").assertExists()
		assertEquals(5, rule.onAllNodesWithTag("bar-fill").fetchSemanticsNodes().size)
	}

	@Test
	fun empty_completion_history_keeps_the_card_with_its_own_words() {
		show(Load.Loaded(fixturesStats().copy(stats = fixturesStats().stats.copy(recentlyCompleted = emptyList()))))

		rule.onNodeWithText(STATS_EMPTY_RECENT).assertExists()
	}

	@Test
	fun a_failed_load_offers_the_retry_the_entry_wires_to_the_view_model() {
		var retried = 0
		show(Load.Failed(ApiError.Network("timeout").message)) { retried++ }

		rule.onNodeWithText("Network problem (timeout)").assertExists()
		rule.onNodeWithText("Try again").performClick()

		assertEquals(1, retried)
	}
}
