package com.familyplanz.app.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * #289 TaskFocus fusion: the focus command channel and the focus read fields
 * at the wire, through the production ApiFactory. The phone never writes
 * focus time: every task PUT leaves both focus fields out (absent = unchanged).
 */
class FocusCommandContractTest {
	private lateinit var server: MockWebServer
	private lateinit var repo: NetworkTaskRepository

	@Before
	fun setUp() {
		server = MockWebServer()
		server.start()
		repo = NetworkTaskRepository(ApiFactory.create(server.url("/").toString()) { "fp_token123" })
	}

	@After
	fun tearDown() {
		server.shutdown()
	}

	private fun created(command: String, taskId: String?) = MockResponse().setResponseCode(201).setBody(
		"""{"id":"c1","command":"$command","taskId":${taskId?.let { "\"$it\"" } ?: "null"},"issuedAt":"2026-11-03T10:00:00.000Z"}""",
	)

	@Test
	fun `start posts the exact start body with bearer auth`() = runBlocking {
		server.enqueue(created("start", "t9"))
		val result = repo.requestFocusStart("t9")

		val recorded = server.takeRequest()
		assertEquals("POST", recorded.method)
		assertEquals("/api/taskfocus/commands", recorded.path)
		assertEquals("Bearer fp_token123", recorded.getHeader("Authorization"))
		assertEquals("""{"command":"start","taskId":"t9"}""", recorded.body.readUtf8())
		assertEquals(ApiResult.Ok(Unit), result)
	}

	@Test
	fun `stop posts the exact stop body`() = runBlocking {
		server.enqueue(created("stop", null))
		assertEquals(ApiResult.Ok(Unit), repo.requestFocusStop())
		assertEquals("""{"command":"stop"}""", server.takeRequest().body.readUtf8())
	}

	@Test
	fun `404 and 405 mean a server without the command API`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(404).setBody("<html>Not Found</html>"))
		assertEquals(ApiResult.Err(ApiError.Unsupported), repo.requestFocusStart("t9"))

		server.enqueue(MockResponse().setResponseCode(405).setBody("""{"error":"Method Not Allowed"}"""))
		assertEquals(ApiResult.Err(ApiError.Unsupported), repo.requestFocusStop())
		assertEquals("This FamilyPlanz server can't reach TaskFocus yet", ApiError.Unsupported.message)
	}

	@Test
	fun `other failures keep the normal error mapping`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(500).setBody("""{"error":"Database connection lost"}"""))
		assertEquals(ApiResult.Err(ApiError.Server("Database connection lost")), repo.requestFocusStart("t9"))

		server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Unauthorized"}"""))
		assertEquals(ApiResult.Err(ApiError.Unauthorized), repo.requestFocusStop())
	}

	@Test
	fun `a 404 elsewhere is still NotFound, not Unsupported`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"Task not found"}"""))
		assertEquals(ApiResult.Err(ApiError.NotFound("Task not found")), repo.toggleComplete("gone"))
	}

	@Test
	fun `GET tasks reads focusMinutes and focusStartedAt`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(200).setBody(
				"""{"tasks":[{"id":"t1","title":"Write","focusMinutes":40,"focusStartedAt":"2026-11-03T09:35:00.000Z"},""" +
					"""{"id":"t2","title":"Read"}]}""",
			),
		)
		val tasks = (repo.allTasks() as ApiResult.Ok).value
		assertEquals(40, tasks[0].focusMinutes)
		assertEquals("2026-11-03T09:35:00.000Z", tasks[0].focusStartedAt)
		assertEquals(null, tasks[1].focusStartedAt)
	}

	@Test
	fun `task PUTs never carry focusMinutes or focusStartedAt`() = runBlocking {
		val echo = """{"success":true,"task":{"id":"t1","title":"Write","focusMinutes":40,"focusStartedAt":"2026-11-03T09:35:00.000Z"}}"""
		server.enqueue(MockResponse().setResponseCode(200).setBody(echo))
		server.enqueue(MockResponse().setResponseCode(200).setBody(echo))

		repo.toggleComplete("t1")
		repo.respondToAssignment("t1", "accepted")

		repeat(2) {
			val recorded = server.takeRequest()
			assertEquals("PUT", recorded.method)
			val body = recorded.body.readUtf8()
			assertTrue(body.startsWith("{"))
			assertFalse("focusMinutes must never be written by the phone: $body", body.contains("focusMinutes"))
			assertFalse("focusStartedAt must never be written by the phone: $body", body.contains("focusStartedAt"))
		}
	}
}
