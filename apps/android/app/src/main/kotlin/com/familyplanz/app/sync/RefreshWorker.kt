package com.familyplanz.app.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ListenableWorker
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.familyplanz.app.BuildConfig
import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.data.EventDto
import com.familyplanz.app.data.FileTaskCache
import com.familyplanz.app.data.NetworkTaskRepository
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.reminders.Reminders
import java.util.concurrent.TimeUnit

/**
 * Periodic offline-cache refresh (issue #268). The repository writes
 * through to the file cache, so a successful read is the whole job.
 */
class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
	override suspend fun doWork(): Result = refreshAndReplan(applicationContext).toWorkResult()
}

/**
 * Network → cache for tasks and the reminder-horizon months, then (#271)
 * re-plan alarms from the fresh cache. Shared by the 6h job and #273's
 * `events_changed` push worker.
 */
suspend fun refreshAndReplan(context: Context): RefreshOutcome {
	val app = context.applicationContext
	val token = DataStoreTokenStore(app).token()
	val api = ApiFactory.create(BuildConfig.API_BASE_URL) { token }
	val repo = NetworkTaskRepository(api, FileTaskCache(app.filesDir))
	val source = object : CacheRefreshSource {
		override suspend fun allTasks(): ApiResult<List<TaskDto>> = repo.allTasks()

		override suspend fun monthEvents(year: Int, month: Int): ApiResult<List<EventDto>> =
			repo.monthEvents(year, month)
	}
	val outcome = CacheRefresher(source, tokenProvider = { token }).refresh()
	if (outcome == RefreshOutcome.REFRESHED) Reminders.rescheduleFromCache(app)
	return outcome
}

/** 401 and 4xx end the run quietly (no retry storm); network/5xx back off. */
fun RefreshOutcome.toWorkResult(): ListenableWorker.Result = when (this) {
	RefreshOutcome.SKIPPED_NO_TOKEN,
	RefreshOutcome.REFRESHED,
	RefreshOutcome.UNAUTHORIZED -> ListenableWorker.Result.success()
	RefreshOutcome.RETRY -> ListenableWorker.Result.retry()
	RefreshOutcome.FAILED -> ListenableWorker.Result.failure()
}

object BackgroundRefresh {
	private const val WORK_NAME = "fp-cache-refresh"
	private const val INTERVAL_HOURS = 6L

	/** Idempotent: KEEP leaves an already-scheduled job (and its timing) alone. */
	fun schedule(context: Context) {
		val constraints = Constraints.Builder()
			.setRequiredNetworkType(NetworkType.CONNECTED)
			.setRequiresBatteryNotLow(true)
			.build()
		val request = PeriodicWorkRequestBuilder<RefreshWorker>(INTERVAL_HOURS, TimeUnit.HOURS)
			.setConstraints(constraints)
			.build()
		WorkManager.getInstance(context)
			.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
	}
}
