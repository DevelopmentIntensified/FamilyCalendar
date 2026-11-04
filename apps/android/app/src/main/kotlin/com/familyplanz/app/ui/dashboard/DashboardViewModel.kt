package com.familyplanz.app.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.DashboardSource
import com.familyplanz.app.data.NewFamilyTask
import com.familyplanz.app.data.TaskDto
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import java.time.LocalDate

/** One-shot asks from the Dashboard to its entry (toasts and where a link goes). */
sealed interface DashboardEffect {
	data class Toast(val text: String) : DashboardEffect

	data object OpenTasks : DashboardEffect

	data object OpenFamilyTasks : DashboardEffect

	data class OpenGroceries(val scope: String?) : DashboardEffect

	data class OpenDayView(val date: String) : DashboardEffect

	data object OpenCalendar : DashboardEffect
}

/**
 * The Day Dashboard's state machine (§2.3): one `GET /api/dashboard` read,
 * the ‹ › date walk, and the three `/api/tasks` mutations its rows make.
 * Every mutation acks at once and the server's reload reconciles it.
 */
class DashboardViewModel(
	private val source: DashboardSource,
	private val today: () -> LocalDate = LocalDate::now,
) : ViewModel() {
	private val _ui = MutableStateFlow(DashboardUiState())
	val ui: StateFlow<DashboardUiState> = _ui.asStateFlow()

	private val effectQueue = Channel<DashboardEffect>(Channel.UNLIMITED)
	val effects: Flow<DashboardEffect> = effectQueue.receiveAsFlow()

	init {
		reload()
	}

	fun reload() {
		viewModelScope.launch { load() }
	}

	/** A date walk or a retry: the skeleton shows again, the payload is kept until the answer. */
	fun moveDay(days: Long) = openDay(_ui.value.day.plusDays(days))

	fun goToday() = openDay(null)

	/** [date] null = the server's today. */
	fun openDay(date: LocalDate?) {
		update { copy(requestedDate = date?.toString(), loading = true, loadError = null, hiddenIds = emptySet(), priorityOverrides = emptyMap()) }
		reload()
	}

	private suspend fun load() {
		when (val result = source.load(_ui.value.requestedDate)) {
			is ApiResult.Ok -> update {
				copy(
					loading = false,
					loadError = null,
					payload = result.value,
					hiddenIds = emptySet(),
					priorityOverrides = emptyMap(),
					busyId = null,
				)
			}

			is ApiResult.Err -> update {
				copy(
					loading = false,
					loadError = result.error.message,
					unauthorized = result.error == ApiError.Unauthorized,
					busyId = null,
				)
			}
		}
	}

	/** AC-DB-9: the row leaves at once; a failure puts it back and names the next step. */
	fun toggleTask(task: TaskDto) {
		val before = _ui.value
		if (before.busyId != null) return
		update { copy(busyId = task.id, hiddenIds = hiddenIds + task.id) }
		viewModelScope.launch {
			when (val result = source.toggleComplete(task.id)) {
				is ApiResult.Ok -> {
					toast("\"${task.title}\" marked done.")
					update { copy(busyId = null) }
					load()
				}

				is ApiResult.Err -> {
					update { copy(busyId = null, hiddenIds = before.hiddenIds, unauthorized = result.error == ApiError.Unauthorized) }
					toast(failure("Couldn't update \"${task.title}\"", result.error))
				}
			}
		}
	}

	/** AC-DB-10: High highlights at once; the PUT carries `priority:'high'`. */
	fun setPriority(task: TaskDto, priority: String) {
		val before = _ui.value
		if (before.busyId != null || task.priority == priority) return
		update { copy(busyId = task.id, priorityOverrides = priorityOverrides + (task.id to priority)) }
		viewModelScope.launch {
			when (val result = source.setPriority(task.id, priority)) {
				is ApiResult.Ok -> {
					toast("Priority for \"${task.title}\" set to ${priorityLabel(priority)}.")
					update { copy(busyId = null) }
					load()
				}

				is ApiResult.Err -> {
					update {
						copy(
							busyId = null,
							priorityOverrides = before.priorityOverrides,
							unauthorized = result.error == ApiError.Unauthorized,
						)
					}
					toast(failure("Couldn't set priority", result.error))
				}
			}
		}
	}

	fun typeQuick(text: String) = update { copy(quickTitle = text, quickError = "") }

	fun setCategory(text: String) = update { copy(quickCategory = text) }

	/** AC-DB-12: "take out bins saturday for Dad" → a family task for Dad, due Saturday. */
	fun addQuick() {
		val now = _ui.value
		if (now.quickTitle.isBlank() || now.adding) return
		val familyId = now.familyId ?: return
		val parsed = parseBoardQuickAdd(now.quickTitle, now.members, today())
		if (parsed.unknownMember != null) {
			update {
				copy(quickError = "Unknown member ${parsed.unknownMember} — check the spelling or pick someone from your family.")
			}
			return
		}
		if (parsed.title.isBlank()) return
		update { copy(adding = true, quickError = "") }
		viewModelScope.launch {
			val created = source.createFamilyTask(
				NewFamilyTask(
					title = parsed.title,
					familyId = familyId,
					assignedTo = parsed.assignedTo ?: now.meId,
					dueDate = parsed.dueDate?.toString(),
					priority = parsed.priority,
					tags = parsed.tags,
					category = now.quickCategory.trim().takeIf { it.isNotEmpty() },
				),
			)
			when (created) {
				is ApiResult.Ok -> {
					toast("Added \"${parsed.title}\" to the family board.")
					update { copy(quickTitle = "", quickCategory = "", adding = false) }
					load()
				}

				is ApiResult.Err -> {
					update { copy(adding = false, unauthorized = created.error == ApiError.Unauthorized) }
					toast(failure("Couldn't add \"${parsed.title}\"", created.error))
				}
			}
		}
	}

	/** Header links: the tab/route each one opens. */
	fun openTasks() = send(DashboardEffect.OpenTasks)

	fun openFamilyTasks() = send(DashboardEffect.OpenFamilyTasks)

	fun openGroceries(scope: String? = null) = send(DashboardEffect.OpenGroceries(scope))

	fun openDayView() = send(DashboardEffect.OpenDayView(_ui.value.day.toString()))

	fun openCalendar() = send(DashboardEffect.OpenCalendar)

	private fun toast(text: String) = send(DashboardEffect.Toast(text))

	private fun send(effect: DashboardEffect) {
		effectQueue.trySend(effect)
	}

	private fun update(change: DashboardUiState.() -> DashboardUiState) {
		_ui.value = _ui.value.change()
	}
}

/** priorityTone.ts PRIORITY_LABEL. */
fun priorityLabel(priority: String): String = when (priority.lowercase()) {
	"high" -> "High"
	"low" -> "Low"
	else -> "Normal"
}

/** Error copy naming the next step; a network failure says to check the connection. */
fun failure(what: String, error: ApiError): String =
	if (error is ApiError.Network) "$what — check your connection." else "$what — try again."
