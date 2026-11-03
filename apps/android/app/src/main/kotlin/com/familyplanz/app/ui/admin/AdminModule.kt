package com.familyplanz.app.ui.admin

import com.familyplanz.app.AppServices
import com.familyplanz.app.ui.nav.DeepLink

/**
 * L5's DI seam for the admin-only pages (Admin, Bug Reports, NLP): their sources and ViewModel factories go
 * here, built from [services]. Wired once in AppModules.
 */
class AdminModule(val services: AppServices) {
	companion object {
		/** Web paths these screens answer in-app; none until they ship. */
		val deepLinks: List<DeepLink> = emptyList()
	}
}
