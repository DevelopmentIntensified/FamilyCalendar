package com.familyplanz.app.ui.family

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.FamilySource
import com.familyplanz.app.data.RosterRowDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed interface FamilyCreateState {
	data object Loading : FamilyCreateState

	data class Ready(
		val name: String = "",
		val color: String = FAMILY_COLOURS.first(),
		val picked: Set<String> = emptySet(),
		val candidates: List<RosterRowDto> = emptyList(),
		/** AC-FC-2: at the family limit the form becomes the limit notice. */
		val atLimit: Boolean = false,
		val submitting: Boolean = false,
		val error: String? = null,
	) : FamilyCreateState

	data class Failed(val reason: String) : FamilyCreateState
}

/**
 * Create a Family (2.10): name, colour and the people to bring along, then
 * `POST /api/families` (G10d) — the server also creates the family calendar,
 * so the detail page opens on the new id (AC-FC-1).
 */
class FamilyCreateViewModel(private val source: FamilySource) : ViewModel() {
	private val _state = MutableStateFlow<FamilyCreateState>(FamilyCreateState.Loading)
	val state: StateFlow<FamilyCreateState> = _state

	/** The new family's id, once; the entry opens its detail and clears this. */
	private val _created = MutableStateFlow<String?>(null)
	val created: StateFlow<String?> = _created

	init {
		load()
	}

	fun load() {
		viewModelScope.launch {
			_state.value = FamilyCreateState.Loading
			when (val result = source.overview()) {
				is ApiResult.Ok -> {
					val overview = result.value
					_state.value = FamilyCreateState.Ready(
						candidates = overview.roster,
						atLimit = isAtFamilyLimit(
							overview.plan.used.takeIf { it > 0 } ?: overview.families.size,
							overview.plan.limit,
						),
					)
				}

				is ApiResult.Err -> _state.value = FamilyCreateState.Failed(result.error.message)
			}
		}
	}

	fun editName(value: String) {
		val ready = ready() ?: return
		_state.value = ready.copy(name = value)
	}

	fun pickColor(hex: String) {
		val ready = ready() ?: return
		_state.value = ready.copy(color = hex)
	}

	fun toggleMember(userId: String) {
		val ready = ready() ?: return
		val picked = if (userId in ready.picked) ready.picked - userId else ready.picked + userId
		_state.value = ready.copy(picked = picked)
	}

	fun submit() {
		val ready = ready() ?: return
		if (ready.name.isBlank()) {
			_state.value = ready.copy(error = "Give the family a name")
			return
		}
		viewModelScope.launch {
			_state.value = ready.copy(submitting = true, error = null)
			when (val result = source.createFamily(ready.name.trim(), ready.color, ready.picked.toList())) {
				is ApiResult.Ok -> {
					_state.value = ready.copy(submitting = false)
					_created.value = result.value.id
				}

				is ApiResult.Err -> _state.value = ready.copy(submitting = false, error = result.error.message)
			}
		}
	}

	fun consumeCreated() {
		_created.value = null
	}

	private fun ready(): FamilyCreateState.Ready? = _state.value as? FamilyCreateState.Ready
}
