package com.familyplanz.app.ui.theme

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/** Tailwind radii the site uses (rounded-md … rounded-3xl), as Material slots. */
val FpShapes = Shapes(
	// rounded-md: calendar event chips
	extraSmall = RoundedCornerShape(6.dp),
	// rounded-lg: task rows, small buttons, segmented toggle items
	small = RoundedCornerShape(8.dp),
	// rounded-xl: toasts, alert/notice cards, segmented toggle track
	medium = RoundedCornerShape(12.dp),
	// rounded-2xl: AuthCard, TasksHeader, AddTaskCard
	large = RoundedCornerShape(16.dp),
	// rounded-3xl: calendar frame top
	extraLarge = RoundedCornerShape(24.dp),
)

/** Radii with no Material slot. */
object FpShape {
	/** MonthDayCell `rounded-[14px]` (--mp-r-cell 0.875rem). */
	val Cell = RoundedCornerShape(14.dp)

	/** AuthInput `rounded-[10px]`. */
	val Input = RoundedCornerShape(10.dp)

	/** `rounded-full`: primary buttons, chips, the day disc, avatars. */
	val Pill = CircleShape

	/** `rounded` (4): overflow "+N more", the ⌘K hint. */
	val Xs = RoundedCornerShape(4.dp)

	/** `rounded-[1.25rem]` (20): account rail card, section card. */
	val Rail = RoundedCornerShape(20.dp)

	/** Bottom sheets: `rounded-t-2xl`, 16 on the top corners only (`DayActionSheet.svelte:84`). */
	val SheetTop = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
}

/**
 * Tailwind 3.4.19 `boxShadow` steps as Compose shadow elevations (spec §1.6).
 * Compose draws one shadow, so each two-layer web shadow maps to the nearest elevation.
 */
object FpElevation {
	/** `shadow-sm`: cards, toolbar controls. */
	val Sm = 1.dp

	/** `shadow-md`: RSVP active. */
	val Md = 3.dp

	/** `shadow-lg`: toast, bell dropdown. */
	val Lg = 6.dp

	/** `shadow-xl`: FAB, bulk bar, mini picker (FAB tint primary-400 at 50%). */
	val Xl = 8.dp

	/** `shadow-2xl`: bottom sheets, action menu. */
	val Xxl = 12.dp
}
