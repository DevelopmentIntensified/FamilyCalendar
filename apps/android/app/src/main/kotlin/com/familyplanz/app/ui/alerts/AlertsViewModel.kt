package com.familyplanz.app.ui.alerts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.NotificationDto
import com.familyplanz.app.data.NotificationSource
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import java.time.Instant

data class AlertsUiState(
	val loading: Boolean = true,
	val loadError: String? = null,
	val rows: List<NotificationDto> = emptyList(),
	val unreadCount: Int = 0,
	val filter: AlertFilter = AlertFilter.ALL,
	val askingToPrune: Boolean = false,
	val pruning: Boolean = false,
	val markingAll: Boolean = false,
	val unauthorized: Boolean = false,
) {
	/** How many rows are read: the prune's count and its question. */
	val readCount: Int get() = rows.count { !it.unread }
}

/** One-shot asks from the ViewModel to its entry. */
sealed interface AlertsEffect {
	data class Toast(val text: String) : AlertsEffect

	data class Open(val link: String) : AlertsEffect
}

/**
 * The Alerts page's state machine (notifications/+page.svelte): server rows
 * are the truth, the rendered copy takes read-marks and prunes at once and
 * is reconciled by the reload. [badge] carries the unread count to the shell.
 */
class AlertsViewModel(
	private val source: NotificationSource,
	private val badge: MutableStateFlow<Int>,
) : ViewModel() {
	private val _ui = MutableStateFlow(AlertsUiState())
	val ui: StateFlow<AlertsUiState> = _ui.asStateFlow()

	private val effectQueue = Channel<AlertsEffect>(Channel.UNLIMITED)
	val effects: Flow<AlertsEffect> = effectQueue.receiveAsFlow()

	init {
		reload()
	}

	fun reload() {
		viewModelScope.launch { load() }
	}

	private suspend fun load() {
		when (val result = source.feed()) {
			is ApiResult.Ok -> update {
				copy(loading = false, loadError = null, rows = result.value.notifications, unreadCount = result.value.unreadCount)
			}
			is ApiResult.Err -> update {
				copy(loading = false, loadError = result.error.message, unauthorized = result.error == ApiError.Unauthorized)
			}
		}
	}

	fun setFilter(filter: AlertFilter) = update { copy(filter = filter) }

	fun askToPrune(asking: Boolean) = update { copy(askingToPrune = asking) }

	fun markAllRead() {
		val before = _ui.value
		if (before.markingAll) return
		val now = Instant.now().toString()
		update { copy(rows = rows.map { if (it.unread) it.copy(readAt = now) else it }, unreadCount = 0) }
		viewModelScope.launch {
			if (source.markAllRead() is ApiResult.Ok) {
				toast("Everything marked as read.")
				load()
			} else {
				update { copy(rows = before.rows, unreadCount = before.unreadCount) }
				toast("Couldn't mark everything read — try again.")
			}
		}
	}

	fun pruneRead() {
		val before = _ui.value
		if (before.pruning) return
		val doomed = before.readCount
		update { copy(rows = rows.filter { it.unread }, askingToPrune = false, pruning = true) }
		viewModelScope.launch {
			if (source.pruneRead() is ApiResult.Ok) {
				toast("Deleted $doomed read alert${if (doomed == 1) "" else "s"}.")
				load()
			} else {
				update { copy(rows = before.rows) }
				toast("Couldn't delete those alerts — try again.")
			}
			update { copy(pruning = false) }
		}
	}

	/** A tap: an unread row is marked read at once (badge −1), then its link opens. */
	fun open(row: NotificationDto) {
		if (!row.unread) {
			row.link?.let { effectQueue.trySend(AlertsEffect.Open(it)) }
			return
		}
		val now = Instant.now().toString()
		update {
			copy(
				rows = rows.map { if (it.id == row.id) it.copy(readAt = now) else it },
				unreadCount = (unreadCount - 1).coerceAtLeast(0),
			)
		}
		viewModelScope.launch {
			if (source.markRead(row.id) is ApiResult.Ok) {
				load()
			} else {
				toast("Couldn't mark that alert read — opening it anyway.")
			}
		}
		row.link?.let { effectQueue.trySend(AlertsEffect.Open(it)) }
	}

	private fun toast(text: String) {
		effectQueue.trySend(AlertsEffect.Toast(text))
	}

	private fun update(change: AlertsUiState.() -> AlertsUiState) {
		_ui.value = _ui.value.change()
		badge.value = _ui.value.unreadCount
	}

	override fun onCleared() {
		badge.value = 0
	}
}
