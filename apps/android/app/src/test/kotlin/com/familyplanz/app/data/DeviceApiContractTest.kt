package com.familyplanz.app.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** Issue #273 against the #272 contract (docs/guides/task-api-spec.md, "Android push devices"). */
class DeviceApiContractTest {
	private lateinit var server: MockWebServer
	private lateinit var devices: DeviceSource

	@Before
	fun setUp() {
		server = MockWebServer()
		server.start()
		devices = NetworkDeviceSource(ApiFactory.create(server.url("/").toString()) { "fp_token123" })
	}

	@After
	fun tearDown() {
		server.shutdown()
	}

	@Test
	fun `register posts token and android platform with the bearer`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(200).setBody("""{"success":true}"""))
		val result = devices.register("fcm-abc")

		val recorded = server.takeRequest()
		assertEquals("POST", recorded.method)
		assertEquals("/api/devices", recorded.path)
		assertEquals("Bearer fp_token123", recorded.getHeader("Authorization"))
		assertEquals("""{"token":"fcm-abc","platform":"android"}""", recorded.body.readUtf8())
		assertEquals(ApiResult.Ok(Unit), result)
	}

	@Test
	fun `unregister sends DELETE with only the token in the body`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(200).setBody("""{"success":true}"""))
		val result = devices.unregister("fcm-abc")

		val recorded = server.takeRequest()
		assertEquals("DELETE", recorded.method)
		assertEquals("/api/devices", recorded.path)
		assertEquals("Bearer fp_token123", recorded.getHeader("Authorization"))
		assertEquals("""{"token":"fcm-abc"}""", recorded.body.readUtf8())
		assertEquals(ApiResult.Ok(Unit), result)
	}

	@Test
	fun `400 surfaces the server error text`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"token is too long"}"""))
		assertEquals(ApiResult.Err(ApiError.BadRequest("token is too long")), devices.register("x".repeat(5000)))

		server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"token is required"}"""))
		assertEquals(ApiResult.Err(ApiError.BadRequest("token is required")), devices.unregister(""))
	}

	@Test
	fun `401 maps to Unauthorized on both calls`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Unauthorized"}"""))
		assertEquals(ApiResult.Err(ApiError.Unauthorized), devices.register("fcm-abc"))
		server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Unauthorized"}"""))
		assertEquals(ApiResult.Err(ApiError.Unauthorized), devices.unregister("fcm-abc"))
	}

	@Test
	fun `dropped connection is a Network error`() = runBlocking {
		server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
		val result = devices.register("fcm-abc")
		assertTrue(result is ApiResult.Err && result.error is ApiError.Network)
	}
}
