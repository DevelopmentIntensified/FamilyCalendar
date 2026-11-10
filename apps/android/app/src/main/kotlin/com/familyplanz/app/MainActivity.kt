package com.familyplanz.app

import android.content.Intent
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
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLinks
import com.familyplanz.app.ui.nav.SELECTION_PREFIX
import com.familyplanz.app.ui.nav.SHARE_TEXT_PREFIX
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
	/** The [rememberAppNav] the composition built, hoisted so an onNewIntent can route a share into it (#312). */
	private var nav: AppNav? = null

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		// #291: light status-bar icons over the theme-color strip, dark nav-bar icons over the white tab bar.
		enableEdgeToEdge(
			statusBarStyle = SystemBarStyle.dark(STATUS_BAR_ARGB),
			navigationBarStyle = SystemBarStyle.light(SURFACE_ARGB, SURFACE_ARGB),
		)
		BackgroundRefresh.schedule(applicationContext)
		bootstrapDebugToken()
		// #273: refresh this phone's FCM registration (idempotent; no-op when push is off or signed out).
		lifecycleScope.launch { PushGraph.session(applicationContext).signedIn() }
		val routing = launchArgs(intent)
		val modules = (application as FamilyPlanzApp).modules
		setContent {
			FamilyPlanzTheme {
				// A push link's `#fragment` (`/account#calendar`) is the section its lane opens on.
				val nav = rememberAppNav(routing.route, AppModules.DEEP_LINKS, arg = routing.arg)
				this.nav = nav
				FamilyPlanzHost(modules, nav) { ReminderPermissionSlot() }
			}
		}
	}

	/** Debug-only emulator bootstrap (issue #210): `--es fp_debug_token` seeds a throwaway DataStore token. */
	private fun bootstrapDebugToken() {
		val debugToken = if (BuildConfig.DEBUG) intent?.getStringExtra(FP_DEBUG_TOKEN) else null
		if (debugToken != null) {
			runBlocking { DataStoreTokenStore(applicationContext).save(debugToken) }
		}
	}

	/**
	 * What this cold [intent] asked for (`MainActivity`'s one launch table):
	 * the route it picked (null = the user's start setting decides) and the
	 * one-shot argument slot's value (a reminder day, a share (#312), a
	 * selection (#311), or the push link's `#fragment`).
	 */
	private fun launchArgs(intent: Intent?): LaunchArgs {
		val openDay = intent?.getStringExtra(FP_OPEN_DAY)
		val pushLink = intent?.getStringExtra(ActivityNotifier.EXTRA_LINK)
		val pushRoute = DeepLinks.resolve(pushLink, AppModules.DEEP_LINKS)
		// The prefilled text a share (#312) or a selection offer (#311) carries, as its route argument.
		val routedArg = when (intent?.action) {
			Intent.ACTION_SEND -> sharedTextOf(intent)?.takeIf { it.isNotBlank() }?.let { SHARE_TEXT_PREFIX + it }
			Intent.ACTION_PROCESS_TEXT -> selectionTextOf(intent)?.let { SELECTION_PREFIX + it }
			else -> null
		}
		val route = when {
			openDay != null || intent?.getStringExtra(FP_DEBUG_SCREEN) == "calendar" -> AppRoute.CALENDAR
			intent?.getStringExtra(FP_DEBUG_SCREEN) == "tasks" -> AppRoute.TASKS
			pushRoute != null -> pushRoute
			routedArg != null -> AppRoute.CALENDAR
			else -> null
		}
		return LaunchArgs(route, openDay ?: routedArg ?: DeepLinks.fragment(pushLink))
	}

	/** One cold-start routing: the route and its argument slot. */
	private data class LaunchArgs(val route: AppRoute?, val arg: String?)

	/** The plain shared text; Android embeds any URL inside it (the web's `buildSharedTargetText` fact), title alone also counts. */
	private fun sharedTextOf(intent: Intent?): String? {
		val text = intent?.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
		val title = intent?.getStringExtra(Intent.EXTRA_SUBJECT)?.trim().orEmpty()
		val hasCandidates = intent?.hasExtra(Intent.EXTRA_TEXT) == true || intent?.hasExtra(Intent.EXTRA_SUBJECT) == true
		if (!hasCandidates) return null
		val combined = when {
			text.isNotBlank() && title.isNotBlank() && !text.contains(title) -> "$text $title"
			text.isNotBlank() -> text
			else -> title
		}
		return combined.takeIf { it.isNotBlank() }?.replace(Regex("\\s+"), " ")
	}

	/** The selected text an `ACTION_PROCESS_TEXT` offer carries (#311); null when empty or whitespace only. */
	private fun selectionTextOf(intent: Intent?): String? =
		intent?.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()?.trim()
			?.takeIf { it.isNotBlank() }?.replace(Regex("\\s+"), " ")

	/** A share landing while the app runs: the same routing as a fresh launch (#312). */
	override fun onNewIntent(intent: Intent) {
		super.onNewIntent(intent)
		setIntent(intent)
		val prefilled = when (intent.action) {
			Intent.ACTION_SEND -> sharedTextOf(intent)?.takeIf { it.isNotBlank() }?.let { SHARE_TEXT_PREFIX + it }
			Intent.ACTION_PROCESS_TEXT -> selectionTextOf(intent)?.let { SELECTION_PREFIX + it }
			else -> null
		}
		if (prefilled != null) {
			nav?.open(AppRoute.CALENDAR, prefilled)
		}
		// #312's `singleTask` hands a notification tap to this instance instead of a
		// fresh activity, so the extras onCreate routes must be routed from here too.
		openIntent(intent)
	}

	/** The day a reminder tap (#271) or the link a push tap (#273) asked for. */
	private fun openIntent(intent: Intent) {
		val day = intent.getStringExtra(FP_OPEN_DAY)
		if (day != null) {
			nav?.open(AppRoute.CALENDAR, day)
			return
		}
		val link = intent.getStringExtra(ActivityNotifier.EXTRA_LINK)
		val target = DeepLinks.resolve(link, AppModules.DEEP_LINKS) ?: return
		nav?.open(target, DeepLinks.fragment(link))
	}
}
