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
 * Wire contract vs the LIVE /api/events endpoint (issue 082): strict date
 * window, 400 message text copied verbatim from the deployed server, per-day
 * occurrence entries.
 */
class EventsApiContractTest {
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
	fun `month window sends first and last day of month`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(200).setBody("""{"window":{},"events":[]}"""))
		NetworkTaskRepository(api).monthEvents(2026, 11)
		val recorded = server.takeRequest()
		assertEquals("/api/events?from=2026-11-01&to=2026-11-30", recorded.path)
		assertEquals("Bearer fp_token123", recorded.getHeader("Authorization"))
	}

	@Test
	fun `shortest month still measures a full window`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(200).setBody("""{"window":{},"events":[]}"""))
		NetworkTaskRepository(api).monthEvents(2026, 2)
		assertEquals("/api/events?from=2026-02-01&to=2026-02-28", server.takeRequest().path)
	}

	@Test
	fun `parses window and occurrence list`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(200).setBody(
				"""{"window":{"from":"2026-11-01","to":"2026-11-30"},"events": [
				{"id":"abc~2026-11-08","title":"Family gym","start":"2026-11-08T14:00:00.000Z",
				"allDay":false,"masterId":"abc","occurrenceDate":"2026-11-08","date":"2026-11-08",
				"rsvpStatus":"declined"}]}""",
			),
		)
		val events = NetworkTaskRepository(api).monthEvents(2026, 11)
		events as ApiResult.Ok
		assertEquals(1, events.value.size)
		assertEquals("abc~2026-11-08", events.value[0].id)
		assertEquals("declined", events.value[0].rsvpStatus)
	}

	@Test
	fun `empty window is an ok empty list`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(200).setBody("""{"window":{"from":"2026-11-01","to":"2026-11-30"},"events":[]}"""))
		val events = NetworkTaskRepository(api).monthEvents(2026, 11)
		assertTrue(events is ApiResult.Ok && events.value.isEmpty())
	}

	@Test
	fun `missing parameter surfaces the exact server message`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(400)
				.setBody("""{"error":"Ask for a range: ?from=YYYY-MM-DD&to=YYYY-MM-DD."}"""),
		)
		val result = NetworkTaskRepository(api).monthEvents(2026, 11)
		result as ApiResult.Err
		assertEquals("Ask for a range: ?from=YYYY-MM-DD&to=YYYY-MM-DD.", result.error.message)
	}

	@Test
	fun `invalid bearer is Unauthorized`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Unauthorized"}"""))
		val result = NetworkTaskRepository(api).monthEvents(2026, 11)
		assertTrue(result is ApiResult.Err && result.error is ApiError.Unauthorized)
	}
}
