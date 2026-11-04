package com.familyplanz.app.ui.tasks

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.FocusCloseResult
import com.familyplanz.app.data.FocusSessionSource
import com.familyplanz.app.data.FocusStartResult
import com.familyplanz.app.data.OpenPhoneSession
import com.familyplanz.app.data.PendingPhoneSession
import com.familyplanz.app.data.PhoneFocusSnapshot
import com.familyplanz.app.data.PhoneFocusStore
import com.familyplanz.app.data.StartFocusSessionRequest
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.parseFocusInstant
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Duration
import java.time.Instant

/** The longest session the server takes (TaskFocus #124: durations > 12 h are refused). */
private val MAX_SESSION: Duration = Duration.ofHours(12)

/** What a start / stop did, for the snack; [unauthorized] ends the session. */
sealed interface PhoneFocusOutcome {
	/** The server has it. */
	data class Synced(val taskId: String) : PhoneFocusOutcome

	/** Kept on the phone; it uploads when the server is reachable. */
	data class Queued(val taskId: String) : PhoneFocusOutcome

	data class Rejected(val message: String) : PhoneFocusOutcome

	data object Unauthorized : PhoneFocusOutcome

	data object Nothing : PhoneFocusOutcome
}

/**
 * Phone focus sessions (#293, TaskFocus #124): "Focus here" starts a session
 * the phone itself times; "Stop" closes it. One open session at a time;
 * starting another closes the previous one first. Offline-first: the local
 * record ([PhoneFocusStore]) is written before every call, a failed call
 * leaves a queue entry that [flush] retries, and an offline start/stop is
 * uploaded later as one finished POST. A `409 {openSessionId}` is adopted:
 * the server's open session on this same task becomes ours, one on another
 * task is closed first and the start retried. The phone never writes
 * `focusMinutes`.
 */
class PhoneFocusSessions(
	private val source: FocusSessionSource,
	private val store: PhoneFocusStore,
	private val now: () -> Instant = Instant::now,
) {
	private val lock = Mutex()
	private var userId: String? = null

	private val _state = MutableStateFlow<PhoneFocusSnapshot?>(null)

	/** The local record (null until [restore]). */
	val state: StateFlow<PhoneFocusSnapshot?> = _state

	/** Closes that already reached the server but not yet the task list (cleared by [refreshed]). */
	private val recent = mutableListOf<Pair<Long, PendingPhoneSession>>()
	private var seq = 0L

	val open: OpenPhoneSession? get() = _state.value?.open

	suspend fun restore(userId: String) = lock.withLock {
		this.userId = userId
		_state.value = store.load(userId) ?: PhoneFocusSnapshot(userId)
	}

	/** Start timing [task] here. [serverOpenOnTask] = the task list shows an open phone session on it. */
	suspend fun start(task: Task): PhoneFocusOutcome = lock.withLock {
		val snapshot = _state.value ?: return@withLock PhoneFocusOutcome.Nothing
		if (snapshot.open?.taskId == task.id) return@withLock PhoneFocusOutcome.Nothing
		snapshot.open?.let { closeLocked(it) }
		val session = OpenPhoneSession(task.id, iso(now()))
		write { it.copy(open = session) }
		register(session, adoptOnTask = task.phoneFocusStartedAt)
	}

	/** Stop the running phone session; with none known locally, close the server's orphan on [task]. */
	suspend fun stop(task: Task?): PhoneFocusOutcome = lock.withLock {
		val open = _state.value?.open
		when {
			open != null -> closeLocked(open)
			task?.phoneFocusStartedAt != null -> closeOrphan(task)
			else -> PhoneFocusOutcome.Nothing
		}
	}

	/** Upload what is pending (open session not yet registered, then the queue). Count = uploads done. */
	suspend fun flush(): FlushResult = lock.withLock {
		var done = 0
		_state.value?.open?.takeIf { it.serverId == null }?.let { open ->
			when (register(open, adoptOnTask = null)) {
				PhoneFocusOutcome.Unauthorized -> return@withLock FlushResult(done, unauthorized = true)
				is PhoneFocusOutcome.Synced -> done++
				else -> Unit
			}
		}
		for (item in _state.value?.queue.orEmpty()) {
			when (upload(item)) {
				Upload.SENT -> done++
				Upload.DROPPED -> Unit
				Upload.RETRY -> continue
				Upload.UNAUTHORIZED -> return@withLock FlushResult(done, unauthorized = true)
			}
			write { s -> s.copy(queue = s.queue - item) }
		}
		FlushResult(done, unauthorized = false)
	}

	/** True while something still waits for the server. */
	val hasPending: Boolean
		get() = _state.value?.let { s -> s.queue.isNotEmpty() || (s.open != null && s.open.serverId == null) } == true

	/** Mark the start of a task-list read; pass the mark to [refreshed] when it succeeds. */
	fun refreshMark(): Long = seq

	fun refreshed(mark: Long) {
		recent.removeAll { it.first < mark }
	}

	/**
	 * The server list with the phone's own truth on top: the local open
	 * session runs on its task (and no other), and closes the server has not
	 * counted yet add their minutes.
	 */
	fun overlay(tasks: List<Task>): List<Task> {
		val snapshot = _state.value ?: return tasks
		val open = snapshot.open
		val uncounted = snapshot.queue + recent.map { it.second }
		return tasks.map { task ->
			val closes = uncounted.filter { it.taskId == task.id }
			val closedLocally = closes.isNotEmpty() && open?.taskId != task.id
			val startedAt = when {
				open?.taskId == task.id -> parseFocusInstant(open.startedAt)
				open != null || closedLocally -> null
				else -> task.phoneFocusStartedAt
			}
			val extra = closes.sumOf { minutesOf(it) }
			if (startedAt == task.phoneFocusStartedAt && extra == 0) {
				task
			} else {
				task.copy(phoneFocusStartedAt = startedAt, phoneFocusMinutes = task.phoneFocusMinutes + extra)
			}
		}
	}

	private suspend fun register(session: OpenPhoneSession, adoptOnTask: Instant?): PhoneFocusOutcome {
		var result = source.startFocusSession(StartFocusSessionRequest(session.taskId, session.startedAt))
		if (result is FocusStartResult.Conflict) {
			if (adoptOnTask != null) {
				// The server already times this very task (state lost on this phone): take it over as-is.
				write { it.copy(open = OpenPhoneSession(session.taskId, iso(adoptOnTask), result.openSessionId)) }
				return PhoneFocusOutcome.Synced(session.taskId)
			}
			// Another open session (another task, or a lost record): close it, then start ours.
			when (source.endFocusSession(result.openSessionId, iso(now()))) {
				is FocusCloseResult.Failed -> return PhoneFocusOutcome.Queued(session.taskId)
				else -> Unit
			}
			result = source.startFocusSession(StartFocusSessionRequest(session.taskId, session.startedAt))
		}
		return when (result) {
			is FocusStartResult.Started -> {
				write { s -> s.copy(open = s.open?.takeIf { it.startedAt == session.startedAt }?.copy(serverId = result.session.id) ?: s.open) }
				PhoneFocusOutcome.Synced(session.taskId)
			}
			is FocusStartResult.Failed -> startFailed(session, result.error)
			is FocusStartResult.Conflict -> PhoneFocusOutcome.Queued(session.taskId)
		}
	}

	private suspend fun startFailed(session: OpenPhoneSession, error: ApiError): PhoneFocusOutcome = when (error) {
		ApiError.Unauthorized -> PhoneFocusOutcome.Unauthorized
		is ApiError.NotFound, is ApiError.BadRequest -> {
			// The server refuses this task (gone, or not mine): nothing to time.
			write { s -> s.copy(open = s.open?.takeIf { it != session }) }
			PhoneFocusOutcome.Rejected(error.message)
		}
		else -> PhoneFocusOutcome.Queued(session.taskId)
	}

	/** Close [open] locally at once, then upload; a failure leaves it queued. */
	private suspend fun closeLocked(open: OpenPhoneSession): PhoneFocusOutcome {
		val endedAt = clampEnd(open.startedAt, now())
		val pending = PendingPhoneSession(open.taskId, open.startedAt, endedAt, open.serverId)
		write { it.copy(open = null, queue = it.queue + pending) }
		return when (upload(pending)) {
			Upload.SENT -> {
				write { s -> s.copy(queue = s.queue - pending) }
				recent += (++seq) to pending
				PhoneFocusOutcome.Synced(open.taskId)
			}
			Upload.DROPPED -> {
				write { s -> s.copy(queue = s.queue - pending) }
				PhoneFocusOutcome.Synced(open.taskId)
			}
			Upload.RETRY -> PhoneFocusOutcome.Queued(open.taskId)
			Upload.UNAUTHORIZED -> PhoneFocusOutcome.Unauthorized
		}
	}

	/** The server shows an open phone session we have no record of: learn its id by a 409, then close it. */
	private suspend fun closeOrphan(task: Task): PhoneFocusOutcome {
		val probe = source.startFocusSession(StartFocusSessionRequest(task.id, iso(now())))
		val id = when (probe) {
			is FocusStartResult.Conflict -> probe.openSessionId
			is FocusStartResult.Started -> {
				// Nothing was open after all: discard the probe.
				source.deleteFocusSession(probe.session.id)
				return PhoneFocusOutcome.Synced(task.id)
			}
			is FocusStartResult.Failed ->
				return if (probe.error == ApiError.Unauthorized) PhoneFocusOutcome.Unauthorized else PhoneFocusOutcome.Rejected(probe.error.message)
		}
		val started = task.phoneFocusStartedAt?.let(::iso) ?: iso(now())
		return closeLocked(OpenPhoneSession(task.id, started, id))
	}

	private enum class Upload { SENT, DROPPED, RETRY, UNAUTHORIZED }

	private suspend fun upload(item: PendingPhoneSession): Upload {
		val start = parseFocusInstant(item.startedAt)
		val end = parseFocusInstant(item.endedAt)
		if (start == null || end == null || !end.isAfter(start)) {
			// A zero-length session: nothing to record; drop a registered one.
			item.serverId?.let { source.deleteFocusSession(it) }
			return Upload.DROPPED
		}
		item.serverId?.let { id ->
			when (val closed = source.endFocusSession(id, item.endedAt)) {
				FocusCloseResult.Done -> return Upload.SENT
				// Absorbed already: it is desktop history now.
				FocusCloseResult.Absorbed -> return Upload.DROPPED
				// The server lost it: record the whole session as a finished one below.
				FocusCloseResult.Gone -> Unit
				is FocusCloseResult.Failed -> return closed.error.toUpload()
			}
		}
		return when (val posted = source.startFocusSession(StartFocusSessionRequest(item.taskId, item.startedAt, item.endedAt))) {
			is FocusStartResult.Started -> Upload.SENT
			is FocusStartResult.Conflict -> Upload.RETRY
			is FocusStartResult.Failed -> posted.error.toUpload()
		}
	}

	private fun ApiError.toUpload(): Upload = when (this) {
		ApiError.Unauthorized -> Upload.UNAUTHORIZED
		// Task gone / refused by validation: an offline queue may drop it (spec).
		is ApiError.NotFound, is ApiError.BadRequest, is ApiError.Forbidden -> Upload.DROPPED
		else -> Upload.RETRY
	}

	private suspend fun write(change: (PhoneFocusSnapshot) -> PhoneFocusSnapshot) {
		val current = _state.value ?: PhoneFocusSnapshot(userId ?: return)
		val next = change(current)
		_state.value = next
		store.save(next)
	}

	private fun clampEnd(startedAt: String, end: Instant): String {
		val start = parseFocusInstant(startedAt) ?: return iso(end)
		return iso(if (Duration.between(start, end) > MAX_SESSION) start.plus(MAX_SESSION) else end)
	}

	private fun minutesOf(item: PendingPhoneSession): Int {
		val start = parseFocusInstant(item.startedAt) ?: return 0
		val end = parseFocusInstant(item.endedAt) ?: return 0
		return Duration.between(start, end).toMinutes().coerceAtLeast(0).toInt()
	}

	private fun iso(instant: Instant): String = instant.toString()
}

data class FlushResult(val uploaded: Int, val unauthorized: Boolean)
