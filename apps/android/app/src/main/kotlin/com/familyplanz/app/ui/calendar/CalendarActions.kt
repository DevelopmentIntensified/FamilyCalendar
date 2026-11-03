package com.familyplanz.app.ui.calendar

/** Month navigation + day filter callbacks for [CalendarScreen]. */
data class CalendarActions(
	val onPrevMonth: () -> Unit,
	val onNextMonth: () -> Unit,
	val onSelectDay: (String) -> Unit,
	val onClearDay: () -> Unit,
)
