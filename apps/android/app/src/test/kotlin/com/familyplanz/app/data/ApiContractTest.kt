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
 * Wire-level contract tests against docs/guides/task-api-spec.md using the
 * production ApiFactory (same Json settings + Bearer interceptor).
 */
class ApiContractTest {
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
	fun `start focus posts taskId, sends exact bearer header, parses envelope`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(201).setBody(
				"""{"id":"c1","command":"start","taskId":"t42","issuedAt":"2026-10-29T09:00:00.000Z"}""",
			),
		)
		val result = NetworkTaskRepository(api).requestFocusStart("t42")

		val recorded = server.takeRequest()
		assertEquals("/api/taskfocus/commands", recorded.path)
		assertEquals("Bearer fp_token123", recorded.getHeader("Authorization"))
		assertTrue(recorded.body.readUtf8().contains("\"taskId\":\"t42\""))
		assertTrue("start focus must succeed", result is ApiResult.Ok)
	}

	@Test
	fun `stop focus body omits taskId`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(201).setBody(
				"""{"id":"c2","command":"stop","taskId":null,"issuedAt":"2026-10-29T09:00:01.000Z"}""",
			),
		)
		NetworkTaskRepository(api).requestFocusStop()
		assertEquals("""{"command":"stop"}""", server.takeRequest().body.readUtf8())
	}

	@Test
	fun `tasks read parses empty and full lists`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(200).setBody("""{"tasks":[]}"""))
		assertTrue(NetworkTaskRepository(api).allTasks() is ApiResult.Ok<*>)

		server.enqueue(
			MockResponse().setResponseCode(200).setBody(
				"""{"tasks":[{"id":"t1","title":"Water plants","focusMinutes":15,"priority":"low"}]}""",
			),
		)
		val tasks = (NetworkTaskRepository(api).allTasks() as ApiResult.Ok).value
		assertEquals(1, tasks.size)
		assertEquals(15, tasks[0].focusMinutes)
	}

	@Test
	fun `401 maps to Unauthorized`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Unauthorized"}"""))
		val result = NetworkTaskRepository(api).allTasks()
		assertTrue(result is ApiResult.Err && result.error is ApiError.Unauthorized)
	}

	@Test
	fun `500 message surfaces raw for display`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(500).setBody("""{"error":"Database connection lost"}"""))
		val result = NetworkTaskRepository(api).allTasks()
		result as ApiResult.Err
		assertEquals("Database connection lost", result.error.message)
	}

	@Test
	fun `400 on foreign-task start surfaces server text`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"Task not found"}"""))
		val result = NetworkTaskRepository(api).requestFocusStart("not-ours")
		result as ApiResult.Err
		assertEquals("Task not found", result.error.message)
	}

	@Test
	fun `toggle complete PUT carries only the toggle field`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(200).setBody(
				"""{"success":true,"task":{"id":"t1","title":"Water plants","completedAt":"2026-10-29T09:00:02.000Z"}}""",
			),
		)
		val result = NetworkTaskRepository(api).toggleComplete("t1")

		val recorded = server.takeRequest()
		assertEquals("PUT", recorded.method)
		assertEquals("/api/tasks/t1", recorded.path)
		assertEquals("""{"toggleComplete":true}""", recorded.body.readUtf8())
		assertTrue(result is ApiResult.Ok && com.familyplanz.app.domain.TaskMapper.fromDto(result.value).completed)
	}
}
