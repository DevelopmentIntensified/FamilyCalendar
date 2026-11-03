package com.familyplanz.app.ui

import androidx.annotation.DrawableRes
import com.familyplanz.app.R
import com.familyplanz.app.ui.nav.AppRoute

/**
 * The bottom bar, in the web's order (`navItems.ts` appDestinations):
 * [label] is the tab text (`shortLabel` where the web has one), [description]
 * the accessible name (the web's aria-label, e.g. Shop → "Groceries").
 */
enum class PhoneTab(val route: AppRoute, val label: String, val description: String, @DrawableRes val icon: Int) {
	CALENDAR(AppRoute.CALENDAR, "Calendar", "Calendar", R.drawable.ic_fp_calendar),
	DASHBOARD(AppRoute.DASHBOARD, "Dashboard", "Dashboard", R.drawable.ic_fp_dashboard),
	TASKS(AppRoute.TASKS, "Tasks", "Tasks", R.drawable.ic_fp_tasks),
	GROCERIES(AppRoute.GROCERIES, "Shop", "Groceries", R.drawable.ic_fp_groceries),
	ALERTS(AppRoute.ALERTS, "Alerts", "Alerts", R.drawable.ic_fp_alerts),
	FAMILY(AppRoute.FAMILY, "Family", "Family", R.drawable.ic_fp_family),
	;

	companion object {
		fun of(route: AppRoute): PhoneTab? = entries.firstOrNull { it.route == route }
	}
}
