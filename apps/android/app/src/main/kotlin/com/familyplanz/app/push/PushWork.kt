package com.familyplanz.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.familyplanz.app.R
import com.familyplanz.app.data.FileTaskCache
import com.familyplanz.app.reminders.ReminderPlanner
import com.familyplanz.app.sync.RefreshOutcome
import com.familyplanz.app.sync.refreshAndReplan
import com.familyplanz.app.sync.toWorkResult
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import java.util.concurrent.TimeUnit

private val ONLINE = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

/** `events_changed` → one expedited refresh; REPLACE collapses a burst of pushes into the newest. */
class WorkManagerEventsRefresh(private val context: Context) : EventsRefreshScheduler {
	override fun enqueue() {
		val request = OneTimeWorkRequestBuilder<EventsChangedWorker>()
			.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
			.setConstraints(ONLINE)
			.build()
		WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request)
	}

	companion object {
		const val WORK_NAME = "fp-events-changed"
	}
}

/**
 * Refresh the reminder-horizon months, #271's re-plan, then the 'Event updates'
 * summary from the before/after cache diff (only months that had a snapshot).
 */
class EventsChangedWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
	override suspend fun doWork(): Result {
		val app = applicationContext
		val cache = FileTaskCache(app.filesDir)
		val months = ReminderPlanner.monthsToCover(LocalDate.now())
		val before = months.associateWith { cache.loadEvents(it.year, it.monthValue) }
		val outcome = refreshAndReplan(app)
		val snapshotted = months.filter { before[it] != null }
		if (outcome == RefreshOutcome.REFRESHED && snapshotted.isNotEmpty()) {
			val old = snapshotted.flatMap { before[it].orEmpty() }
			val new = snapshotted.flatMap { cache.loadEvents(it.year, it.monthValue).orEmpty() }
			EventUpdatePlanner.notice(old, new, Instant.now(), ZoneId.systemDefault(), Locale.getDefault())
				?.let { EventUpdateNotifier.post(app, it) }
		}
		return outcome.toWorkResult()
	}

	/** Below API 31 expedited work runs as a foreground service and needs a (silent) notification. */
	override suspend fun getForegroundInfo(): ForegroundInfo {
		val manager = applicationContext.getSystemService(NotificationManager::class.java)
		manager.createNotificationChannel(NotificationChannel(SYNC_CHANNEL, "Background sync", NotificationManager.IMPORTANCE_MIN))
		val notification = NotificationCompat.Builder(applicationContext, SYNC_CHANNEL)
			.setSmallIcon(R.drawable.ic_stat_reminder)
			.setContentTitle("Updating your calendar")
			.setSilent(true)
			.build()
		return ForegroundInfo(SYNC_NOTIFICATION_ID, notification)
	}

	private companion object {
		const val SYNC_CHANNEL = "background_sync"
		const val SYNC_NOTIFICATION_ID = 2730
	}
}

/** Re-POST a token whose registration hit network/5xx; the newest token replaces a queued one. */
class WorkManagerRegisterRetry(private val context: Context) : RegisterRetry {
	override fun schedule(fcmToken: String) {
		val request = OneTimeWorkRequestBuilder<DeviceRegisterWorker>()
			.setInputData(workDataOf(DeviceRegisterWorker.KEY_TOKEN to fcmToken))
			.setConstraints(ONLINE)
			.setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
			.build()
		WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request)
	}

	companion object {
		const val WORK_NAME = "fp-device-register"
	}
}

class DeviceRegisterWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
	override suspend fun doWork(): Result {
		val token = inputData.getString(KEY_TOKEN) ?: return Result.success()
		return when (PushGraph.registrar(applicationContext, retry = null).register(token)) {
			RegisterOutcome.RETRY -> Result.retry()
			RegisterOutcome.REGISTERED, RegisterOutcome.SKIPPED_NO_BEARER, RegisterOutcome.REJECTED -> Result.success()
		}
	}

	companion object {
		const val KEY_TOKEN = "fcm_token"
	}
}
