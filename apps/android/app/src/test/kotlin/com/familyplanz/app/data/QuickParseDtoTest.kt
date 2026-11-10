package com.familyplanz.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * POST /api/parse-event bodies/responses (#302): the cloud flag on the way
 * out, and the server's single / per-result multi shapes on the way in.
 */
class QuickParseDtoTest {
	private fun decode(body: String): QuickParseResponse =
		ApiFactory.json.decodeFromString(QuickParseResponse.serializer(), body)

	@Test
	fun `a_request_default_clouds_the_parser`() {
		val request = QuickParseRequest("Lunch Friday at noon")
		assertTrue(request.useCloud)
		// ApiFactory.json sets encodeDefaults = false: the default true stays off the
		// wire and the server keeps its own default, which is the cloud parser.
		val body = ApiFactory.json.encodeToString(QuickParseRequest.serializer(), request)
		assertEquals("""{"input":"Lunch Friday at noon"}""", body)
	}

	@Test
	fun `a_request_can_decline_the_cloud`() {
		val request = QuickParseRequest("Lunch Friday at noon", useCloud = false)
		val body = ApiFactory.json.encodeToString(QuickParseRequest.serializer(), request)
		assertEquals("""{"input":"Lunch Friday at noon","useCloud":false}""", body)
	}

	@Test
	fun `a_multi_response_decodes_per_result`() {
		val response = decode(
			"""
			{"results":[{"parsed":{"title":"Dinner","date":"2026-11-06"},"confidence":0.9},
			{"parsed":{"title":"Movie"},"confidence":0.55}],"method":"regex-list"}
			""".trimIndent(),
		)
		assertEquals(2, response.results.size)
		assertEquals("Dinner", response.results[0].parsed?.title)
		assertEquals("2026-11-06", response.results[0].parsed?.date)
		assertEquals("Movie", response.results[1].parsed?.title)
		assertEquals(0.9, response.results[0].confidence, 0.0)
		assertEquals(0.55, response.results[1].confidence, 0.0)
		assertNull(response.parsed)
		assertEquals("regex-list", response.method)
	}

	@Test
	fun `a_single_response_decodes_as_before`() {
		val response = decode("""{"parsed":{"title":"Dinner"},"confidence":0.85,"method":"cloud"}""")
		assertEquals("Dinner", response.parsed?.title)
		assertEquals(0.85, response.confidence, 0.0)
		assertEquals("cloud", response.method)
		assertTrue(response.results.isEmpty())
	}

	@Test
	fun `an_old_singleton_shape_still_decodes`() {
		val response = decode("""{"parsed":{},"confidence":0,"method":"regex"}""")
		assertTrue(response.parsed != null)
		assertNull(response.parsed?.title)
		assertTrue(response.results.isEmpty())
	}

	@Test
	fun `response_defaults_are_safe`() {
		val response = decode("""{"method":"regex-list"}""")
		assertNull(response.parsed)
		assertEquals(0.0, response.confidence, 0.0)
		assertTrue(response.results.isEmpty())
	}
}
