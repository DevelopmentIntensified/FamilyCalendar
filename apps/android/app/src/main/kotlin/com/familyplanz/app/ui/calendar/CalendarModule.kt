package com.familyplanz.app.ui.calendar

import com.familyplanz.app.AppServices
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink

/** L2's DI seam: the Calendar tab's sources and ViewModels, built from [services]. */
class CalendarModule(private val services: AppServices) {
	fun calendarViewModel() = CalendarViewModel(services.repository)

	fun quickAddViewModel() = QuickAddViewModel(services.repository)

	companion object {
		/** Any `/calendar/...` link no longer prefix claims opens the Calendar tab. */
		val deepLinks: List<DeepLink> = listOf(DeepLink("/calendar", AppRoute.CALENDAR))
	}
}
