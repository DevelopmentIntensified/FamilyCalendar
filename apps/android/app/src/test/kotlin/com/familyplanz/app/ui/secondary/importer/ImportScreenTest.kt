package com.familyplanz.app.ui.secondary.importer

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.ImportCalendarDto
import com.familyplanz.app.data.ImportUndoDto
import com.familyplanz.app.testing.fixturesCommit
import com.familyplanz.app.testing.fixturesPreviewDto
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #299: the .ics import page's three steps at phone width (ticket supersedes AC-SP-4's Custom Tab). */
@RunWith(RobolectricTestRunner::class)
class ImportScreenTest {
	@get:Rule
	val rule = createComposeRule()

	private val calendars = listOf(ImportCalendarDto("c1", "Personal Calendar"), ImportCalendarDto("c2", "Family"))

	private fun show(state: ImportUiState, actions: ImportActions = ImportActions()) {
		rule.setContent {
			FamilyPlanzTheme {
				Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
					ImportScreen(state, actions)
				}
			}
		}
	}

	private fun uploadState(files: List<ChosenFile> = emptyList(), error: String? = null, known: Boolean = true) = ImportUiState(
		calendars = if (known) calendars else emptyList(),
		calendarId = if (known) "c1" else null,
		chosen = files,
		pending = null,
		error = error,
	)

	@Test
	fun the_upload_step_offers_the_calendar_the_picker_and_a_disabled_preview_until_a_file_is_chosen() {
		var picked = 0
		show(uploadState(), ImportActions(onPickFiles = { picked++ }))

		rule.onNodeWithText(IMPORT_TITLE).assertExists()
		rule.onNodeWithText("Personal Calendar").assertExists()
		rule.onNodeWithText(IMPORT_CHOOSE).assertExists()
		rule.onNodeWithTag("import-preview-button").assertIsNotEnabled()

		rule.onNodeWithTag("import-drop-zone").performClick()
		assertEquals(1, picked)
	}

	@Test
	fun a_chosen_file_shows_its_name_and_size_and_can_be_removed() {
		var removed = -1
		show(
			uploadState(listOf(ChosenFile("family.ics", ByteArray(2048)))),
			ImportActions(onRemoveChosen = { removed = it }),
		)

		assertTrue(rule.onAllNodesWithText("family.ics", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
		assertTrue(rule.onAllNodesWithText("2 KB", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
		rule.onNodeWithContentDescription("Remove family.ics").performClick()

		assertEquals(0, removed)
	}

	@Test
	fun the_preview_lists_every_event_and_nothing_is_added_until_a_tick_is_confirmed() {
		var commits = 0
		val preview = importPreviewOf(fixturesPreviewDto())
		show(
			ImportUiState(calendars = calendars, calendarId = "c1", pending = null, preview = preview),
			ImportActions(onCommit = { commits++ }),
		)

		rule.onNodeWithTag("import-preview").assertExists()
		rule.onNodeWithText("2 events in family.ics").assertExists()
		rule.onNodeWithText("2 events · 1 likely duplicate").assertExists()
		rule.onNodeWithText("Soccer practice").assertExists()
		rule.onNodeWithText("Dentist").assertExists()
		rule.onNodeWithText("already there").assertExists()
		rule.onNodeWithTag("import-selected").assertExists()
		rule.onNodeWithText("Add 1 event").performClick()

		assertEquals(1, commits)
	}

	@Test
	fun the_result_step_names_what_landed_and_offers_undo() {
		var undone = 0
		show(
			ImportUiState(calendars = calendars, calendarId = "c1", pending = null, report = fixturesCommit()),
			ImportActions(onUndo = { undone++ }),
		)

		rule.onNodeWithTag("import-success").assertExists()
		rule.onNodeWithText("Added 2 events to your Personal Calendar").assertExists()
		rule.onNodeWithText("You ticked 2.").assertExists()
		rule.onNodeWithText("Skipped 1 already on the calendar when we checked again.").assertExists()
		rule.onNodeWithText("Tue, Nov 3, 2026").assertExists()
		rule.onNodeWithTag("import-undo").performClick()

		assertEquals(1, undone)
	}

	@Test
	fun an_undone_import_says_the_calendar_is_back_to_how_it_was() {
		show(
			ImportUiState(
				calendars = calendars,
				calendarId = "c1",
				pending = null,
				report = fixturesCommit(),
				undo = ImportUndoDto("Personal Calendar", removed = 2),
			),
		)

		rule.onNodeWithText("Removed 2 events from your Personal Calendar").assertExists()
		rule.onNodeWithText("Your calendar is back to how it was before this import.").assertExists()
	}

	@Test
	fun calendars_that_will_not_load_show_the_error_with_a_retry() {
		var retried = 0
		show(uploadState(error = "Network problem (timeout)", known = false), ImportActions(onRetryCalendars = { retried++ }))

		rule.onNodeWithTag("import-error").assertExists()
		rule.onNodeWithText("Try again").performClick()

		assertEquals(1, retried)
	}

	@Test
	fun the_empty_preview_explains_why_there_is_nothing_to_tick() {
		val empty = ImportUiState(
			calendars = calendars,
			calendarId = "c1",
			pending = null,
			preview = importPreviewOf(fixturesPreviewDto().copy(items = emptyList(), defaultSelection = emptyList(), duplicates = 0)),
		)

		show(empty)

		rule.onNodeWithText(IMPORT_EMPTY_PREVIEW).assertExists()
		rule.onNodeWithText("Start over").assertExists()
		assertEquals(0, rule.onAllNodesWithTag("import-item").fetchSemanticsNodes().size)
	}
}
