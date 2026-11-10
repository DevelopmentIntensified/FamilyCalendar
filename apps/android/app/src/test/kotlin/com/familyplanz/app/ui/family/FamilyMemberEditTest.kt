package com.familyplanz.app.ui.family

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.familyplanz.app.data.FamilyDetailDto
import com.familyplanz.app.data.FamilyDto
import com.familyplanz.app.data.RosterRowDto
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #305: member rows are read-only; a manager gets one "Edit" per non-creator
 * row that opens the only editors (the member sheet), and nobody removes
 * themselves.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h2600dp")
class FamilyMemberEditTest {
	@get:Rule
	val rule = createComposeRule()

	private val typeChanges = mutableListOf<Pair<String, String>>()
	private val roleChanges = mutableListOf<Pair<String, String>>()
	private var confirmed = 0
	private var state by mutableStateOf(ready("admin", "u-admin"))

	private fun ready(role: String, me: String) = FamilyDetailState.Ready(
		detail = FamilyDetailDto(
			family = FamilyDto(id = "fam-1", name = "Smiths"),
			members = listOf(
				RosterRowDto(
					userId = "u-creator",
					firstName = "Mum",
					lastName = "Smith",
					role = "creator",
					memberType = "parent",
				),
				RosterRowDto(
					userId = "u-admin",
					firstName = "Dad",
					lastName = "Smith",
					role = "admin",
					memberType = "parent",
				),
				RosterRowDto(
					userId = "u-kid",
					firstName = "Ada",
					lastName = "Smith",
					role = "member",
					memberType = "child",
				),
			),
			currentUserRole = role,
			currentUserId = me,
		),
		name = "Smiths",
		color = "#3b82f6",
	)

	/** The screen over a state that the callbacks move the way the ViewModel does. */
	private fun show(initial: FamilyDetailState.Ready) {
		state = initial
		rule.setContent {
			FamilyPlanzTheme {
				FamilyDetailScreen(
					state = state,
					actions = FamilyDetailActions(
						onSetType = { member, type -> typeChanges += member.userId to type },
						onSetRole = { member, role -> roleChanges += member.userId to role },
						onAskRemove = { state = state.copy(removeTarget = it) },
						onConfirmRemove = { confirmed++ },
						onCancelRemove = { state = state.copy(removeTarget = null) },
						onOpenSheet = { state = state.copy(sheetMember = it) },
						onCloseSheet = { state = state.copy(sheetMember = null) },
					),
				)
			}
		}
	}

	@Test
	fun `a plain member sees no edit button and no editors`() {
		show(ready("member", "u-kid"))
		rule.onAllNodesWithText("Edit").assertCountEquals(0)
		rule.onAllNodesWithText("MEMBER TYPE").assertCountEquals(0)
	}

	@Test
	fun `a manager gets one edit button per non-creator row and no inline editors`() {
		show(ready("admin", "u-admin"))
		rule.onAllNodesWithText("Edit").assertCountEquals(2)
		rule.onAllNodesWithTag("member-edit-u-creator").assertCountEquals(0)
		rule.onAllNodesWithText("MEMBER TYPE").assertCountEquals(0)
	}

	@Test
	fun `edit opens the member's editors and closing changes nothing`() {
		show(ready("admin", "u-admin"))
		rule.onNodeWithTag("member-edit-u-kid").performScrollTo().performClick()
		rule.onNodeWithText("Actions for Ada Smith").assertExists()
		rule.onNodeWithText("MEMBER TYPE").assertExists()
		rule.onNodeWithText("ROLE").assertExists()
		rule.onNodeWithText("Remove member").assertExists()
		rule.onNodeWithText("Close \u2715").performClick()
		rule.onAllNodesWithText("MEMBER TYPE").assertCountEquals(0)
		assertEquals(emptyList<Pair<String, String>>(), typeChanges)
		assertEquals(emptyList<Pair<String, String>>(), roleChanges)
	}

	@Test
	fun `a role tap in the sheet reports the new role`() {
		show(ready("admin", "u-admin"))
		rule.onNodeWithTag("member-edit-u-kid").performScrollTo().performClick()
		rule.onNode(hasText("Admin") and hasAnyAncestor(hasTestTag("member-sheet")), useUnmergedTree = true).performClick()
		assertEquals(listOf("u-kid" to "admin"), roleChanges)
	}

	@Test
	fun `remove asks before deleting`() {
		show(ready("admin", "u-admin"))
		rule.onNodeWithTag("member-edit-u-kid").performScrollTo().performClick()
		rule.onNodeWithText("Remove member").performClick()
		rule.onNodeWithText("Remove Ada Smith from this family?").assertExists()
		assertEquals(0, confirmed)
		rule.onNodeWithText("Remove").performClick()
		assertEquals(1, confirmed)
	}

	@Test
	fun `nobody removes themselves`() {
		show(ready("admin", "u-admin"))
		rule.onNodeWithTag("member-edit-u-admin").performScrollTo().performClick()
		rule.onNodeWithText("Actions for Dad Smith").assertExists()
		rule.onAllNodesWithText("Remove member").assertCountEquals(0)
	}
}
