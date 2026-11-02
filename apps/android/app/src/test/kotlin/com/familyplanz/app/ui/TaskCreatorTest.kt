package com.familyplanz.app.ui

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.CreateTaskRequest
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.data.TaskSource
import com.familyplanz.app.domain.TaskMapper
import com.familyplanz.app.domain.TaskPriority
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** Gated fake: createTask suspends until the test answers it. */
private class FakeTaskSource : TaskSource {
	val requests = mutableListOf<CreateTaskRequest>()
	val answer = CompletableDeferred<ApiResult<TaskDto>>()

	override suspend fun createTask(request: CreateTaskRequest): ApiResult<TaskDto> {
		requests += request
		return answer.await()
	}

	override suspend fun allTasks(): ApiResult<List<TaskDto>> = error("unused")
	override suspend fun toggleComplete(id: String): ApiResult<TaskDto> = error("unused")
	override suspend fun requestFocusStart(taskId: String): ApiResult<Unit> = error("unused")
	override suspend fun requestFocusStop(): ApiResult<Unit> = error("unused")
	override suspend fun respondToAssignment(taskId: String, status: String): ApiResult<TaskDto> = error("unused")
	override suspend fun cachedTasks(): List<TaskDto>? = null
}

class TaskCreatorTest {
	private val existing = TaskMapper.fromDto(TaskDto(id = "t1", title = "Old"))
	private val source = FakeTaskSource()
	private val state = MutableStateFlow<AppUiState>(AppUiState.Ready(listOf(existing), meId = "me"))
	private val creator = TaskCreator(source, state) { "tmp1" }

	private fun ready() = state.value as AppUiState.Ready

	@Test
	fun `request trims title and carries ISO date and lowercase priority`() {
		val input = NewTaskInput("  Pay rent  ", LocalDate.of(2026, 11, 5), TaskPriority.HIGH)
		assertEquals(CreateTaskRequest("Pay rent", "2026-11-05", "high"), input.toRequest())
		assertEquals(CreateTaskRequest("Buy milk", null, "normal"), NewTaskInput("Buy milk").toRequest())
		assertNull(NewTaskInput("   ").toRequest())
	}

	@Test
	fun `category (#280) is trimmed, blank means none, and shows on the pending row`() = runBlocking {
		assertEquals("Work", NewTaskInput("Ship", category = "  Work ").toRequest()?.category)
		assertNull(NewTaskInput("Ship", category = "   ").toRequest()?.category)
		assertNull(NewTaskInput("Ship").toRequest()?.category)

		val job = launch(start = CoroutineStart.UNDISPATCHED) { creator.create(NewTaskInput("Ship", category = " Work")) }
		assertEquals("Work", ready().tasks.first().category)
		source.answer.complete(ApiResult.Ok(TaskDto(id = "srv9", title = "Ship", category = "Work")))
		job.join()
		assertEquals("Work", ready().tasks.first().category)
	}

	@Test
	fun `blank title never calls the server and says why inline`() = runBlocking {
		val outcome = creator.create(NewTaskInput("  "))
		assertEquals(CreateOutcome.Invalid, outcome)
		assertTrue(source.requests.isEmpty())
		assertEquals("Title is required", ready().createError)
		assertEquals(listOf("t1"), ready().tasks.map { it.id })
	}

	@Test
	fun `pending row shows at once, then becomes the server task`() = runBlocking {
		val job = launch(start = CoroutineStart.UNDISPATCHED) { creator.create(NewTaskInput("Buy milk")) }

		val pending = ready().tasks.first()
		assertEquals("tmp1", pending.id)
		assertEquals("Buy milk", pending.title)
		assertTrue(pending.pending)
		assertEquals(2, ready().tasks.size)

		source.answer.complete(ApiResult.Ok(TaskDto(id = "srv9", title = "Buy milk", priority = "normal")))
		job.join()
		assertEquals(listOf("srv9", "t1"), ready().tasks.map { it.id })
		assertTrue(ready().tasks.none { it.pending })
	}

	@Test
	fun `success reports the created title`() = runBlocking {
		source.answer.complete(ApiResult.Ok(TaskDto(id = "srv9", title = "Buy milk")))
		assertEquals(CreateOutcome.Created("Buy milk"), creator.create(NewTaskInput("Buy milk")))
	}

	@Test
	fun `server rejection rolls back and shows the server text inline`() = runBlocking {
		source.answer.complete(ApiResult.Err(ApiError.BadRequest("Invalid dueDate")))
		val outcome = creator.create(NewTaskInput("Rake", LocalDate.of(2026, 11, 5)))

		assertEquals(CreateOutcome.Rejected("Couldn't add \"Rake\": Invalid dueDate"), outcome)
		assertEquals(listOf("t1"), ready().tasks.map { it.id })
		assertEquals("Couldn't add \"Rake\": Invalid dueDate", ready().createError)
	}

	@Test
	fun `401 rolls back and asks the host for a new token`() = runBlocking {
		source.answer.complete(ApiResult.Err(ApiError.Unauthorized))
		assertEquals(CreateOutcome.Unauthorized, creator.create(NewTaskInput("Rake")))
		assertEquals(listOf("t1"), ready().tasks.map { it.id })
	}

	@Test
	fun `next submit clears a previous inline error`() = runBlocking {
		creator.create(NewTaskInput(""))
		val job = launch(start = CoroutineStart.UNDISPATCHED) { creator.create(NewTaskInput("Rake")) }
		assertNull(ready().createError)
		source.answer.complete(ApiResult.Ok(TaskDto(id = "srv9", title = "Rake")))
		job.join()
	}

	@Test
	fun `refresh during flight does not duplicate the created task`() = runBlocking {
		val job = launch(start = CoroutineStart.UNDISPATCHED) { creator.create(NewTaskInput("Rake")) }
		val refreshed = TaskMapper.fromDto(TaskDto(id = "srv9", title = "Rake"))
		state.value = AppUiState.Ready(listOf(refreshed, existing), meId = "me")

		source.answer.complete(ApiResult.Ok(TaskDto(id = "srv9", title = "Rake")))
		job.join()
		assertEquals(listOf("srv9", "t1"), ready().tasks.map { it.id })
	}
}
