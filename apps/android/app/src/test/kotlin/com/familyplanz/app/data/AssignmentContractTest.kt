package com.familyplanz.app.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import com.familyplanz.app.domain.TaskMapper

/**
 * Handoff responses run against the same PUT seam as completions, with the
 * server rule "only the current assignee may accept/decline" enforced
 * server-side; the phone sends the status field and nothing else.
 */
class AssignmentContractTest {
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
	fun `accept sends only assignmentStatus`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(200).setBody(
				"""{"success":true,"task":{"id":"t9","title":"Recycling run",
				"assignedTo":"me-1","assignmentStatus":"accepted","priority":"normal"}}""",
			),
		)
		val result = NetworkTaskRepository(api).respondToAssignment("t9", "accepted")
		val recorded = server.takeRequest()
		assertEquals("/api/tasks/t9", recorded.path)
		assertEquals("""{"assignmentStatus":"accepted"}""", recorded.body.readUtf8())
		assertEquals(
			"accepted",
			TaskMapper.fromDto((result as ApiResult.Ok).value).assignmentStatus,
		)
	}

	@Test
	fun `decline sends the declined field`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(200).setBody(
				"""{"success":true,"task":{"id":"t9","title":"Recycling run","assignmentStatus":"declined"}}""",
			),
		)
		NetworkTaskRepository(api).respondToAssignment("t9", "declined")
		assertEquals("""{"assignmentStatus":"declined"}""", server.takeRequest().body.readUtf8())
	}

	@Test
	fun `non-assignee 403 surfaces server text`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(403)
				.setBody("""{"error":"You can only respond to your own assignments"}"""),
		)
		val result = NetworkTaskRepository(api).respondToAssignment("t9", "accepted")
		result as ApiResult.Err
		assertEquals("You can only respond to your own assignments", result.error.message)
	}

	@Test
	fun `me endpoint parses identity and sends bearer`() = runBlocking {
		server.enqueue(
			MockResponse().setResponseCode(200).setBody(
				"""{"id":"me-1","firstName":"Guest","lastName":null}""",
			),
		)
		val result = NetworkTaskRepository(api).me()
		val recorded = server.takeRequest()
		assertEquals("/api/me", recorded.path)
		assertEquals("Bearer fp_token123", recorded.getHeader("Authorization"))
		val me = (result as ApiResult.Ok).value
		assertEquals("me-1", me.id)
		assertEquals("Guest", me.firstName)
	}

	@Test
	fun `assignmentStatus none reads as no pending handoff`() {
		val dto = ApiFactory.json.decodeFromString<TaskDto>(
			"""{"id":"t2","title":"x","assignedTo":"me-1","assignmentStatus":"none"}""",
		)
		assertNull(TaskMapper.fromDto(dto).assignmentStatus)
	}
}
