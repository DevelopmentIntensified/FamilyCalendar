package com.familyplanz.app.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskPriority
import com.familyplanz.app.ui.calendar.monthCells
import com.familyplanz.app.ui.tasks.MetaSlot
import com.familyplanz.app.ui.tasks.SlotKind
import com.familyplanz.app.ui.tasks.lateLabel
import com.familyplanz.app.ui.tasks.priorityDot
import com.familyplanz.app.ui.tasks.taskMetaSlots
import com.familyplanz.app.ui.tasks.toneFor
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpColors
import com.familyplanz.app.ui.theme.FpLightColorScheme
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpShapes
import com.familyplanz.app.ui.theme.FpTypography
import com.familyplanz.app.ui.theme.STATUS_BAR_ARGB
import com.familyplanz.app.ui.theme.avatarTone
import java.time.LocalDate
import java.time.YearMonth
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Issue 291: the native theme is the website's palette, chip vocabulary and grid. */
class WebThemeTest {
	private val colors = FpColors()
	private val today = LocalDate.of(2026, 11, 3)

	private fun hex(argb: Long) = Color(argb)

	private fun task(
		due: String? = null,
		priority: TaskPriority = TaskPriority.NORMAL,
		family: Boolean = false,
		status: String? = null,
		completed: Boolean = false,
	) = Task(
		id = "t1",
		title = "Rake leaves",
		completed = completed,
		priority = priority,
		focusMinutes = null,
		dueDate = due,
		recurringLabel = null,
		assignedName = null,
		familyTask = family,
		assignmentStatus = status,
		assignedTo = null,
	)

	@Test
	fun scheme_maps_the_web_palette() {
		// tailwind primary-600 == app.html theme-color
		assertEquals(hex(0xFFDD5822), FpLightColorScheme.primary)
		assertEquals(Color.White, FpLightColorScheme.onPrimary)
		assertEquals(hex(0xFFFEF7F0), FpLightColorScheme.primaryContainer) // primary-50
		assertEquals(hex(0xFFB8441C), FpLightColorScheme.onPrimaryContainer) // primary-700
		assertEquals(Color.White, FpLightColorScheme.surface)
		assertEquals(hex(0xFFF8FAFC), FpLightColorScheme.background) // slate-50
		assertEquals(hex(0xFF0F172A), FpLightColorScheme.onSurface) // slate-900
		assertEquals(hex(0xFFE2E8F0), FpLightColorScheme.outlineVariant) // slate-200 card border
		assertEquals(hex(0xFFCBD5E1), FpLightColorScheme.outline) // slate-300 input border
		assertEquals(hex(0xFFDC2626), FpLightColorScheme.error) // red-600
		assertEquals(hex(0xFFDD5822).toArgb(), STATUS_BAR_ARGB)
	}

	@Test
	fun radii_and_type_follow_tailwind() {
		assertEquals(FpShape.Cell, RoundedCornerShape(14.dp)) // MonthDayCell
		assertEquals(FpShapes.large, RoundedCornerShape(16.dp)) // rounded-2xl
		assertEquals(30f, FpTypography.headlineMedium.fontSize.value) // text-3xl
		assertEquals(11f, FpTypography.labelSmall.fontSize.value) // BottomNav label
	}

	@Test
	fun chips_use_the_web_task_row_palette() {
		assertEquals(ChipTone(hex(0xFFCCFBF1), hex(0xFF115E59)), colors.category) // teal-100/800
		val family = taskMetaSlots(task(family = true), today = today).single { it.kind == SlotKind.FAMILY }
		assertEquals(ChipTone(hex(0xFFE0E7FF), hex(0xFF4338CA)), colors.toneFor(family)) // indigo
		val pending = taskMetaSlots(task(status = "pending"), today = today).single { it.kind == SlotKind.STATUS }
		assertEquals(ChipTone(hex(0xFFFEF3C7), hex(0xFFB45309)), colors.toneFor(pending)) // amber
		assertEquals(hex(0xFFEF4444), colors.priorityDot(TaskPriority.HIGH)) // red-500
		assertEquals(hex(0xFFCBD5E1), colors.priorityDot(TaskPriority.NORMAL)) // slate-300
	}

	@Test
	fun due_tone_is_overdue_red_today_amber_else_neutral() {
		fun dueTone(due: String) =
			colors.toneFor(taskMetaSlots(task(due = due), today = today).single { it.kind == SlotKind.DUE })
		assertEquals(colors.late, dueTone("2026-11-01"))
		assertEquals(colors.dueToday, dueTone("2026-11-03T00:00:00.000Z"))
		assertEquals(colors.due, dueTone("2026-11-09"))
		assertEquals(ChipTone(hex(0xFFFEE2E2), hex(0xFFB91C1C)), colors.late) // red-100/700
	}

	@Test
	fun late_label_matches_web_late_chip() {
		assertEquals("1 day late", lateLabel("2026-11-02", today))
		assertEquals("5 days late", lateLabel("2026-10-29", today))
		assertNull(lateLabel("2026-11-03", today))
		assertNull(lateLabel("garbage", today))
		// a done task is never late
		val done = taskMetaSlots(task(due = "2026-10-29", completed = true), today = today)
		assertEquals(emptyList<MetaSlot>(), done.filter { it.kind == SlotKind.LATE })
	}

	@Test
	fun avatar_tone_hashes_like_avatar_color_ts() {
		// "ab" = 97 + 98 = 195; 195 % 8 = 3 -> sky
		assertEquals(ChipTone(hex(0xFFE0F2FE), hex(0xFF0369A1)), avatarTone("ab"))
	}

	@Test
	fun month_grid_is_monday_first_in_whole_weeks() {
		val cells = monthCells(YearMonth.of(2026, 11)) // 1 Nov 2026 is a Sunday
		assertEquals(0, cells.size % 7)
		assertEquals(6, cells.indexOfFirst { it != null })
		assertEquals(LocalDate.of(2026, 11, 1), cells[6])
		assertEquals(30, cells.count { it != null })
	}
}
