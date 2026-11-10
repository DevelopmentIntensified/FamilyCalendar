package com.familyplanz.app.ui.calendar

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.calendar.model.RangeSelection
import com.familyplanz.app.ui.calendar.model.visibleOf
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.abs

/**
 * Issue #307: an Add-mode drag picks the range under the finger (the grid must
 * never re-add its scroll offset) and the range is drawn before the finger
 * lifts. Outside Add mode a long-press picks one hour and a moving press
 * scrolls instead of selecting.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
class DayViewRangeSelectTest {
	@get:Rule
	val rule = createComposeRule()

	// A day that is never "today", so the grid opens scrolled to 07:00: viewport y = (hour - 7) * 56 dp.
	private val day = LocalDate.of(2031, 3, 4)
	private var state by mutableStateOf(
		CalendarUiState(anchor = day, today = day.minusDays(1), zone = ZoneId.of("UTC"), view = CalendarView.DAY, loading = false),
	)

	private fun show(addMode: Boolean) {
		state = state.copy(addMode = addMode, range = null)
		rule.setContent {
			FamilyPlanzTheme { CalendarDayView(state, visibleOf(state), actions { state = state.copy(range = it) }) }
		}
		rule.waitForIdle()
		// The grid opens scrolled to 07:00; the viewport math in every case below assumes that offset.
		rule.waitUntil(2_000) { scrollY() > 0f }
	}

	private fun scrollY(): Float =
		rule.onNodeWithTag("day-grid").fetchSemanticsNode().config[SemanticsProperties.VerticalScrollAxisRange].value()

	@Test
	fun add_mode_drag_from_nine_to_ten_selects_exactly_that_hour_without_scrolling() {
		show(addMode = true)
		val before = scrollY()

		rule.onNodeWithTag("day-grid").performTouchInput {
			down(Offset(center.x, 112.dp.toPx()))
			moveTo(Offset(center.x, 140.dp.toPx()))
			moveTo(Offset(center.x, 168.dp.toPx()))
			up()
		}
		rule.waitForIdle()

		assertEquals(RangeSelection(day, 540, 600), state.range)
		assertEquals(before, scrollY(), 0.5f)
		rule.onNodeWithTag("range-popover").assertExists()
	}

	@Test
	fun the_highlight_follows_the_finger_before_release() {
		show(addMode = true)
		val density = rule.density.density
		val grid = rule.onNodeWithTag("day-grid").fetchSemanticsNode().boundsInRoot

		rule.onNodeWithTag("day-grid").performTouchInput {
			down(Offset(center.x, 112.dp.toPx()))
			moveTo(Offset(center.x, 140.dp.toPx()))
		}
		rule.waitForIdle()

		assertNull(state.range)
		rule.onAllNodesWithTag("range-popover").assertCountEquals(0)
		val highlight = rule.onNodeWithTag("range-highlight", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
		assertTrue(abs((highlight.top - grid.top) - 112 * density) <= 1f)
		assertTrue(abs(highlight.height - 28 * density) <= 1f)

		rule.onNodeWithTag("day-grid").performTouchInput { up() }
		rule.waitForIdle()
	}

	@Test
	fun a_tap_in_add_mode_selects_nothing() {
		show(addMode = true)

		rule.onNodeWithTag("day-grid").performTouchInput {
			down(Offset(center.x, 112.dp.toPx()))
			up()
		}
		rule.waitForIdle()

		assertNull(state.range)
		rule.onAllNodesWithTag("range-highlight", useUnmergedTree = true).assertCountEquals(0)
	}

	@Test
	fun a_long_press_outside_add_mode_selects_one_hour_from_the_pressed_time() {
		show(addMode = false)

		rule.onNodeWithTag("day-grid").performTouchInput { longClick(Offset(center.x, 280.dp.toPx())) }
		rule.waitForIdle()

		assertEquals(RangeSelection(day, 720, 780), state.range)
	}

	@Test
	fun a_moving_press_outside_add_mode_scrolls_and_selects_nothing() {
		show(addMode = false)
		val before = scrollY()

		rule.onNodeWithTag("day-grid").performTouchInput { swipeUp(startY = 300.dp.toPx(), endY = 100.dp.toPx()) }
		rule.waitForIdle()

		assertTrue(scrollY() > before)
		assertNull(state.range)
	}
}

private fun actions(onRange: (RangeSelection?) -> Unit) = CalendarActions(
	nav = CalendarNavActions(
		onPrev = {}, onNext = {}, onToday = {}, onPickMonth = {}, onSetView = {},
		onOpenDay = {}, onBack = {}, onSwipe = { _, _ -> },
	),
	sheets = CalendarSheetActions(onCellTap = {}, onOpen = {}, onClose = {}, onMenu = {}),
	filters = CalendarFilterActions(
		onToggleCalendar = {}, onHideAll = {}, onToggleAssignee = {},
		onShowEveryone = {}, onQuery = {}, onDismissFirstRun = {},
	),
	modes = CalendarModeActions(
		onSetSelection = {}, onToggleSelect = {}, onToggleAdd = {}, onRange = onRange, onRetry = {},
	),
	form = CalendarFormActions(
		onCreate = { _, _ -> }, onCreateTask = {}, onEdit = {}, onDuplicate = {},
		onUpdate = { it }, onSubmit = {}, onClose = {}, onQuickAdd = {}, onParse = {},
	),
	events = CalendarEventActions(onRsvp = { _, _ -> }, onDelete = { _, _ -> }, onAddChecklist = { _, _ -> }, onCompleteTask = {}),
	bulk = CalendarBulkActions(
		onDelete = {}, onDone = {}, onCalendar = {}, onLocation = {},
		onAttendants = {}, onPlan = {}, onApplyPlan = {}, onDiscardPlan = {},
	),
)
