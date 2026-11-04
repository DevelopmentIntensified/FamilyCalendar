package com.familyplanz.app.data

import kotlinx.serialization.Serializable

/** G3 `settings` body: the `/api/me/settings` payload shared by Account and Calendar. */
@Serializable
data class CalendarSettingsDto(
	val weekStart: String = "sunday",
	val timeZone: String = "UTC",
	val color: String = "#3b82f6",
	val defaultView: String = "dayView",
	val defaultCalendarId: String? = null,
	val syncEventsToFamilyCalendar: Boolean = false,
	val autoParseEventDetails: Boolean = true,
	val showDailyVerse: Boolean = false,
	val showAdsAsEvents: Boolean = false,
	val verseTranslation: String = "esv",
	val hiddenDashboardModules: List<String> = emptyList(),
)

/** G10b/roster member, shared by Calendar, Tasks and Family surfaces. */
@Serializable
data class RosterMemberDto(
	val userId: String,
	val firstName: String? = null,
	val lastName: String? = null,
	val role: String? = null,
	val memberType: String? = null,
)

/** G7 `verse`: shown only while the server allows the daily verse module. */
@Serializable
data class VerseDto(val reference: String = "", val text: String = "", val attribution: String? = null)
