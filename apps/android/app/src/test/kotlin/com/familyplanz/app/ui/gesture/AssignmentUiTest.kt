package com.familyplanz.app.ui.gesture

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.familyplanz.app.data.ApiResult
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Issue 269: Accept/Decline on a pending assignment addressed to me. */
@RunWith(RobolectricTestRunner::class)
class AssignmentUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule)

	private fun launchWithPending(assignedTo: String) {
		host.repo.tasks = ApiResult.Ok(listOf(task("a1", "Rake leaves", assignedTo = assignedTo, status = "pending")))
		host.launch()
		host.waitForText("Rake leaves")
	}

	@Test
	fun accept_sends_accepted_and_the_reply_buttons_go_away() {
		launchWithPending(FakeRepository.ME)

		rule.onNodeWithText("Accept").performClick()

		host.waitFor { host.repo.responses == listOf("a1" to "accepted") }
		host.waitForText("Task accepted - it moved to your list")
		host.waitForGone("Decline")
	}

	@Test
	fun decline_sends_declined_and_the_reply_buttons_go_away() {
		launchWithPending(FakeRepository.ME)

		rule.onNodeWithText("Decline").performClick()

		host.waitFor { host.repo.responses == listOf("a1" to "declined") }
		host.waitForText("Task declined - back to the assigner")
		host.waitForGone("Accept")
	}

	@Test
	fun a_pending_assignment_for_someone_else_offers_no_reply() {
		launchWithPending("someone-else")

		rule.onNodeWithText("Accept").assertDoesNotExist()
		rule.onNodeWithText("Decline").assertDoesNotExist()
	}
}
