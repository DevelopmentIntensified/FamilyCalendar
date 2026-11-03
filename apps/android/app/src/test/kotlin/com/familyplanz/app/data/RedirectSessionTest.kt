package com.familyplanz.app.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Owner report 2026-11-03 "sessions expire immediately": the release base URL
 * was the apex familyplanz.com, which 308-redirects to www. OkHttp follows the
 * redirect but drops `Authorization` across hosts, so every signed-in call
 * reached the server token-less, got 401, and the app ended the session.
 * A redirect must never be read as "signed out".
 */
class RedirectSessionTest {
	private val apex = MockWebServer().apply { start() }
	private val www = MockWebServer().apply { start() }

	@After
	fun tearDown() {
		apex.shutdown()
		www.shutdown()
	}

	@Test
	fun a_cross_host_redirect_is_not_reported_as_unauthorized() {
		apex.enqueue(
			MockResponse().setResponseCode(308).setHeader("Location", www.url("/api/me").toString()),
		)
		www.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Unauthorized"}"""))
		val api = ApiFactory.create(apex.url("/").toString()) { "fp_real_token" }

		val result = runBlocking { NetworkAccountSource(api).me() }

		assertTrue("redirect surfaced as $result", result is ApiResult.Err && result.error !is ApiError.Unauthorized)
		assertEquals("the token must not be replayed to (or stripped for) another host", 0, www.requestCount)
	}
}
