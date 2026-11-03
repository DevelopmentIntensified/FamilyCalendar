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
}
