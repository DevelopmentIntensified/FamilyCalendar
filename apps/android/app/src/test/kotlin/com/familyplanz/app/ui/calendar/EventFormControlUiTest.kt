package com.familyplanz.app.ui.calendar

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.CalendarDto
import com.familyplanz.app.ui.calendar.form.EventFormSheet
import com.familyplanz.app.ui.calendar.form.dateLabelOf
import com.familyplanz.app.ui.calendar.model.CalendarForm
import com.familyplanz.app.ui.calendar.model.RepeatOption
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.ZoneId

/** #309: reminder/repeat are exposed dropdowns, date and time rows open Material3 pickers, calendars carry a color disc. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h3200dp")
class EventFormControlUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val day = LocalDate.of(2026, 11, 6)
	private val zone = ZoneId.of("UTC")

	private val current = mutableStateOf(
		CalendarForm(
			title = "Dinner",
			date = "2026-11-06",
			startTime = "19:00",
			showMore = true,
			calendarId = "c1",
			repeat = RepeatOption.WEEKLY,
			repeatEvery = 1,
			reminderMinutes = 30,
			reminderSet = true,
		),
	)

	private val actions = CalendarFormActions(
		onCreate = { _, _ -> },
		onCreateTask = {},
		onEdit = {},
		onDuplicate = {},
		onUpdate = { update -> current.value = update(current.value) },
		onSubmit = {},
		onClose = {},
		onQuickAdd = {},
		onParse = {},
	)

	private val state = CalendarUiState(
		anchor = day,
		today = day,
		zone = zone,
		loading = false,
		data = CalendarData(
			calendars = listOf(
				CalendarDto(id = "c1", name = "Family", color = "#dd5822", kind = "family"),
				CalendarDto(id = "c2", name = "Personal", color = null, kind = "personal"),
			),
		),
	)

	private fun render() {
		rule.setContent {
			FamilyPlanzTheme {
				EventFormSheet(current.value, state, actions)
			}
		}
	}

	@Test
	fun `reminder_and_repeat_render_as_dropdowns`() {
		render()

		rule.onNodeWithText("30 min before").assertExists()
		rule.onNodeWithText("Weekly").assertExists()
		// The closed menu hides every other option the old pill row showed at once.
		rule.onAllNodesWithText("15 min before").assertCountEquals(0)
		rule.onAllNodesWithText("Doesn't repeat").assertCountEquals(0)
		rule.onAllNodesWithText("No reminder").assertCountEquals(0)

		// Tapping the field is what an exposed dropdown does: the whole option list appears, and a pick lands.
		rule.onNodeWithTag("form-reminder").performClick()
		rule.onNodeWithText("15 min before").assertExists()
		rule.onNodeWithText("1 hour before").performClick()
		rule.runOnIdle { assertEquals(60, current.value.reminderMinutes) }
		rule.onNodeWithText("1 hour before").assertExists()
	}

	@Test
	fun `tapping_the_date_row_opens_a_material_date_picker`() {
		render()

		rule.onNodeWithTag("form-date").performClick()
		rule.onNodeWithText("OK").assertExists()
		// The dialog's Cancel and the sheet's own Cancel both render.
		rule.onAllNodesWithText("Cancel").assertCountEquals(2)
		rule.onNodeWithText("OK").performClick()

		rule.runOnIdle { assertEquals("2026-11-06", current.value.date) }
		rule.onNodeWithText(dateLabelOf("2026-11-06")).assertExists()
	}

	@Test
	fun `tapping_the_time_row_opens_a_material_time_picker`() {
		render()

		rule.onNodeWithTag("form-start-time").performClick()
		rule.onNodeWithText("OK").assertExists()
		rule.onAllNodesWithText("Cancel").assertCountEquals(2)
		rule.onNodeWithText("OK").performClick()

		rule.runOnIdle { assertEquals("19:00", current.value.startTime) }
		rule.onAllNodesWithText("19:00").assertCountEquals(1)
	}

	@Test
	fun `the_calendar_options_carry_a_color_disc_each`() {
		render()

		// The disc sits inside the row's merged (clickable) semantics, so the raw tree is where its tag lives.
		rule.onAllNodesWithTag("form-cal-disc-0", useUnmergedTree = true).assertCountEquals(1)
		rule.onAllNodesWithTag("form-cal-disc-1", useUnmergedTree = true).assertCountEquals(1)
		assertTrue(
			rule.onNodeWithTag("form-cal-0").fetchSemanticsNode().boundsInRoot.height >= 44 * rule.density.density,
		)

		rule.onNodeWithTag("form-cal-1").performClick()
		rule.runOnIdle { assertEquals("c2", current.value.calendarId) }
	}
}
