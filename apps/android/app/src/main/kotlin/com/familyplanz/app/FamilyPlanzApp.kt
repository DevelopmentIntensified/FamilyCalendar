package com.familyplanz.app

import android.app.Application
import com.familyplanz.app.push.ActivityNotifier
import com.familyplanz.app.push.FirebasePush
import com.familyplanz.app.ui.account.AccountModule
import com.familyplanz.app.ui.admin.AdminModule
import com.familyplanz.app.ui.alerts.AlertsModule
import com.familyplanz.app.ui.auth.AuthModule
import com.familyplanz.app.ui.calendar.CalendarModule
import com.familyplanz.app.ui.dashboard.DashboardModule
import com.familyplanz.app.ui.family.FamilyModule
import com.familyplanz.app.ui.groceries.GroceriesModule
import com.familyplanz.app.ui.nav.DeepLink
import com.familyplanz.app.ui.secondary.SecondaryModule
import com.familyplanz.app.ui.shell.SessionModule
import com.familyplanz.app.ui.tasks.TasksModule

/**
 * Process start: manual Firebase init (issue #273, no google-services plugin)
 * before any FCM callback. Without firebase.properties push stays off and the
 * 'Family activity' channel is never created.
 */
class FamilyPlanzApp : Application() {
	/** The app's DI graph; built on first use (MainActivity), not at process start. */
	val modules: AppModules by lazy { AppModules(AppServices.production(this)) }

	override fun onCreate() {
		super.onCreate()
		if (FirebasePush.init(this)) ActivityNotifier.ensureChannel(this)
	}
}

/**
 * One DI seam per lane (#292 §4), one line each. A lane registers its
 * sources and ViewModel factories inside its own `XModule.kt`; this list
 * needs no edit when a lane grows.
 */
class AppModules(services: AppServices) {
	val session = SessionModule(services)
	val auth = AuthModule(services)
	val calendar = CalendarModule(services)
	val dashboard = DashboardModule(services)
	val tasks = TasksModule(services)
	val groceries = GroceriesModule(services)
	val alerts = AlertsModule(services)
	val family = FamilyModule(services)
	val account = AccountModule(services)
	val secondary = SecondaryModule(services)
	val admin = AdminModule(services)

	companion object {
		/** Web paths the app opens in-app (push `data.link`, alert links); each lane declares its own. */
		val DEEP_LINKS: List<DeepLink> = CalendarModule.deepLinks +
			DashboardModule.deepLinks +
			TasksModule.deepLinks +
			GroceriesModule.deepLinks +
			AlertsModule.deepLinks +
			FamilyModule.deepLinks +
			AccountModule.deepLinks +
			SecondaryModule.deepLinks +
			AdminModule.deepLinks
	}
}
