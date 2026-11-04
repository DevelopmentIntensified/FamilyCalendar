package com.familyplanz.app.ui.calendar

import androidx.compose.ui.graphics.Color

/**
 * Tailwind 3.4.19 steps the calendar uses that `ui/theme/Color.kt` (L1) does
 * not carry yet. Local placeholder until L1's §1 token table lands; each
 * value is the Tailwind default for that step. Move into `Accent` then.
 */
object CalTone {
	val Emerald50 = Color(0xFFECFDF5)
	val Emerald200 = Color(0xFFA7F3D0)
	val Emerald400 = Color(0xFF34D399)
	val Emerald600 = Color(0xFF059669)
	val Amber300 = Color(0xFFFCD34D)
	val Amber400 = Color(0xFFFBBF24)
	val Amber600 = Color(0xFFD97706)
	val Amber900 = Color(0xFF78350F)
	val Green600 = Color(0xFF16A34A)
	val Yellow500 = Color(0xFFEAB308)
	val Purple50 = Color(0xFFFAF5FF)
	val Purple200 = Color(0xFFE9D5FF)
	val Purple400 = Color(0xFFC084FC)
	val Purple600 = Color(0xFF9333EA)
	val Purple700 = Color(0xFF7E22CE)

	/** MonthDayCell weekend wash top (`from-[#f8f6f3]`). */
	val WeekendTop = Color(0xFFF8F6F3)

	/** G6 sponsored amber (`calendar/+page.server.ts:320`). */
	val Sponsored = Color(0xFFF59E0B)
}
