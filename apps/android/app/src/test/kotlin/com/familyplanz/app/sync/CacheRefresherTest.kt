package com.familyplanz.app.sync

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.EventDto
import com.familyplanz.app.data.TaskDto
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** Background refresh decisions (issue #268) against a fake source. */
class CacheRefresherTest {
	private class FakeSource(
		val tasksResult: ApiResult<List<TaskDto>> = ApiResult.Ok(emptyList()),
		val eventsResult: ApiResult<List<EventDto>> = ApiResult.Ok(emptyList()),
	) : CacheRefreshSource {
		val calls = mutableListOf<String>()

		override suspend fun allTasks(): ApiResult<List<TaskDto>> {
			calls += "tasks"
			return tasksResult
		}

		override suspend fun monthEvents(year: Int, month: Int): ApiResult<List<EventDto>> {
			calls += "events-$year-$month"
			return eventsResult
		}
	}

	private val today = LocalDate.of(2026, 11, 2)

	private fun refresher(source: FakeSource, token: String?) =
		CacheRefresher(source, tokenProvider = { token }, today = { today })

	@Test
	fun `no token is a no-op success`() = runBlocking {
		val source = FakeSource()
		assertEquals(RefreshOutcome.SKIPPED_NO_TOKEN, refresher(source, null).refresh())
		assertTrue(source.calls.isEmpty())
	}

	@Test
	fun `blank token is treated as signed out`() = runBlocking {
		val source = FakeSource()
		assertEquals(RefreshOutcome.SKIPPED_NO_TOKEN, refresher(source, "  ").refresh())
		assertTrue(source.calls.isEmpty())
	}

	@Test
	fun `token refreshes tasks and the current month`() = runBlocking {
		val source = FakeSource()
		assertEquals(RefreshOutcome.REFRESHED, refresher(source, "fp_x").refresh())
		assertEquals(listOf("tasks", "events-2026-11"), source.calls)
	}

	@Test
	fun `unauthorized stops without retry and calls nothing else`() = runBlocking {
		val source = FakeSource(tasksResult = ApiResult.Err(ApiError.Unauthorized))
		assertEquals(RefreshOutcome.UNAUTHORIZED, refresher(source, "fp_x").refresh())
		assertEquals(listOf("tasks"), source.calls)
	}

	@Test
	fun `unauthorized on events also stops`() = runBlocking {
		val source = FakeSource(eventsResult = ApiResult.Err(ApiError.Unauthorized))
		assertEquals(RefreshOutcome.UNAUTHORIZED, refresher(source, "fp_x").refresh())
	}

	@Test
	fun `unauthorized outranks a retry from the other read`() = runBlocking {
		val source = FakeSource(
			tasksResult = ApiResult.Err(ApiError.Network("down")),
			eventsResult = ApiResult.Err(ApiError.Unauthorized),
		)
		assertEquals(RefreshOutcome.UNAUTHORIZED, refresher(source, "fp_x").refresh())
	}

	@Test
	fun `network failure asks for a retry`() = runBlocking {
		val source = FakeSource(eventsResult = ApiResult.Err(ApiError.Network("timeout")))
		assertEquals(RefreshOutcome.RETRY, refresher(source, "fp_x").refresh())
	}

	@Test
	fun `server error asks for a retry`() = runBlocking {
		val source = FakeSource(tasksResult = ApiResult.Err(ApiError.Server("boom")))
		assertEquals(RefreshOutcome.RETRY, refresher(source, "fp_x").refresh())
	}

	@Test
	fun `client error fails without retry`() = runBlocking {
		val source = FakeSource(tasksResult = ApiResult.Err(ApiError.Forbidden("nope")))
		assertEquals(RefreshOutcome.FAILED, refresher(source, "fp_x").refresh())
	}

	@Test
	fun `tasks network failure still refreshes events`() = runBlocking {
		val source = FakeSource(tasksResult = ApiResult.Err(ApiError.Network("down")))
		assertEquals(RefreshOutcome.RETRY, refresher(source, "fp_x").refresh())
		assertEquals(listOf("tasks", "events-2026-11"), source.calls)
	}
}
