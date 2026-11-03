package com.familyplanz.app.ui.shell

import com.familyplanz.app.AppServices
import com.familyplanz.app.ui.nav.StartRouteProvider

/** L1's DI seam: the session the shell hosts and where it opens. */
class SessionModule(private val services: AppServices) {
	val startRoute: StartRouteProvider get() = services.startRoute

	fun sessionViewModel() = SessionViewModel(services.tokenStore, services.sessionHooks, services.auth)
}
