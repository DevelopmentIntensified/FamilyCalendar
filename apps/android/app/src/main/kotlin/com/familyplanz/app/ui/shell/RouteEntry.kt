package com.familyplanz.app.ui.shell

import androidx.compose.runtime.Composable
import com.familyplanz.app.ui.account.AccountEntry
import com.familyplanz.app.ui.admin.AdminBugsEntry
import com.familyplanz.app.ui.admin.AdminEntry
import com.familyplanz.app.ui.admin.AdminNlpEntry
import com.familyplanz.app.ui.alerts.AlertsEntry
import com.familyplanz.app.ui.auth.ForgotPasswordEntry
import com.familyplanz.app.ui.calendar.CalendarEntry
import com.familyplanz.app.ui.dashboard.DashboardEntry
import com.familyplanz.app.ui.family.FamilyEntry
import com.familyplanz.app.ui.groceries.GroceriesEntry
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.secondary.archive.ArchiveEntry
import com.familyplanz.app.ui.secondary.importer.ImportEntry
import com.familyplanz.app.ui.secondary.print.PrintEntry
import com.familyplanz.app.ui.secondary.reportbug.ReportBugEntry
import com.familyplanz.app.ui.secondary.stats.StatsEntry
import com.familyplanz.app.ui.tasks.TasksEntry

/*
 * The route -> screen table, split out of FamilyPlanzHost.kt (file-cap).
 * Each lane owns what its own entry renders; this file only wires routes.
 */

/** One entry per [AppRoute]; each lane owns what its entry renders. */
@Composable
internal fun RouteEntry(nav: AppNav) {
	when (nav.route) {
		AppRoute.CALENDAR -> CalendarEntry(nav)
		AppRoute.DASHBOARD -> DashboardEntry(nav)
		AppRoute.TASKS -> TasksEntry(nav)
		AppRoute.GROCERIES -> GroceriesEntry(nav)
		AppRoute.ALERTS -> AlertsEntry(nav)
		AppRoute.FAMILY -> FamilyEntry(nav)
		else -> MenuRouteEntry(nav)
	}
}

/** The menu, admin and auth destinations (no tab). */
@Composable
private fun MenuRouteEntry(nav: AppNav) {
	when (nav.route) {
		AppRoute.ACCOUNT -> AccountEntry(nav)
		AppRoute.STATS -> StatsEntry(nav)
		AppRoute.ARCHIVE -> ArchiveEntry(nav)
		AppRoute.REPORT_BUG -> ReportBugEntry(nav)
		AppRoute.IMPORT -> ImportEntry(nav)
		AppRoute.PRINT -> PrintEntry(nav)
		AppRoute.ADMIN -> AdminEntry(nav)
		AppRoute.ADMIN_BUGS -> AdminBugsEntry(nav)
		AppRoute.ADMIN_NLP -> AdminNlpEntry(nav)
		AppRoute.FORGOT_PASSWORD -> ForgotPasswordEntry(nav)
		else -> Unit
	}
}
