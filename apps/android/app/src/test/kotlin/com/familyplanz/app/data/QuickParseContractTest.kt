package com.familyplanz.app.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * POST /api/parse-event wire contract: single vs multi-response shapes,
 * verbatim 400 text, 429 (AI spend cap) surfaced with the server's reason.
 */
class QuickParseContractTest {
	private lateinit var server: MockWebServer
	private lateinit var api: FamilyPlanzApi

	@Before
	fun setUp() {
		server = MockWebServer()
		server.start()
		api = ApiFactory.create(server.url("/").toString()) { "fp_token123" }
	}

	@After
	fun tearDown() {
		server.shutdown()
	}

	@Test
	fun `single parse maps parsed confidence and method`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(200).setBody(
				"""{"parsed":{"title":"Dinner","date":"2026-11-06","startTime":"19:00",
				"endTime":"21:00","location":"The park","allDay":false,"attendants":["Ana"]},
				"confidence":0.85,"method":"cloud"}""",
			),
		)
		val result = NetworkTaskRepository(api).parseQuickAdd("dinner friday at 7 at the park")
		val recorded = server.takeRequest()
		assertEquals("/api/parse-event", recorded.path)
		assertEquals("""{"input":"dinner friday at 7 at the park"}""", recorded.body.readUtf8())
		assertTrue(result is ApiResult.Ok)
		result as ApiResult.Ok
		assertEquals("Dinner", result.value.parsed?.title)
		assertEquals(0.85, result.value.confidence, 0.0)
		assertEquals("cloud", result.value.method)
	}

	@Test
	fun `regex-list multi response maps the results list`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(200).setBody(
				"""{"results":[{"title":"Dinner","date":"2026-11-06"},
				{"title":"Movie","date":"2026-11-07","allDay":true}],"method":"regex-list"}""",
			),
		)
		val result = NetworkTaskRepository(api).parseQuickAdd("dinner friday and movie saturday")
		result as ApiResult.Ok
		assertEquals(2, result.value.results.size)
		assertEquals("Movie", result.value.results[1].title)
		assertTrue(result.value.results[1].allDay == true)
	}

	@Test
	fun `input required surfaces verbatim`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"Input required"}"""))
		val result = NetworkTaskRepository(api).parseQuickAdd("")
		result as ApiResult.Err
		assertEquals("Input required", result.error.message)
	}

	@Test
	fun `ai spend cap refusal surfaces the server reason`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(429).setBody("""{"error":"AI usage limit reached"}"""),
		)
		val result = NetworkTaskRepository(api).parseQuickAdd("dinner friday")
		result as ApiResult.Err
		assertEquals("AI usage limit reached", result.error.message)
	}
}
