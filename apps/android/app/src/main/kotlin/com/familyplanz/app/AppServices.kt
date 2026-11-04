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
import com.familyplanz.app.ui.shell.NetworkShellSource
import com.familyplanz.app.ui.shell.NetworkStatus
import com.familyplanz.app.ui.shell.PendingWrites
import com.familyplanz.app.ui.shell.SettingsStartRoute
import com.familyplanz.app.ui.shell.ShellApi
import com.familyplanz.app.ui.shell.ShellSource
import com.familyplanz.app.ui.shell.SystemNetworkStatus
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * The shared edges every lane module builds on: the phone API, the token
 * store, sign-in/revoke, the #273 session hooks and the start-screen setting. Tests pass fakes here.
 */
class AppServices(
	val repository: TaskRepository,
	val tokenStore: DataStoreTokenStore,
	val auth: AuthSource,
	val sessionHooks: SessionHooks = SessionHooks.None,
	/** The user's start screen (Dashboard or Calendar); production reads G3 `defaultView`. */
	val startRoute: StartRouteProvider = StartRouteProvider.Calendar,
	/** The shell's own `/api` calls: notifications badge + bell, `/api/me` banners, verify. */
	val shell: ShellSource = ShellSource.None,
	/** OfflineBanner: connectivity and queued writes. */
	val network: NetworkStatus = NetworkStatus.Online,
	val pendingWrites: PendingWrites = PendingWrites.None,
) {
	companion object {
		fun production(app: Application): AppServices {
			val store = DataStoreTokenStore(app)
			val token = { runBlocking { store.token() } }
			val api = ApiFactory.create(BuildConfig.API_BASE_URL, token)
			val cache = ReminderAwareCache(FileTaskCache(app.filesDir)) { Reminders.rescheduleFromCache(app) }
			val shell = NetworkShellSource(shellApi(BuildConfig.API_BASE_URL, token))
			return AppServices(
				repository = NetworkTaskRepository(api, cache),
				tokenStore = store,
				// #288 native sign-in; also revokes the token on sign-out.
				auth = NetworkAuthSource(ApiFactory.createAuth(BuildConfig.API_BASE_URL)),
				sessionHooks = PushGraph.session(app),
				startRoute = SettingsStartRoute(shell),
				shell = shell,
				network = SystemNetworkStatus(app),
			)
		}

		private fun shellApi(baseUrl: String, token: () -> String?): ShellApi =
			Retrofit.Builder()
				.baseUrl(baseUrl)
				.client(ApiFactory.createClient(token))
				.addConverterFactory(ApiFactory.json.asConverterFactory("application/json".toMediaType()))
				.build()
				.create(ShellApi::class.java)
	}
}
