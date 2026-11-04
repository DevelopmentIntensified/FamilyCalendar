package com.familyplanz.app.ui.secondary.print

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
import androidx.compose.ui.unit.dp
import com.familyplanz.app.testing.fixturesPrint
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #299: the native Print page (ticket supersedes AC-SP-4's Custom Tab) — fridge sheet + system print. */
@RunWith(RobolectricTestRunner::class)
class PrintScreenTest {
	@get:Rule
	val rule = createComposeRule()

	private fun show(state: Load<com.familyplanz.app.data.PrintMonthDto>, actions: PrintActions = PrintActions()) {
		rule.setContent {
			FamilyPlanzTheme {
				Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
					PrintScreen(state, actions)
				}
			}
		}
	}

	@Test
	fun the_sheet_draws_the_month_its_weeks_and_the_overflow_count() {
		show(Load.Loaded(fixturesPrint()))

		rule.onNodeWithText("November 2026").assertExists()
		rule.onNodeWithText("THE SMITHS · PERSONAL").assertExists()
		rule.onNodeWithText("MON").assertExists()
		rule.onNodeWithTag("fridge-sheet").assertExists()
		rule.onNodeWithTag("print-cell-2026-11-03").assertExists()
		rule.onNodeWithText("+2").assertExists()
		rule.onNodeWithText("familyplanz.com").assertExists()
	}

	@Test
	fun prev_next_jump_and_print_run_their_actions() {
		val month = fixturesPrint()
		val shown = mutableListOf<Int>()
		var jumped = 0
		var printed = 0
		val actions = PrintActions(
			onShow = { shown += it.month },
			onJumpToNow = { jumped++ },
			onPrint = { printed++ },
		)
		show(Load.Loaded(month), actions)

		rule.onNodeWithTag("print-prev").performClick()
		rule.onNodeWithTag("print-next").performClick()
		rule.onNodeWithTag("print-jump").performClick()
		rule.onNodeWithTag("print-button").performClick()

		assertEquals(listOf(10, 12), shown)
		assertEquals(1, jumped)
		assertEquals(1, printed)
	}

	@Test
	fun the_current_month_hides_the_jump_button() {
		show(Load.Loaded(fixturesPrint().copy(isCurrentMonth = true)))

		rule.onNodeWithTag("print-jump").assertDoesNotExist()
		rule.onNodeWithTag("print-prev").assertExists()
	}

	@Test
	fun a_failed_month_offers_retry() {
		var retried = 0
		show(Load.Failed("Network problem (timeout)"), PrintActions(onRetry = { retried++ }))

		rule.onNodeWithText("Try again").performClick()

		assertEquals(1, retried)
	}
}
