package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import retrofit2.http.GET

/** One row of "Tasks land on" / "Tasks come from" (`TaskStats.topAssignees` / `topAssigners`). */
@Serializable
data class StatsPersonDto(val name: String = "", val total: Int = 0)

/** One line of "Recently completed"; [completedAt] is an ISO instant ("" = unknown). */
@Serializable
data class RecentlyCompletedDto(val title: String = "", val completedAt: String = "", val recurring: Boolean = false)

@Serializable
data class MonthStatsDto(val completed: Int = 0, val recurring: Int = 0)

/** `getTaskStats` (`taskStats.ts`): the figures the page reads; extra keys are ignored. */
@Serializable
data class TaskStatsDto(
	val topAssigners: List<StatsPersonDto> = emptyList(),
	val topAssignees: List<StatsPersonDto> = emptyList(),
	val recentlyCompleted: List<RecentlyCompletedDto> = emptyList(),
	val month: MonthStatsDto? = null,
)

/** `computeWeeklyStreak`: whole weeks of "at least one task completed". */
@Serializable
data class StreakDto(
	val current: Int = 0,
	val best: Int = 0,
	val freezeUsedInCurrentGap: Boolean = false,
)

/** `GET /api/stats` (G15), the `/calendar/stats` loader. */
@Serializable
data class StatsResponse(
	val stats: TaskStatsDto = TaskStatsDto(),
	val streak: StreakDto = StreakDto(),
	/** The instants behind the streak; the seven squares are drawn from these. */
	val completionIso: List<String> = emptyList(),
	val todayIso: String = "",
	val month: MonthStatsDto? = null,
)

internal interface StatsApi {
	@GET("api/stats")
	suspend fun stats(): StatsResponse
}

/** The Task stats page's data (G15). */
interface StatsSource {
	suspend fun stats(): ApiResult<StatsResponse>
}

internal class NetworkStatsSource(private val api: StatsApi) : StatsSource {
	override suspend fun stats(): ApiResult<StatsResponse> = apiCall { api.stats() }
}
