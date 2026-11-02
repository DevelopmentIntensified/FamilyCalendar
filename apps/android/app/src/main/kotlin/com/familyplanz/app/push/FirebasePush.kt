package com.familyplanz.app.push

import android.content.Context
import android.util.Log
import com.familyplanz.app.BuildConfig
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/** The four client values from apps/android/firebase.properties (no google-services plugin). */
data class FirebaseConfig(
	val projectId: String,
	val applicationId: String,
	val apiKey: String,
	val gcmSenderId: String,
) {
	companion object {
		/** Null when any value is blank: push disabled, everything else works. */
		fun of(projectId: String, applicationId: String, apiKey: String, gcmSenderId: String): FirebaseConfig? =
			FirebaseConfig(projectId.trim(), applicationId.trim(), apiKey.trim(), gcmSenderId.trim())
				.takeIf { listOf(it.projectId, it.applicationId, it.apiKey, it.gcmSenderId).none(String::isEmpty) }

		fun fromBuildConfig(): FirebaseConfig? = of(
			BuildConfig.FIREBASE_PROJECT_ID,
			BuildConfig.FIREBASE_APPLICATION_ID,
			BuildConfig.FIREBASE_API_KEY,
			BuildConfig.FIREBASE_GCM_SENDER_ID,
		)
	}
}

/** Manual FirebaseApp init (issue #273). Idempotent and never throws. */
object FirebasePush {
	private const val TAG = "FpPush"

	/** True once the default FirebaseApp exists (this process). */
	fun enabled(context: Context): Boolean = runCatching { FirebaseApp.getApps(context).isNotEmpty() }.getOrDefault(false)

	fun init(context: Context, config: FirebaseConfig? = FirebaseConfig.fromBuildConfig()): Boolean = when {
		config == null -> false
		enabled(context) -> true
		else -> initialize(context, config)
	}

	private fun initialize(context: Context, config: FirebaseConfig): Boolean =
		runCatching {
			val options = FirebaseOptions.Builder()
				.setProjectId(config.projectId)
				.setApplicationId(config.applicationId)
				.setApiKey(config.apiKey)
				.setGcmSenderId(config.gcmSenderId)
				.build()
			FirebaseApp.initializeApp(context.applicationContext, options)
			// Touch messaging so auto-init fetches a token (→ onNewToken) on first launch.
			FirebaseMessaging.getInstance().isAutoInitEnabled = true
		}.onFailure { Log.w(TAG, "Firebase init failed; push disabled", it) }.isSuccess
}

/** FCM token via Firebase; failures read as "no token" (push is best effort). */
class FirebasePushTokens : PushTokens {
	override suspend fun current(): String? =
		runCatching { FirebaseMessaging.getInstance().token }.getOrNull()?.awaitOrNull()

	override suspend fun delete() {
		runCatching { FirebaseMessaging.getInstance().deleteToken() }.getOrNull()?.awaitOrNull()
	}
}

private suspend fun <T> Task<T>.awaitOrNull(): T? = suspendCancellableCoroutine { cont ->
	addOnCompleteListener { done -> cont.resume(if (done.isSuccessful) done.result else null) }
}
