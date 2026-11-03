package com.familyplanz.app.ui.account

import com.familyplanz.app.AppServices
import com.familyplanz.app.ui.nav.DeepLink

/**
 * L5's DI seam for the Account screen: its sources and ViewModel
 * factories go here, built from [services]. Wired once in AppModules.
 */
class AccountModule(val services: AppServices) {
	companion object {
		/** Web paths this screen answers in-app; none until the screen ships. */
		val deepLinks: List<DeepLink> = emptyList()
	}
}
