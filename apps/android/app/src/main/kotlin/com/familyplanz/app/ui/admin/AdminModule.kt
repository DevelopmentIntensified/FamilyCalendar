package com.familyplanz.app.ui.admin

import com.familyplanz.app.AppServices
import com.familyplanz.app.data.AdminApi
import com.familyplanz.app.data.AdminSource
import com.familyplanz.app.data.NetworkAdminSource
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink
import com.familyplanz.app.ui.secondary.webRetrofit

/**
 * L5's DI seam for the admin-only pages (Admin, Bug Reports, NLP), built from [services].
 * [adminOverride] is a test seam; production leaves it null and reads the network.
 */
class AdminModule(val services: AppServices) {
	private val retrofit by lazy { webRetrofit(services) }

	var adminOverride: AdminSource? = null

	private fun admin() = adminOverride ?: NetworkAdminSource(retrofit.create(AdminApi::class.java))

	fun adminViewModel() = AdminViewModel(admin())

	fun adminBugsViewModel() = AdminBugsViewModel(admin())

	fun adminNlpViewModel() = AdminNlpViewModel(admin())

	companion object {
		/** Longest prefix wins, so `/admin/bugs` beats `/admin`. */
		val deepLinks: List<DeepLink> = listOf(
			DeepLink("/admin", AppRoute.ADMIN),
			DeepLink("/admin/bugs", AppRoute.ADMIN_BUGS),
			DeepLink("/admin/nlp", AppRoute.ADMIN_NLP),
		)
	}
}
