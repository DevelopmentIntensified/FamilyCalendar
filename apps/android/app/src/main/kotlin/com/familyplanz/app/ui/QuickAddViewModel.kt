package com.familyplanz.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.TaskRepository
import com.familyplanz.app.domain.EventDraft
import com.familyplanz.app.domain.EventDraftMapper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.ZoneId

/**
 * Quick-add state machine: parse the phrase, hold an editable draft, POST on
 * confirm. A parse is a hint, never a commit (domain rule). Multi-event
 * phrases surface a "one at a time" note until the queue lands (server
 * parses them; the phone posts one event per confirm for now).
 */
sealed interface QuickAddUiState {
	data object Idle : QuickAddUiState

	data object Parsing : QuickAddUiState

	/** One branch per server shape; the UI edits before creating. */
	data class Draft(
		val title: String,
		val needsTitle: Boolean,
		val date: String?,
		val startTime: String?,
		val endTime: String?,
		val location: String?,
		val allDay: Boolean,
		val attendants: List<String>,
		val method: String,
	) : QuickAddUiState

	data object Creating : QuickAddUiState

	data class Failed(val reason: String) : QuickAddUiState
}

class QuickAddViewModel(private val repository: TaskRepository) : ViewModel() {
	private val _ui = MutableStateFlow<QuickAddUiState>(QuickAddUiState.Idle)
	val ui: StateFlow<QuickAddUiState> = _ui

	private val _needsRefresh = MutableStateFlow(false)
	val needsRefresh: StateFlow<Boolean> = _needsRefresh

	fun consumeRefresh() {
		_needsRefresh.value = false
	}

	fun parse(input: String) {
		if (input.isBlank()) {
			_ui.value = QuickAddUiState.Failed("Type what you want to add first.")
			return
		}
		viewModelScope.launch {
			_ui.value = QuickAddUiState.Parsing
			when (val result = repository.parseQuickAdd(input.trim())) {
				is ApiResult.Ok -> {
					val drafts = if (result.value.results.isNotEmpty()) {
						result.value.results
					} else {
						listOfNotNull(result.value.parsed)
					}
					when {
						drafts.isEmpty() -> _ui.value = QuickAddUiState.Failed(
							"Could not read that phrase - try \"dinner Friday at 7 at the park\".",
						)

						drafts.size == 1 -> showDraft(
							EventDraftMapper.fromParsed(drafts.first()),
							result.value.method,
						)

						else -> _ui.value = QuickAddUiState.Failed(
							"Multi-event quick-add lands later - add the ${drafts.size} events one at a time for now.",
						)
					}
				}

				is ApiResult.Err -> _ui.value = QuickAddUiState.Failed(result.error.message)
			}
		}
	}

	fun updateDraft(
		title: String? = null,
		date: String? = null,
		startTime: String? = null,
		endTime: String? = null,
		location: String? = null,
		allDay: Boolean? = null,
	) {
		val current = _ui.value as? QuickAddUiState.Draft ?: return
		val newTitle = title ?: current.title
		_ui.value = QuickAddUiState.Draft(
			title = newTitle,
			needsTitle = newTitle.isBlank(),
			date = date ?: current.date,
			startTime = startTime ?: current.startTime,
			endTime = endTime ?: current.endTime,
			location = location ?: current.location,
			allDay = allDay ?: current.allDay,
			attendants = current.attendants,
			method = current.method,
		)
	}

	fun confirm() {
		val draftState = _ui.value as? QuickAddUiState.Draft ?: return
		viewModelScope.launch {
			_ui.value = QuickAddUiState.Creating
			val draft = EventDraft(
				title = draftState.title,
				needsTitle = draftState.needsTitle,
				date = draftState.date,
				startTime = draftState.startTime,
				endTime = draftState.endTime,
				location = draftState.location,
				allDay = draftState.allDay,
				attendants = draftState.attendants,
			)
			val request = EventDraftMapper.toCreateRequest(draft, ZoneId.systemDefault())
			if (request == null) {
				_ui.value = QuickAddUiState.Failed("Pick a date first (or set All day).")
				return@launch
			}
			when (val result = repository.createEvent(request)) {
				is ApiResult.Ok -> {
					_ui.value = QuickAddUiState.Idle
					_needsRefresh.value = true
				}

				is ApiResult.Err -> _ui.value = QuickAddUiState.Failed(result.error.message)
			}
		}
	}

	fun dismiss() {
		_ui.value = QuickAddUiState.Idle
	}

	private fun showDraft(draft: EventDraft?, method: String) {
		if (draft == null) {
			_ui.value = QuickAddUiState.Failed(
				"Could not read that phrase - try \"dinner Friday at 7 at the park\".",
			)
			return
		}
		_ui.value = QuickAddUiState.Draft(
			title = draft.title,
			needsTitle = draft.needsTitle,
			date = draft.date,
			startTime = draft.startTime,
			endTime = draft.endTime,
			location = draft.location,
			allDay = draft.allDay,
			attendants = draft.attendants,
			method = method,
		)
	}
}
