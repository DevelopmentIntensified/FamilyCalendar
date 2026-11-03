package com.familyplanz.app.ui.secondary

import com.familyplanz.app.AppServices
import com.familyplanz.app.ui.nav.DeepLink

/**
 * L5's DI seam for the menu pages (Task stats, Archive, Report a Bug, Import, Print): their sources and ViewModel factories go
 * here, built from [services]. Wired once in AppModules.
 */
class SecondaryModule(val services: AppServices) {
	companion object {
		/** Web paths these screens answer in-app; none until they ship. */
		val deepLinks: List<DeepLink> = emptyList()
	}
}
