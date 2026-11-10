package com.familyplanz.app.ui.account

import com.familyplanz.app.AppServices
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.data.AccountApis
import com.familyplanz.app.data.AccountSettingsSource
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.FamilySource
import com.familyplanz.app.data.NetworkAccountSettingsSource
import com.familyplanz.app.data.NetworkTaskRepository
import com.familyplanz.app.data.UnavailableAccountSettingsSource
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink
import kotlinx.coroutines.runBlocking

/**
 * L5's DI seam for the Account screen (#310): its source and ViewModel
 * factory, built from [services]. Wired once in AppModules. [source] is a
 * test seam; production passes the network edge.
 */
class AccountModule(
	private val services: AppServices,
	val source: AccountSettingsSource = defaultSource(services),
) {
	/** [families] feeds the "Your families" card, so the Account and Family screens never disagree. */
	fun accountViewModel(families: FamilySource): AccountViewModel =
		AccountViewModel(source) { if (online(services)) families.overview() else ApiResult.Err(ApiError.Unsupported) }

	companion object {
		/** `/account` and its section links (`/account#calendar`): the fragment rides along as the route argument. */
		val deepLinks: List<DeepLink> = listOf(DeepLink("/account", AppRoute.ACCOUNT))

		/** Tests and previews run on a fake repository: they get an empty edge, never the network. */
		private fun online(services: AppServices): Boolean = services.repository is NetworkTaskRepository

		private fun defaultSource(services: AppServices): AccountSettingsSource =
			if (online(services)) {
				NetworkAccountSettingsSource(AccountApis.create(BuildConfig.API_BASE_URL) { runBlocking { services.tokenStore.token() } })
			} else {
				UnavailableAccountSettingsSource
			}
	}
}
