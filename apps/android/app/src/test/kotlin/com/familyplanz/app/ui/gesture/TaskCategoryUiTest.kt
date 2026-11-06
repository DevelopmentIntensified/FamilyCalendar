package com.familyplanz.app.ui.gesture

import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTextInput
import com.familyplanz.app.data.ApiResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Issue #280: category chip on task rows + category picker in the add-task bar. */
@RunWith(RobolectricTestRunner::class)
class TaskCategoryUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule)

	/** The add-task title field (a full plain input matches search/tag too). */
	private fun typeTitle(title: String) {
		rule.onNodeWithTag("mention-field").performTextInput(title)
	}

	/** Due/category/visibility live behind the "More" toggle (AC-TK-6). */
	private fun openMore() {
		rule.onNodeWithTag("add-more").performClick()
	}

	@Test
	fun task_rows_show_their_category_chip_and_uncategorised_rows_none() {
		host.repo.tasks = ApiResult.Ok(listOf(task("t1", "Ship it", category = "Work"), task("t2", "Nap")))
		host.launch()
		host.waitForText("Nap")

		val chips = rule.onAllNodesWithTag("category-chip").fetchSemanticsNodes()
		assertEquals(1, chips.size)
		rule.onNodeWithTag("category-chip").assertTextEquals("Work")
	}

	@Test
	fun picking_a_listed_category_sends_it_and_the_new_row_shows_it() {
		host.repo.categories = ApiResult.Ok(listOf(category("Home"), category("Work")))
		host.launch()
		host.waitForText("No tasks yet")

		typeTitle("Ship it")
		openMore()
		rule.onNodeWithText("Category").performClick()
		host.waitForText("Home")
		rule.onNodeWithText("Work").performClick()
		host.waitForText("Category: Work")
		rule.onNodeWithText("Add").performClick()

		host.waitFor { host.repo.createdTasks.size == 1 }
		assertEquals("Work", host.repo.createdTasks.single().category)
		host.waitForText("Added \"Ship it\".")
		// The row is below the fold (add card + toolbar fill the viewport);
		// scroll the LazyColumn to the first group so the row composes.
		rule.onNodeWithTag("tasks-list").performScrollToIndex(3)
		host.waitFor { rule.onAllNodesWithTag("category-chip").fetchSemanticsNodes().isNotEmpty() }
		rule.onNodeWithTag("category-chip").assertTextEquals("Work")
	}

	@Test
	fun free_entry_sends_a_new_name_and_no_pick_sends_no_category() {
		host.launch()
		host.waitForText("No tasks yet")

		typeTitle("Run errands")
		openMore()
		rule.onNodeWithText("Category").performClick()
		rule.onNodeWithTag("category-input").performTextInput("  Errands ")
		rule.onNodeWithText("Use").performClick()
		host.waitForText("Category: Errands")
		rule.onNodeWithText("Add").performClick()
		host.waitFor { host.repo.createdTasks.size == 1 }
		assertEquals("Errands", host.repo.createdTasks.single().category)

		// The picker closes after Use; reopen it to clear for the no-category create.
		rule.onNodeWithText("Category: Errands").performClick()
		rule.onNodeWithText("No category").performClick()
		typeTitle("Nap")
		rule.onNodeWithText("Add").performClick()
		host.waitFor { host.repo.createdTasks.size == 2 }
		assertNull(host.repo.createdTasks[1].category)
	}
}
