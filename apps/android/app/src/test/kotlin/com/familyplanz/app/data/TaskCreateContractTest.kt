package com.familyplanz.app.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** POST /api/tasks wire contract (docs/guides/task-api-spec.md, issue 270). */
class TaskCreateContractTest {
	private lateinit var server: MockWebServer
	private lateinit var source: TaskSource

	@Before
	fun setUp() {
		server = MockWebServer()
		server.start()
		source = NetworkTaskRepository(ApiFactory.create(server.url("/").toString()) { "fp_token123" })
	}

	@After
	fun tearDown() {
		server.shutdown()
	}

	private fun created(body: String) = MockResponse().setResponseCode(201).setBody(body)

	@Test
	fun `title-only body carries just title and priority`() = runBlocking {
		server.enqueue(created("""{"success":true,"task":{"id":"srv1","title":"Buy milk"}}"""))
		source.createTask(CreateTaskRequest(title = "Buy milk", priority = "normal"))

		val recorded = server.takeRequest()
		assertEquals("POST", recorded.method)
		assertEquals("/api/tasks", recorded.path)
		assertEquals("Bearer fp_token123", recorded.getHeader("Authorization"))
		assertEquals("""{"title":"Buy milk","priority":"normal"}""", recorded.body.readUtf8())
	}

	@Test
	fun `due date and priority go on the wire as given`() = runBlocking {
		server.enqueue(created("""{"success":true,"task":{"id":"srv2","title":"Pay rent"}}"""))
		source.createTask(CreateTaskRequest(title = "Pay rent", dueDate = "2026-11-05", priority = "high"))

		assertEquals(
			"""{"title":"Pay rent","dueDate":"2026-11-05","priority":"high"}""",
			server.takeRequest().body.readUtf8(),
		)
	}

	@Test
	fun `201 and 200 envelopes both parse to the server task`() = runBlocking {
		val task = """{"id":"srv3","title":"Rake","priority":"low","dueDate":"2026-11-05T00:00:00.000Z","tags":[]}"""
		server.enqueue(created("""{"success":true,"task":$task}"""))
		server.enqueue(MockResponse().setResponseCode(200).setBody("""{"success":true,"task":$task}"""))

		repeat(2) {
			val result = source.createTask(CreateTaskRequest(title = "Rake", priority = "low"))
			result as ApiResult.Ok<TaskDto>
			assertEquals("srv3", result.value.id)
			assertEquals("low", result.value.priority)
		}
	}

	@Test
	fun `400 surfaces the server error text`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"Invalid dueDate"}"""))
		val result = source.createTask(CreateTaskRequest(title = "x", dueDate = "soon", priority = "normal"))

		assertTrue(result is ApiResult.Err && result.error is ApiError.BadRequest)
		assertEquals("Invalid dueDate", (result as ApiResult.Err).error.message)
	}
}
