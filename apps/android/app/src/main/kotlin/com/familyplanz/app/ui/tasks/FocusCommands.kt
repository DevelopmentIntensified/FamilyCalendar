package com.familyplanz.app.ui.tasks

import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.TaskSource
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskMapper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** A focus command awaiting the server's answer (#290). */
sealed interface FocusPending {
	data class Start(val taskId: String) : FocusPending

	data object Stop : FocusPending
}

const val FOCUS_START_ASKED = "Asked your desktop to start focus"
const val FOCUS_STOP_ASKED = "Asked your desktop to stop"

/** The desktop polls commands every ~3 s; re-read tasks just after so the row shows the truth. */
const val FOCUS_REFRESH_DELAY_MS = 4_000L

/**
 * Desktop focus commands from the phone (#290). The desktop stays the only
 * focus clock: the phone enqueues start/stop and never writes focus fields.
 * One command at a time; only the pending state shows while in flight, and
 * focus state is never flipped here - a quiet task reload [refreshDelayMs]
 * after success shows the server's `focusStartedAt` once the desktop acted.
 */
class FocusCommands(
	private val tasks: TaskSource,
	private val scope: CoroutineScope,
	private val ui: MutableStateFlow<TasksUiState>,
	private val refreshDelayMs: Long = FOCUS_REFRESH_DELAY_MS,
) {
	private val _pending = MutableStateFlow<FocusPending?>(null)

	/** The command in flight; null = none, focus controls enabled. */
	val pending: StateFlow<FocusPending?> = _pending

	/** Start on [task], or stop when null. Null result = ignored, another command is still in flight. */
	suspend fun send(task: Task?): ApiResult<Unit>? {
		if (_pending.value != null) return null
		_pending.value = if (task == null) FocusPending.Stop else FocusPending.Start(task.id)
		val result = try {
			if (task == null) tasks.requestFocusStop() else tasks.requestFocusStart(task.id)
		} finally {
			_pending.value = null
		}
		if (result is ApiResult.Ok) {
			scope.launch {
				delay(refreshDelayMs)
				reloadQuietly()
			}
		}
		return result
	}

	/** Swap in the server's list without the Loading flash; failures stay silent (manual retry exists). */
	private suspend fun reloadQuietly() {
		val fresh = (tasks.allTasks() as? ApiResult.Ok)?.value ?: return
		val current = ui.value as? TasksUiState.Ready ?: return
		val serverTasks = fresh.map(TaskMapper::fromDto)
		val stillSaving = current.tasks.filter { row -> row.pending && serverTasks.none { it.id == row.id } }
		ui.value = current.copy(tasks = stillSaving + serverTasks)
	}
}
