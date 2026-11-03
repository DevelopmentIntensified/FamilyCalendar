package com.familyplanz.app.ui.alerts

import com.familyplanz.app.AppServices
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.data.L4Http
import com.familyplanz.app.data.NetworkNotificationSource
import com.familyplanz.app.data.NotificationApi
import com.familyplanz.app.data.NotificationSource
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.runBlocking

/**
 * L4's DI seam for the Alerts screen. [source] defaults to the network feed
 * over [services]' token; tests pass a fake.
 */
class AlertsModule(
	val services: AppServices,
	source: NotificationSource? = null,
) {
	val source: NotificationSource by lazy {
		source ?: NetworkNotificationSource(
			L4Http.create(BuildConfig.API_BASE_URL, NotificationApi::class.java) { runBlocking { services.tokenStore.token() } },
		)
	}

	private val badge = MutableStateFlow(0)

	/**
	 * The unread count the Alerts screen last saw (0 before it loads or after
	 * sign-out). L1's tab bar / bell reads this for the Alerts badge.
	 */
	val unreadCount: StateFlow<Int> = badge.asStateFlow()

	fun alertsViewModel() = AlertsViewModel(source, badge)

	companion object {
		val deepLinks: List<DeepLink> = listOf(DeepLink("/calendar/notifications", AppRoute.ALERTS))
	}
}
