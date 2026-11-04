package com.familyplanz.app.ui.secondary

import com.familyplanz.app.AppServices
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.ArchiveApi
import com.familyplanz.app.data.ArchiveSource
import com.familyplanz.app.data.BugReportApi
import com.familyplanz.app.data.BugReportSource
import com.familyplanz.app.data.ImportApi
import com.familyplanz.app.data.ImportSource
import com.familyplanz.app.data.NetworkArchiveSource
import com.familyplanz.app.data.NetworkBugReportSource
import com.familyplanz.app.data.NetworkImportSource
import com.familyplanz.app.data.NetworkPrintSource
import com.familyplanz.app.data.NetworkStatsSource
import com.familyplanz.app.data.PrintApi
import com.familyplanz.app.data.PrintSource
import com.familyplanz.app.data.StatsApi
import com.familyplanz.app.data.StatsSource
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink
import com.familyplanz.app.ui.secondary.archive.ArchiveViewModel
import com.familyplanz.app.ui.secondary.importer.ImportViewModel
import com.familyplanz.app.ui.secondary.print.PrintViewModel
import com.familyplanz.app.ui.secondary.reportbug.ReportBugViewModel
import com.familyplanz.app.ui.secondary.stats.StatsViewModel
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * One Retrofit over the app's bearer client, shared by the menu pages and the
 * admin pages. Built on first use, so a test that swaps the sources never
 * reaches the network.
 */
internal fun webRetrofit(services: AppServices): Retrofit =
	Retrofit.Builder()
		.baseUrl(BuildConfig.API_BASE_URL)
		.client(ApiFactory.createClient { runBlocking { services.tokenStore.token() } })
		.addConverterFactory(ApiFactory.json.asConverterFactory("application/json".toMediaType()))
		.build()

/**
 * L5's DI seam for the menu pages (Task stats, Archive, Report a Bug, Import, Print): their sources and ViewModel factories.
 * Each `…Override` is a test seam; production leaves it null and reads the network.
 */
class SecondaryModule(val services: AppServices) {
	private val retrofit by lazy { webRetrofit(services) }

	var statsOverride: StatsSource? = null
	var archiveOverride: ArchiveSource? = null
	var bugReportOverride: BugReportSource? = null
	var importOverride: ImportSource? = null
	var printOverride: PrintSource? = null

	private fun stats() = statsOverride ?: NetworkStatsSource(retrofit.create(StatsApi::class.java))

	private fun archive() = archiveOverride ?: NetworkArchiveSource(retrofit.create(ArchiveApi::class.java))

	private fun bugReport() = bugReportOverride ?: NetworkBugReportSource(retrofit.create(BugReportApi::class.java))

	private fun importer() = importOverride ?: NetworkImportSource(retrofit.create(ImportApi::class.java))

	private fun print() = printOverride ?: NetworkPrintSource(retrofit.create(PrintApi::class.java))

	fun statsViewModel() = StatsViewModel(stats())

	fun archiveViewModel() = ArchiveViewModel(archive())

	fun reportBugViewModel() = ReportBugViewModel(bugReport())

	fun importViewModel() = ImportViewModel(importer())

	fun printViewModel() = PrintViewModel(print())

	companion object {
		/** Web paths these screens answer in-app. */
		val deepLinks: List<DeepLink> = listOf(
			DeepLink("/calendar/stats", AppRoute.STATS),
			DeepLink("/calendar/archive", AppRoute.ARCHIVE),
			DeepLink("/report-bug", AppRoute.REPORT_BUG),
			DeepLink("/calendar/import", AppRoute.IMPORT),
			DeepLink("/calendar/print", AppRoute.PRINT),
		)
	}
}
