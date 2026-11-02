package com.familyplanz.app.sync

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.EventDto
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.reminders.ReminderPlanner
import java.time.LocalDate

/** The two repository reads the background job needs (write-through caches them). */
interface CacheRefreshSource {
	suspend fun allTasks(): ApiResult<List<TaskDto>>

	suspend fun monthEvents(year: Int, month: Int): ApiResult<List<EventDto>>
}

enum class RefreshOutcome { SKIPPED_NO_TOKEN, REFRESHED, UNAUTHORIZED, RETRY, FAILED }

class CacheRefresher(
	private val source: CacheRefreshSource,
	private val tokenProvider: suspend () -> String?,
	private val today: () -> LocalDate = { LocalDate.now() },
) {
	/**
	 * Signed out → no-op. 401 → stop (cache untouched; the app shows the
	 * re-auth prompt on next open). Network/5xx → retry with backoff.
	 */
	suspend fun refresh(): RefreshOutcome {
		if (tokenProvider().isNullOrBlank()) return RefreshOutcome.SKIPPED_NO_TOKEN
		val tasks = outcomeOf(source.allTasks())
		val events = if (tasks == RefreshOutcome.UNAUTHORIZED) tasks else horizonMonthsOutcome()
		return PRECEDENCE.first { it == tasks || it == events }
	}

	/** Current month, plus next month when the 14-day reminder horizon crosses into it (#271). */
	private suspend fun horizonMonthsOutcome(): RefreshOutcome {
		val outcomes = ReminderPlanner.monthsToCover(today()).map {
			outcomeOf(source.monthEvents(it.year, it.monthValue))
		}
		return PRECEDENCE.first { it in outcomes }
	}

	private fun outcomeOf(result: ApiResult<*>): RefreshOutcome = when (result) {
		is ApiResult.Ok -> RefreshOutcome.REFRESHED
		is ApiResult.Err -> when (result.error) {
			ApiError.Unauthorized -> RefreshOutcome.UNAUTHORIZED
			is ApiError.Network, is ApiError.Server -> RefreshOutcome.RETRY
			else -> RefreshOutcome.FAILED
		}
	}

	private companion object {
		/** Worst outcome of the two reads wins. */
		val PRECEDENCE = listOf(
			RefreshOutcome.UNAUTHORIZED,
			RefreshOutcome.RETRY,
			RefreshOutcome.FAILED,
			RefreshOutcome.REFRESHED,
		)
	}
}
