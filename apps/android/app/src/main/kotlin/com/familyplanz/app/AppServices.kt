package com.familyplanz.app

import android.app.Application
import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.AuthSource
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.data.FileTaskCache
import com.familyplanz.app.data.NetworkAuthSource
import com.familyplanz.app.data.NetworkTaskRepository
import com.familyplanz.app.data.TaskRepository
import com.familyplanz.app.push.PushGraph
import com.familyplanz.app.push.SessionHooks
import com.familyplanz.app.reminders.ReminderAwareCache
import com.familyplanz.app.reminders.Reminders
import com.familyplanz.app.ui.nav.StartRouteProvider
import kotlinx.coroutines.runBlocking

/**
 * The shared edges every lane module builds on: the phone API, the token
 * store, sign-in/revoke, the #273 session hooks and the start-screen setting. Tests pass fakes here.
 */
class AppServices(
	val repository: TaskRepository,
	val tokenStore: DataStoreTokenStore,
	val auth: AuthSource,
	val sessionHooks: SessionHooks = SessionHooks.None,
	/** The user's start screen (Dashboard or Calendar); G3 replaces the Calendar default. */
	val startRoute: StartRouteProvider = StartRouteProvider.Calendar,
) {
	companion object {
		fun production(app: Application): AppServices {
			val store = DataStoreTokenStore(app)
			val api = ApiFactory.create(BuildConfig.API_BASE_URL) { runBlocking { store.token() } }
			val cache = ReminderAwareCache(FileTaskCache(app.filesDir)) { Reminders.rescheduleFromCache(app) }
			return AppServices(
				repository = NetworkTaskRepository(api, cache),
				tokenStore = store,
				// #288 native sign-in; also revokes the token on sign-out.
				auth = NetworkAuthSource(ApiFactory.createAuth(BuildConfig.API_BASE_URL)),
				sessionHooks = PushGraph.session(app),
			)
		}
	}
}
