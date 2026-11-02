package com.familyplanz.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.data.EventDto
import com.familyplanz.app.data.FileTaskCache
import com.familyplanz.app.data.TaskCache
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * THE public entry point for local reminders (issue #271). Callers: app start
 * (MainActivity), every successful events fetch (via [ReminderAwareCache]),
 * the #268 RefreshWorker, boot/time/zone receivers, and #273's FCM
 * `events_changed` handler. Reads only the on-disk cache; refresh first if
 * fresher data matters. Serialized; never throws.
 */
object Reminders {
	private const val TAG = "FpReminders"
	private val lock = Mutex()

	suspend fun rescheduleFromCache(context: Context, force: Boolean = false) {
		val app = context.applicationContext
		lock.withLock {
			runCatching { sync(app, signedIn = DataStoreTokenStore(app).token() != null).rescheduleFromCache(force) }
				.onFailure { Log.w(TAG, "reminder reschedule failed", it) }
		}
	}

	/** Signed out (#273) → no events, so the re-plan cancels every alarm the old cache set. */
	private fun sync(app: Context, signedIn: Boolean): ReminderSync {
		val cache = FileTaskCache(app.filesDir)
		return ReminderSync(
			cachedEvents = { if (signedIn) cache.loadEvents(it.year, it.monthValue) else null },
			store = FileScheduledReminderStore(app.filesDir),
			scheduler = AndroidAlarmScheduler(app),
		)
	}
}

/** Write-through hook: any fresh events month on disk re-plans the alarms. */
class ReminderAwareCache(
	private val delegate: TaskCache,
	private val onEventsSaved: suspend () -> Unit,
) : TaskCache by delegate {
	override suspend fun saveEvents(year: Int, month: Int, events: List<EventDto>) {
		delegate.saveEvents(year, month, events)
		onEventsSaved()
	}
}

/**
 * Alarms die on reboot and drift on clock/zone changes (all-day reminders
 * are device-local), so these broadcasts force a full re-set from cache.
 */
class RescheduleReceiver : BroadcastReceiver() {
	override fun onReceive(context: Context, intent: Intent) {
		if (intent.action !in ACTIONS) return
		val pending = goAsync()
		CoroutineScope(Dispatchers.IO).launch {
			try {
				Reminders.rescheduleFromCache(context, force = true)
			} finally {
				pending.finish()
			}
		}
	}

	private companion object {
		val ACTIONS = setOf(
			Intent.ACTION_BOOT_COMPLETED,
			Intent.ACTION_TIME_CHANGED,
			Intent.ACTION_TIMEZONE_CHANGED,
			Intent.ACTION_MY_PACKAGE_REPLACED,
			"android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED",
		)
	}
}
