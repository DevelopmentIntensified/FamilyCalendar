package com.familyplanz.app.ui.calendar

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import com.familyplanz.app.data.CalendarDto
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.LocalDate
import java.time.ZoneId

/** #308: every detail row draws its own icon; rows without a value stay hidden. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w400dp-h1600dp-xhdpi")
class EventSheetDetailIconsTest {
	@get:Rule
	val rule = createAndroidComposeRule<ComponentActivity>()

	private val zone = ZoneId.of("UTC")
	private val day = LocalDate.of(2026, 11, 6)

	private fun event(full: Boolean) = CalendarEvent(
		id = "e1", title = "Dentist", startDate = "2026-11-06T14:00:00Z", endDate = "2026-11-06T15:00:00Z",
		allDay = false, location = if (full) "47 Main Street" else null, occurrence = false, rsvpStatus = null,
		creatorName = if (full) "Mum" else null, day = "2026-11-06", calendarId = if (full) "c1" else "",
		reminderMinutes = if (full) 30 else null, localDay = day,
	)

	private fun show(event: CalendarEvent) {
		val state = CalendarUiState(
			anchor = day, today = day, zone = zone, loading = false,
			data = CalendarData(calendars = listOf(CalendarDto("c1", "Family", "#3b82f6", "family"))),
		)
		val nops = EventSheetActions(
			onClose = {}, onRsvp = { _, _ -> }, onDelete = { _, _ -> }, onEdit = {}, onDuplicate = {},
			onAddChecklist = { _, _ -> }, onCompleteTask = {},
		)
		rule.setContent { FamilyPlanzTheme { EventSheet(event, state, checklist = null, actions = nops) } }
		rule.waitForIdle()
	}

	/** The pixels of one row's icon, cut out of a drawing of the whole window. */
	private fun iconPixels(kind: String): Bitmap {
		val view = rule.activity.window.decorView
		val shot = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
		rule.runOnUiThread { view.draw(Canvas(shot)) }
		val box = rule.onNodeWithTag("detail-icon-$kind", useUnmergedTree = true).fetchSemanticsNode().boundsInWindow
		return Bitmap.createBitmap(shot, box.left.toInt(), box.top.toInt(), box.width.toInt(), box.height.toInt())
	}

	private fun colours(bitmap: Bitmap): Set<Int> {
		val pixels = IntArray(bitmap.width * bitmap.height)
		bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
		return pixels.toSet()
	}

	@Test
	fun `every_row_kind_draws_its_own_icon`() {
		show(event(full = true))
		val kinds = listOf("date", "time", "calendar", "creator", "location", "reminder")
		val icons = kinds.map(::iconPixels)
		kinds.forEachIndexed { index, kind ->
			assertTrue("$kind tile is blank", colours(icons[index]).size > 1)
		}
		for (i in kinds.indices) {
			for (j in i + 1 until kinds.size) {
				assertTrue("${kinds[i]} and ${kinds[j]} render the same icon", !icons[i].sameAs(icons[j]))
			}
		}
	}

	@Test
	fun `rows_without_a_value_stay_hidden`() {
		show(event(full = false))
		listOf("date", "time").forEach { kind ->
			assertTrue(
				"$kind row should always show",
				rule.onAllNodesWithTag("detail-row-$kind", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty(),
			)
		}
		listOf("calendar", "creator", "location", "reminder").forEach { kind ->
			assertTrue(
				"$kind row has no value and should stay hidden",
				rule.onAllNodesWithTag("detail-row-$kind", useUnmergedTree = true).fetchSemanticsNodes().isEmpty(),
			)
		}
	}
}
