package com.familyplanz.app.ui.calendar

import android.content.Context

/**
 * The calendar's per-user, per-device reading filters and the first-run
 * dismissal (web: localStorage keyed by user id, Calendar.svelte:310-330,
 * FirstRunCard). Android keeps them in SharedPreferences keyed the same way.
 */
interface CalendarPrefs {
	fun hiddenCalendars(userId: String): Set<String>

	fun setHiddenCalendars(userId: String, ids: Set<String>)

	fun hiddenAssignees(userId: String): Set<String>

	fun setHiddenAssignees(userId: String, ids: Set<String>)

	fun firstRunDismissed(userId: String): Boolean

	fun dismissFirstRun(userId: String)
}

class SharedCalendarPrefs(context: Context) : CalendarPrefs {
	private val prefs = context.applicationContext.getSharedPreferences("fp_calendar_filters", Context.MODE_PRIVATE)

	override fun hiddenCalendars(userId: String): Set<String> = prefs.getStringSet("hiddenCalendars:$userId", null).orEmpty()

	override fun setHiddenCalendars(userId: String, ids: Set<String>) {
		prefs.edit().putStringSet("hiddenCalendars:$userId", ids).apply()
	}

	override fun hiddenAssignees(userId: String): Set<String> = prefs.getStringSet("hiddenAssignees:$userId", null).orEmpty()

	override fun setHiddenAssignees(userId: String, ids: Set<String>) {
		prefs.edit().putStringSet("hiddenAssignees:$userId", ids).apply()
	}

	override fun firstRunDismissed(userId: String): Boolean = prefs.getBoolean("firstRunDismissed:$userId", false)

	override fun dismissFirstRun(userId: String) {
		prefs.edit().putBoolean("firstRunDismissed:$userId", true).apply()
	}
}

/** Tests and previews: nothing survives the process. */
class MemoryCalendarPrefs : CalendarPrefs {
	private val sets = mutableMapOf<String, Set<String>>()
	private val dismissed = mutableSetOf<String>()

	override fun hiddenCalendars(userId: String) = sets["c:$userId"].orEmpty()

	override fun setHiddenCalendars(userId: String, ids: Set<String>) {
		sets["c:$userId"] = ids
	}

	override fun hiddenAssignees(userId: String) = sets["a:$userId"].orEmpty()

	override fun setHiddenAssignees(userId: String, ids: Set<String>) {
		sets["a:$userId"] = ids
	}

	override fun firstRunDismissed(userId: String) = userId in dismissed

	override fun dismissFirstRun(userId: String) {
		dismissed += userId
	}
}
