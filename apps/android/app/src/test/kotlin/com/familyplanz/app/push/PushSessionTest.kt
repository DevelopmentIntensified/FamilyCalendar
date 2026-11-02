package com.familyplanz.app.push

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.DeviceSource
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Issue #273: when the phone registers / unregisters its FCM token, and what retries. */
class PushSessionTest {
	private class FakeDevices(var next: ApiResult<Unit> = ApiResult.Ok(Unit)) {
		val calls = mutableListOf<String>()

		fun forBearer(bearer: String): DeviceSource = object : DeviceSource {
			override suspend fun register(fcmToken: String): ApiResult<Unit> = next.also { calls += "POST $bearer $fcmToken" }

			override suspend fun unregister(fcmToken: String): ApiResult<Unit> = next.also { calls += "DELETE $bearer $fcmToken" }
		}
	}

	private class FakeTokens(var token: String? = "fcm-1") : PushTokens {
		var deleted = 0

		override suspend fun current(): String? = token

		override suspend fun delete() {
			deleted++
		}
	}

	private val devices = FakeDevices()
	private val retried = mutableListOf<String>()
	private var bearer: String? = "fp_me"

	private fun registrar() = DeviceRegistrar(
		bearer = { bearer },
		devices = devices::forBearer,
		retry = { retried += it },
	)

	@Test
	fun `new token registers with the stored bearer`() = runBlocking {
		assertEquals(RegisterOutcome.REGISTERED, registrar().register("fcm-1"))
		assertEquals(listOf("POST fp_me fcm-1"), devices.calls)
		assertTrue(retried.isEmpty())
	}

	@Test
	fun `no bearer means no call and no retry`() = runBlocking {
		bearer = null
		assertEquals(RegisterOutcome.SKIPPED_NO_BEARER, registrar().register("fcm-1"))
		assertTrue(devices.calls.isEmpty() && retried.isEmpty())
	}

	@Test
	fun `network and server failures schedule a retry for that token`() = runBlocking {
		devices.next = ApiResult.Err(ApiError.Network("offline"))
		assertEquals(RegisterOutcome.RETRY, registrar().register("fcm-1"))
		devices.next = ApiResult.Err(ApiError.Server("boom"))
		assertEquals(RegisterOutcome.RETRY, registrar().register("fcm-2"))
		assertEquals(listOf("fcm-1", "fcm-2"), retried)
	}

	@Test
	fun `401 and 400 are final - no retry storm`() = runBlocking {
		devices.next = ApiResult.Err(ApiError.Unauthorized)
		assertEquals(RegisterOutcome.REJECTED, registrar().register("fcm-1"))
		devices.next = ApiResult.Err(ApiError.BadRequest("token is too long"))
		assertEquals(RegisterOutcome.REJECTED, registrar().register("fcm-1"))
		assertTrue(retried.isEmpty())
	}

	@Test
	fun `a null retry seam (the worker itself) still reports RETRY`() = runBlocking {
		devices.next = ApiResult.Err(ApiError.Network("offline"))
		val inWorker = DeviceRegistrar({ bearer }, devices::forBearer, retry = null)
		assertEquals(RegisterOutcome.RETRY, inWorker.register("fcm-1"))
	}

	@Test
	fun `token entry registers the current FCM token`() = runBlocking {
		val tokens = FakeTokens()
		PushSession(tokens, registrar(), devices::forBearer, replanReminders = {}).signedIn()
		assertEquals(listOf("POST fp_me fcm-1"), devices.calls)
	}

	@Test
	fun `sign-out unregisters with the previous bearer, drops the FCM token and re-plans reminders`() = runBlocking {
		val tokens = FakeTokens()
		var replans = 0
		bearer = null
		PushSession(tokens, registrar(), devices::forBearer, replanReminders = { replans++ }).signedOut("fp_old")
		assertEquals(listOf("DELETE fp_old fcm-1"), devices.calls)
		assertEquals(1, tokens.deleted)
		assertEquals(1, replans)
	}

	@Test
	fun `push disabled - sign-in is a no-op, sign-out still clears reminders`() = runBlocking {
		var replans = 0
		val session = PushSession(null, registrar(), devices::forBearer, replanReminders = { replans++ })
		session.signedIn()
		session.signedOut("fp_old")
		assertTrue(devices.calls.isEmpty())
		assertEquals(1, replans)
	}

	@Test
	fun `failed unregister still drops the FCM token so the server prunes it`() = runBlocking {
		devices.next = ApiResult.Err(ApiError.Network("offline"))
		val tokens = FakeTokens()
		PushSession(tokens, registrar(), devices::forBearer, replanReminders = {}).signedOut("fp_old")
		assertEquals(1, tokens.deleted)
		assertTrue(retried.isEmpty())
	}
}
