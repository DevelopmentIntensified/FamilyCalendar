package com.familyplanz.app.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskPriority
import com.familyplanz.app.ui.calendar.model.monthCells
import com.familyplanz.app.ui.tasks.MetaSlot
import com.familyplanz.app.ui.tasks.SlotKind
import com.familyplanz.app.ui.tasks.lateLabel
import com.familyplanz.app.ui.tasks.priorityDot
import com.familyplanz.app.ui.tasks.taskMetaSlots
import com.familyplanz.app.ui.tasks.toneFor
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpBadgeText
import com.familyplanz.app.ui.theme.FpColors
import com.familyplanz.app.ui.theme.FpElevation
import com.familyplanz.app.ui.theme.FpKickerText
import com.familyplanz.app.ui.theme.FpKickerWideText
import com.familyplanz.app.ui.theme.FpLightColorScheme
import com.familyplanz.app.ui.theme.FpMetaText
import com.familyplanz.app.ui.theme.FpMicroText
import com.familyplanz.app.ui.theme.FpMotion
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpShapes
import com.familyplanz.app.ui.theme.FpTitleLargeHeavy
import com.familyplanz.app.ui.theme.FpTitleMediumBold
import com.familyplanz.app.ui.theme.FpTypography
import com.familyplanz.app.ui.theme.FpWordmarkText
import com.familyplanz.app.ui.theme.NotifTones
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

	/** The web month grid fills whole weeks with dated other-month days,
	 * not blanks (`MonthView.svelte:43-50` — lastMonthDays/nextMonthDays). */
	@Test
	fun month_grid_is_monday_first_in_whole_weeks() {
		val cells = monthCells(YearMonth.of(2026, 11), mondayFirst = true) // 1 Nov 2026 is a Sunday
		assertEquals(0, cells.size % 7)
		assertEquals(6, cells.indexOfFirst { !it.otherMonth })
		assertEquals(LocalDate.of(2026, 11, 1), cells[6].date)
		assertEquals(30, cells.count { !it.otherMonth })
	}

	// ---- #292 §1: the rows the clone added or fixed ----

	@Test
	fun the_clone_colour_roles_are_the_web_values() {
		assertEquals(hex(0xFFFFFFFF), colors.canvasWhite) // body has no bg (`app.html:45`)
		assertEquals(hex(0xFFF8FAFC), colors.canvasSlate) // `tasks/+page.svelte:364`
		assertEquals(hex(0xFF1E293B), colors.wordmark) // `Navbar.svelte:82` slate-800
		assertEquals(hex(0xFFFCD34D), colors.offline.border) // `OfflineBanner.svelte:63` amber-300
		assertEquals(hex(0xFFFEF3C7), colors.offline.surface) // amber-100
		assertEquals(hex(0xFF78350F), colors.offline.content) // amber-900
		assertEquals(hex(0xFF991B1B), colors.errorBanner.content) // red-800 guest urgent
		assertEquals(hex(0xFFF0FDF4), colors.successBanner.surface) // green-50 claimed/merged
		assertEquals(ChipTone(hex(0xFFDBEAFE), hex(0xFF1E40AF)), NotifTones.pending) // blue-100/800
		assertEquals(ChipTone(hex(0xFFD1FAE5), hex(0xFF065F46)), NotifTones.positive) // emerald-100/800
		assertEquals(Color.Black.copy(alpha = 0.4f), colors.scrim) // `bg-black/40`
		assertEquals(Color(0xFF0F172A).copy(alpha = 0.3f), colors.scrimSlate) // `bg-slate-900/30`
		assertEquals(ChipTone(Color(0xFFFED5CF), Color(0xFFC45E38)), colors.avatarAccount) // blush on terracotta
		assertEquals(Color(0xFFC4E9DA).copy(alpha = 0.6f), colors.mintPill) // "Sent again ✓"
	}

	@Test
	fun the_clone_type_steps_are_the_tailwind_sizes() {
		assertEquals(20f, FpTitleLargeHeavy.fontSize.value) // text-xl font-extrabold
		assertEquals(800, FpTitleLargeHeavy.fontWeight?.weight)
		assertEquals(18f, FpTitleMediumBold.fontSize.value) // calendar month label
		assertEquals(20f, FpMetaText.lineHeight.value) // TaskRow `leading-5`
		assertEquals(9f, FpMicroText.fontSize.value) // RSVP badge, avatar initial
		assertEquals(10f, FpBadgeText.fontSize.value) // BottomNav badge
		assertEquals(20f, FpWordmarkText.fontSize.value) // navbar wordmark
		assertEquals(0.08f, FpKickerText.letterSpacing.value) // tracking-[0.08em]
		assertEquals(0.1f, FpKickerWideText.letterSpacing.value) // tracking-widest
	}

	@Test
	fun the_clone_radii_and_elevations_are_the_tailwind_steps() {
		assertEquals(RoundedCornerShape(4.dp), FpShape.Xs) // `rounded`
		assertEquals(RoundedCornerShape(20.dp), FpShape.Rail) // `rounded-[1.25rem]`
		assertEquals(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp), FpShape.SheetTop)
		assertEquals(3.dp, FpElevation.Md) // shadow-md
		assertEquals(6.dp, FpElevation.Lg) // shadow-lg
		assertEquals(8.dp, FpElevation.Xl) // shadow-xl (FAB)
		assertEquals(12.dp, FpElevation.Xxl) // shadow-2xl (sheets)
	}

	@Test
	fun the_clone_motion_values_are_the_web_durations() {
		assertEquals(150, FpMotion.STANDARD_MS) // --mp-motion
		assertEquals(100, FpMotion.PAGE_FADE_MS) // page fade-in
		assertEquals(200, FpMotion.MENU_SLIDE_MS) // mobile menu
		assertEquals(150, FpMotion.BANNER_MS) // banner fade
		assertEquals(150, FpMotion.SHEET_RELEASE_MS) // sheet release
		assertEquals(100.dp, FpMotion.SheetCloseDistance) // drag > 100 px
		assertEquals(6_000L, FpMotion.TOAST_MS) // toasts.ts:14
		assertEquals(4, FpMotion.TOAST_STACK) // toasts.ts:18
		assertEquals(3_000L, FpMotion.SENT_AGAIN_MS) // "Sent again ✓"
		assertEquals(4_000L, FpMotion.SYNCED_MS) // "Synced N changes"
		assertEquals(2_000L, FpMotion.RECOUNT_MS) // recount after reconnect
	}
}
