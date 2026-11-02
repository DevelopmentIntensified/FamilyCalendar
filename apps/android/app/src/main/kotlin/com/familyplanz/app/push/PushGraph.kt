package com.familyplanz.app.push

import android.content.Context
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.data.DeviceSource
import com.familyplanz.app.data.NetworkDeviceSource
import com.familyplanz.app.reminders.Reminders

/** Production wiring for #273 (the classes it builds are tested with fakes). */
object PushGraph {
	private fun devices(bearer: String): DeviceSource =
		NetworkDeviceSource(ApiFactory.create(BuildConfig.API_BASE_URL) { bearer })

	fun registrar(context: Context, retry: RegisterRetry? = WorkManagerRegisterRetry(context.applicationContext)): DeviceRegistrar {
		val store = DataStoreTokenStore(context.applicationContext)
		return DeviceRegistrar(bearer = { store.token() }, devices = ::devices, retry = retry)
	}

	fun session(context: Context): SessionHooks {
		val app = context.applicationContext
		return PushSession(
			tokens = if (FirebasePush.enabled(app)) FirebasePushTokens() else null,
			registrar = registrar(app),
			devices = ::devices,
			replanReminders = { Reminders.rescheduleFromCache(app) },
		)
	}

	fun handler(context: Context): PushHandler {
		val app = context.applicationContext
		val store = DataStoreTokenStore(app)
		return PushHandler(
			refresh = WorkManagerEventsRefresh(app),
			poster = { ActivityNotifier.post(app, it) },
			signedIn = { store.token() != null },
		)
	}
}
