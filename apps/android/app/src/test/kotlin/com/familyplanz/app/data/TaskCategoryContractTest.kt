package com.familyplanz.app.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** Task categories wire contract (#280; docs/guides/task-api-spec.md "Task categories"). */
class TaskCategoryContractTest {
	private lateinit var server: MockWebServer
	private lateinit var repo: TaskRepository

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

	@Test
	fun `GET task-categories parses the caller's list in server order`() = runBlocking {
		server.enqueue(
			MockResponse().setBody(
				"""{"categories":[
					{"id":"c1","name":"Home","createdAt":"2026-11-01T10:00:00.000Z","updatedAt":"2026-11-01T10:00:00.000Z"},
					{"id":"c2","name":"Work","createdAt":"2026-11-02T10:00:00.000Z","updatedAt":"2026-11-02T11:00:00.000Z","extra":1}
				]}""",
			),
		)

		val result = repo.taskCategories()

		val recorded = server.takeRequest()
		assertEquals("GET", recorded.method)
		assertEquals("/api/task-categories", recorded.path)
		assertEquals("Bearer fp_token123", recorded.getHeader("Authorization"))
		result as ApiResult.Ok
		assertEquals(listOf("Home", "Work"), result.value.map { it.name })
		assertEquals(TaskCategoryDto("c2", "Work", "2026-11-02T10:00:00.000Z", "2026-11-02T11:00:00.000Z"), result.value[1])
	}

	@Test
	fun `empty list and 401 map like every other read`() = runBlocking {
		server.enqueue(MockResponse().setBody("""{"categories":[]}"""))
		server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Unauthorized"}"""))

		assertEquals(ApiResult.Ok(emptyList<TaskCategoryDto>()), repo.taskCategories())
		val denied = repo.taskCategories()
		assertTrue(denied is ApiResult.Err && denied.error is ApiError.Unauthorized)
	}

	@Test
	fun `create with a category sends it, create without omits the key`() = runBlocking {
		val reply = """{"success":true,"task":{"id":"s1","title":"Ship","category":"Work"}}"""
		server.enqueue(MockResponse().setResponseCode(201).setBody(reply))
		server.enqueue(MockResponse().setResponseCode(201).setBody(reply))

		val created = repo.createTask(CreateTaskRequest(title = "Ship", priority = "normal", category = "Work"))
		repo.createTask(CreateTaskRequest(title = "Ship", priority = "normal"))

		assertEquals("""{"title":"Ship","priority":"normal","category":"Work"}""", server.takeRequest().body.readUtf8())
		assertEquals("""{"title":"Ship","priority":"normal"}""", server.takeRequest().body.readUtf8())
		assertEquals("Work", (created as ApiResult.Ok).value.category)
	}

	@Test
	fun `task list carries category, null or absent reads as none`() = runBlocking {
		server.enqueue(
			MockResponse().setBody(
				"""{"tasks":[{"id":"a","title":"A","category":"Deep Work"},{"id":"b","title":"B","category":null},{"id":"c","title":"C"}]}""",
			),
		)

		val tasks = (repo.allTasks() as ApiResult.Ok).value

		assertEquals("Deep Work", tasks[0].category)
		assertNull(tasks[1].category)
		assertNull(tasks[2].category)
	}
}
