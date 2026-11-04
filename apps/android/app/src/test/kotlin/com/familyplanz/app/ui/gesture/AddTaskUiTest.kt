package com.familyplanz.app.ui.gesture

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Issue 269 (+#270): add-task bar — blank title error, pending row, server row. */
@RunWith(RobolectricTestRunner::class)
class AddTaskUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule)

	@Test
	fun submitting_a_blank_title_shows_the_inline_error_and_sends_nothing() {
		host.launch()
		host.waitForText("No tasks yet")

		rule.onNodeWithTag("mention-field").performImeAction()

		host.waitForText("Title is required")
		assertEquals(0, host.repo.createdTasks.size)
	}

	@Test
	fun add_shows_a_pending_row_then_the_server_row() {
		val gate = CompletableDeferred<Unit>()
		host.repo.createTaskGate = gate
		host.launch()
		host.waitForText("No tasks yet")

		rule.onNodeWithTag("mention-field").performTextInput("Buy milk")
		rule.onNodeWithText("Add").performClick()

		host.waitForText("saving…")
		rule.onNodeWithText("Buy milk").assertExists()
		rule.onNode(isToggleable()).assertIsNotEnabled()
		assertEquals("Buy milk", host.repo.createdTasks.single().title)

		gate.complete(Unit)

		host.waitForGone("saving…")
		host.waitForText("Added \"Buy milk\" to your tasks")
		rule.onNodeWithText("Buy milk").assertExists()
		rule.onNodeWithText("Focus").assertExists()
	}
}
