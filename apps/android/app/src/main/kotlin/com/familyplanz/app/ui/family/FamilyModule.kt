package com.familyplanz.app.ui.family

import com.familyplanz.app.AppServices
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.data.FamilyApis
import com.familyplanz.app.data.FamilySource
import com.familyplanz.app.data.NetworkFamilySource
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink
import kotlinx.coroutines.runBlocking

/**
 * L5's DI seam for the Families screens: the [FamilySource] and the
 * ViewModel factories, built from [services]. Wired once in AppModules.
 * [source] is a test seam; production passes the network edge.
 */
class FamilyModule(
	private val services: AppServices,
	val source: FamilySource = network(services),
) {
	fun listViewModel() = FamilyListViewModel(source)

	fun detailViewModel(familyId: String) = FamilyDetailViewModel(source, familyId)

	fun invitesViewModel(familyId: String) = FamilyInvitesViewModel(source, familyId)

	fun createViewModel() = FamilyCreateViewModel(source)

	fun membersViewModel(familyId: String) = FamilyMembersViewModel(source, familyId)

	/** The board completes rows through the shared task repository (same /api/tasks door). */
	fun tasksViewModel(familyId: String) = FamilyTasksViewModel(source, services.repository, familyId)

	companion object {
		/** The Family screens' web paths (2.7-2.11); the tab route plus its sub-pages. */
		val deepLinks: List<DeepLink> = listOf(
			DeepLink("/family/invitations", AppRoute.FAMILY),
			DeepLink("/family/tasks", AppRoute.FAMILY),
			DeepLink("/family/create", AppRoute.FAMILY),
			DeepLink("/family", AppRoute.FAMILY),
		)

		private fun network(services: AppServices): FamilySource {
			val api = FamilyApis.create(BuildConfig.API_BASE_URL) { runBlocking { services.tokenStore.token() } }
			return NetworkFamilySource(api)
		}
	}
}
