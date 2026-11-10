package com.familyplanz.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.push.ActivityNotifier
import com.familyplanz.app.push.PushGraph
import com.familyplanz.app.reminders.Reminders
import com.familyplanz.app.sync.BackgroundRefresh
import com.familyplanz.app.ui.FamilyPlanzHost
import com.familyplanz.app.ui.ReminderPermissionSlot
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLinks
import com.familyplanz.app.ui.nav.rememberAppNav
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import com.familyplanz.app.ui.theme.STATUS_BAR_ARGB
import com.familyplanz.app.ui.theme.SURFACE_ARGB
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

const val FP_DEBUG_TOKEN = "fp_debug_token"
const val FP_DEBUG_SCREEN = "fp_screen"

/** Reminder tap (#271): YYYY-MM-DD to open on the calendar Day view. */
const val FP_OPEN_DAY = "fp_open_day"

class MainActivity : ComponentActivity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		// #291: light status-bar icons over the theme-color strip, dark nav-bar icons over the white tab bar.
		enableEdgeToEdge(
			statusBarStyle = SystemBarStyle.dark(STATUS_BAR_ARGB),
			navigationBarStyle = SystemBarStyle.light(SURFACE_ARGB, SURFACE_ARGB),
		)
		BackgroundRefresh.schedule(applicationContext)
		lifecycleScope.launch { Reminders.rescheduleFromCache(applicationContext) }
		// Debug-only emulator bootstrap (issue #210): `--es fp_debug_token` seeds
		// a throwaway DataStore token; `--es fp_screen calendar|tasks` picks the
		// initial tab so UI checks run without hand-typing. Release has neither.
		val debugToken = if (BuildConfig.DEBUG) intent?.getStringExtra(FP_DEBUG_TOKEN) else null
		if (debugToken != null) {
			runBlocking { DataStoreTokenStore(applicationContext).save(debugToken) }
		}
		// #273: refresh this phone's FCM registration (idempotent; no-op when push is off or signed out).
		lifecycleScope.launch { PushGraph.session(applicationContext).signedIn() }
		val openDay = intent?.getStringExtra(FP_OPEN_DAY)
		val pushLink = intent?.getStringExtra(ActivityNotifier.EXTRA_LINK)
		val pushRoute = DeepLinks.resolve(pushLink, AppModules.DEEP_LINKS)
		// null = the user's start setting decides (Dashboard or Calendar).
		val initialRoute = when {
			openDay != null || intent?.getStringExtra(FP_DEBUG_SCREEN) == "calendar" -> AppRoute.CALENDAR
			intent?.getStringExtra(FP_DEBUG_SCREEN) == "tasks" -> AppRoute.TASKS
			pushRoute != null -> pushRoute
			else -> null
		}
		val modules = (application as FamilyPlanzApp).modules
		setContent {
			FamilyPlanzTheme {
				// A push link's `#fragment` (`/account#calendar`) is the section its lane opens on.
				val nav = rememberAppNav(initialRoute, AppModules.DEEP_LINKS, arg = openDay ?: DeepLinks.fragment(pushLink))
				FamilyPlanzHost(modules, nav) { ReminderPermissionSlot() }
			}
		}
	}
}
