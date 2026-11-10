package com.familyplanz.app.ui.calendar

import android.content.Context
import com.familyplanz.app.AppServices
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.data.CalendarSource
import com.familyplanz.app.data.EventTextExtractorChain
import com.familyplanz.app.data.NetworkCalendarSource
import com.familyplanz.app.data.NetworkTaskRepository
import com.familyplanz.app.data.OnDeviceEventExtractor
import com.familyplanz.app.data.OnDeviceFirstExtractorChain
import com.familyplanz.app.data.ServerEventExtractor
import com.familyplanz.app.data.UnavailableCalendarSource
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink
import kotlinx.coroutines.runBlocking

/** L2's DI seam: the Calendar tab's sources and ViewModels, built from [services]. */
class CalendarModule(private val services: AppServices) {
	/**
	 * The calendar edge: production builds it against the API base; tests and
	 * previews (which use a fake repository) get an empty source so no
	 * Robolectric test touches the network.
	 */
	private val source: CalendarSource by lazy {
		(services.repository as? CalendarSource) ?: if (services.repository is NetworkTaskRepository) {
			NetworkCalendarSource.create(BuildConfig.API_BASE_URL) { runBlocking { services.tokenStore.token() } }
		} else {
			UnavailableCalendarSource
		}
	}

	fun calendarViewModel(
		context: Context,
		/** #311: the device-first chain production ships; a test can pass a fake chain through the same slot. */
		selectionExtractor: EventTextExtractorChain = OnDeviceFirstExtractorChain(
			OnDeviceEventExtractor(),
			ServerEventExtractor(services.repository),
		),
	) = CalendarViewModel(
		repository = services.repository,
		source = source,
		prefs = SharedCalendarPrefs(context.applicationContext),
		selectionExtractor = selectionExtractor,
	)

	companion object {
		/** Any `/calendar/...` link no longer prefix claims opens the Calendar tab. */
		val deepLinks: List<DeepLink> = listOf(DeepLink("/calendar", AppRoute.CALENDAR))
	}
}
