package com.familyplanz.app.push

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.DeviceSource

/** Session edges AppViewModel reports (issue #273); the default does nothing. */
interface SessionHooks {
	/** A bearer token was just saved. */
	suspend fun signedIn()

	/** The bearer token was cleared; [previousBearer] is the one that was stored. */
	suspend fun signedOut(previousBearer: String?)

	object None : SessionHooks {
		override suspend fun signedIn() = Unit

		override suspend fun signedOut(previousBearer: String?) = Unit
	}
}

/** This phone's FCM registration token (Firebase in prod). */
interface PushTokens {
	suspend fun current(): String?

	/** Invalidates the token at FCM, so a stale server row gets pruned on the next send. */
	suspend fun delete()
}

enum class RegisterOutcome { SKIPPED_NO_BEARER, REGISTERED, RETRY, REJECTED }

/** Deferred re-register of one FCM token (WorkManager in prod). */
fun interface RegisterRetry {
	fun schedule(fcmToken: String)
}

/**
 * POST /api/devices for an FCM token. Network/5xx → [retry] (null inside the
 * retry worker itself, which backs off on RETRY); 400/401 are final.
 */
class DeviceRegistrar(
	private val bearer: suspend () -> String?,
	private val devices: (bearer: String) -> DeviceSource,
	private val retry: RegisterRetry?,
) {
	suspend fun register(fcmToken: String): RegisterOutcome {
		val current = bearer()?.takeIf { it.isNotBlank() } ?: return RegisterOutcome.SKIPPED_NO_BEARER
		val outcome = outcomeOf(devices(current).register(fcmToken))
		if (outcome == RegisterOutcome.RETRY) retry?.schedule(fcmToken)
		return outcome
	}

	private fun outcomeOf(result: ApiResult<Unit>): RegisterOutcome = when (result) {
		is ApiResult.Ok -> RegisterOutcome.REGISTERED
		is ApiResult.Err -> when (result.error) {
			is ApiError.Network, is ApiError.Server -> RegisterOutcome.RETRY
			else -> RegisterOutcome.REJECTED
		}
	}
}

/**
 * Token entry → register; sign-out → re-plan reminders (signed out = none),
 * DELETE with the old bearer (best effort), then drop the FCM token so even
 * a failed DELETE ends in a server-side prune. [tokens] null = push disabled.
 */
class PushSession(
	private val tokens: PushTokens?,
	private val registrar: DeviceRegistrar,
	private val devices: (bearer: String) -> DeviceSource,
	private val replanReminders: suspend () -> Unit,
) : SessionHooks {
	override suspend fun signedIn() {
		tokens?.current()?.let { registrar.register(it) }
	}

	override suspend fun signedOut(previousBearer: String?) {
		replanReminders()
		val push = tokens ?: return
		val fcmToken = push.current()
		if (!previousBearer.isNullOrBlank() && fcmToken != null) devices(previousBearer).unregister(fcmToken)
		push.delete()
	}
}
