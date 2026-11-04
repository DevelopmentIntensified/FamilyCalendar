package com.familyplanz.app.ui.dashboard

import com.familyplanz.app.AppServices
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.data.DashboardApi
import com.familyplanz.app.data.DashboardSource
import com.familyplanz.app.data.L4Http
import com.familyplanz.app.data.NetworkDashboardSource
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink
import kotlinx.coroutines.runBlocking

/**
 * L4's DI seam for the Day Dashboard (§2.3). [source] defaults to the
 * network read over [services]' token; tests pass a fake.
 */
class DashboardModule(
	val services: AppServices,
	source: DashboardSource? = null,
) {
	val source: DashboardSource by lazy {
		source ?: NetworkDashboardSource(
			L4Http.create(BuildConfig.API_BASE_URL, DashboardApi::class.java) { runBlocking { services.tokenStore.token() } },
		)
	}

	fun dashboardViewModel() = DashboardViewModel(source)

	companion object {
		val deepLinks: List<DeepLink> = listOf(DeepLink("/calendar/dashboard", AppRoute.DASHBOARD))
	}
}
