package com.familyplanz.app.ui.calendar

import android.os.Looper
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.CalendarSource
import com.familyplanz.app.data.UnavailableCalendarSource
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.ui.calendar.form.DATE_HINT
import com.familyplanz.app.ui.calendar.form.EventFormSheet
import com.familyplanz.app.ui.calendar.model.CalendarForm
import com.familyplanz.app.ui.calendar.model.RepeatOption
import com.familyplanz.app.ui.gesture.FakeRepository
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import java.time.LocalDate
import java.time.ZoneId

/** #301: the form's submit path reaches the wire with every field, and a bad date keeps Create shut. */
@RunWith(RobolectricTestRunner::class)
class EventFormSubmitTest {
	@get:Rule
	val rule = createComposeRule()

	/** Every calendar call is refused except the update this test records. */
	private class RecordingSource : CalendarSource by UnavailableCalendarSource {
		val updates = mutableListOf<Pair<String, JsonObject>>()

		override suspend fun updateEvent(id: String, body: JsonObject): ApiResult<Unit> {
			updates += id to body
			return ApiResult.Ok(Unit)
		}
	}

	private val zone = ZoneId.of("UTC")
	private val day = LocalDate.of(2026, 11, 6)

	private fun idle() = shadowOf(Looper.getMainLooper()).idle()

	private fun viewModel(repo: FakeRepository, source: RecordingSource): CalendarViewModel {
		val vm = CalendarViewModel(repository = repo, source = source, zone = zone, now = { day })
		idle()
		return vm
	}

	private fun event() = CalendarEvent(
		id = "abc~2026-11-06T14:00:00.000Z",
		title = "Gym",
		startDate = "2026-11-06T14:00:00.000Z",
		endDate = "2026-11-06T15:00:00.000Z",
		allDay = false,
		location = null,
		occurrence = false,
		rsvpStatus = null,
		creatorName = null,
		day = "2026-11-06",
		masterId = "abc",
		occurrenceDate = "2026-11-06T14:00:00.000Z",
		recurrenceFrequency = "weekly",
	)

	private val formNops = CalendarFormActions(
		onCreate = { _, _ -> },
		onCreateTask = {},
		onEdit = {},
		onDuplicate = {},
		onUpdate = {},
		onSubmit = {},
		onClose = {},
		onQuickAdd = {},
		onParse = {},
	)

	@Test
	fun `editing the start time persists it`() {
		val repo = FakeRepository()
		val source = RecordingSource()
		val vm = viewModel(repo, source)

		vm.openEdit(event())
		vm.updateForm { it.copy(startTime = "20:00", endTime = "21:00") }
		vm.submitForm()
		idle()

		val (id, body) = source.updates.single()
		assertEquals("abc", id)
		assertEquals("2026-11-06T20:00", body["start"]?.jsonPrimitive?.content?.take(16))
	}

	@Test
	fun `creating with repeat and reminder and calendar sends all three`() {
		val repo = FakeRepository()
		val source = RecordingSource()
		val vm = viewModel(repo, source)

		vm.openCreate(day)
		vm.updateForm {
			it.copy(
				title = "Dinner",
				startTime = "19:00",
				repeat = RepeatOption.WEEKLY,
				reminderMinutes = 30,
				reminderSet = true,
				calendarId = "cal-2",
			)
		}
		vm.submitForm()
		idle()

		val request = repo.created.single()
		assertEquals("cal-2", request.calendarId)
		assertEquals(30, request.reminderMinutes)
		assertEquals("weekly", request.recurrenceFrequency)
	}

	@Test
	fun `a garbage date disables Create and shows the hint`() {
		val state = CalendarUiState(anchor = day, today = day, zone = zone)
		rule.setContent {
			FamilyPlanzTheme {
				EventFormSheet(CalendarForm(title = "Dinner", date = "not a date"), state, formNops)
			}
		}

		rule.onNodeWithTag("form-submit").assertIsNotEnabled()
		rule.onNodeWithText(DATE_HINT).assertExists()
	}
}
