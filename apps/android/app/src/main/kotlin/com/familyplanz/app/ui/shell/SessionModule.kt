package com.familyplanz.app.ui.shell

import com.familyplanz.app.AppServices
import com.familyplanz.app.ui.nav.StartRouteProvider

/** L1's DI seam: the session the shell hosts, where it opens, and the shell chrome's data. */
class SessionModule(private val services: AppServices) {
	val startRoute: StartRouteProvider get() = services.startRoute

	/** OfflineBanner inputs. */
	val network: NetworkStatus get() = services.network
	val pendingWrites: PendingWrites get() = services.pendingWrites

	fun sessionViewModel() = SessionViewModel(services.tokenStore, services.sessionHooks, services.auth)

	/** Per-session chrome (badge, bell, account banners); [onUnauthorized] ends the session on a 401. */
	fun chromeViewModel(toasts: ToastQueue, onUnauthorized: () -> Unit) =
		ShellChromeViewModel(services.shell, toasts, onUnauthorized)
}
