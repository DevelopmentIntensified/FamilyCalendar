package com.familyplanz.app.ui.groceries

import com.familyplanz.app.AppServices
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.data.GroceryApi
import com.familyplanz.app.data.GrocerySource
import com.familyplanz.app.data.L4Http
import com.familyplanz.app.data.NetworkGrocerySource
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink
import kotlinx.coroutines.runBlocking

/**
 * L4's DI seam for the Groceries screen (§2.5). [source] defaults to the
 * network list over [services]' token; tests pass a fake.
 */
class GroceriesModule(
	val services: AppServices,
	source: GrocerySource? = null,
) {
	val source: GrocerySource by lazy {
		source ?: NetworkGrocerySource(
			L4Http.create(BuildConfig.API_BASE_URL, GroceryApi::class.java) { runBlocking { services.tokenStore.token() } },
		)
	}

	fun groceriesViewModel() = GroceriesViewModel(source)

	companion object {
		val deepLinks: List<DeepLink> = listOf(DeepLink("/calendar/groceries", AppRoute.GROCERIES))
	}
}
