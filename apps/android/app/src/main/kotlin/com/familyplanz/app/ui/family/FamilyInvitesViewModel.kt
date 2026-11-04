package com.familyplanz.app.ui.family

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.FamilyCardDto
import com.familyplanz.app.data.FamilySource
import com.familyplanz.app.data.InviteCodeDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed interface FamilyInvitesState {
	data object Loading : FamilyInvitesState

	data class Ready(
		val families: List<FamilyCardDto>,
		val familyId: String,
		val canManage: Boolean,
		val codes: List<InviteCodeDto>,
		/** "Valid for" and "Max uses" of the NEW CODE form. */
		val validDays: Int = 7,
		val maxUses: Int = 5,
		/** The code whose link was just copied, so its row reads "Copied". */
		val copiedCode: String? = null,
		val copyFailed: Boolean = false,
		val error: String? = null,
		val note: String? = null,
	) : FamilyInvitesState

	data class Failed(val reason: String) : FamilyInvitesState
}

/**
 * The invitations page (2.9): the family switcher, the code list, minting a
 * code with the form's days/uses and revoking one. A non-manager gets the
 * server's refusal line instead of the list (AC-FI-1).
 */
class FamilyInvitesViewModel(
	private val source: FamilySource,
	private val familyId: String,
) : ViewModel() {
	private val _state = MutableStateFlow<FamilyInvitesState>(FamilyInvitesState.Loading)
	val state: StateFlow<FamilyInvitesState> = _state

	init {
		load(familyId)
	}

	/** AC-FI-4: switching family reloads that family's codes. */
	fun selectFamily(id: String) = load(id)

	fun setValidDays(days: Int) {
		val ready = ready() ?: return
		_state.value = ready.copy(validDays = days)
	}

	fun setMaxUses(uses: Int) {
		val ready = ready() ?: return
		_state.value = ready.copy(maxUses = uses)
	}

	/** AC-FI-2: mint with the form's values, then show it at the top of the list. */
	fun createCode() {
		val ready = ready() ?: return
		viewModelScope.launch {
			when (val result = source.mintInvite(ready.familyId, ready.validDays, ready.maxUses)) {
				is ApiResult.Ok -> {
					val minted = result.value
					val row = InviteCodeDto(code = minted.code, maxUses = ready.maxUses, expiresAt = minted.expiresAt)
					_state.value = ready.copy(codes = listOf(row) + ready.codes, error = null, note = "New code created")
				}

				is ApiResult.Err -> _state.value = ready.copy(error = result.error.message)
			}
		}
	}

	/** AC-FI-3: revoke by value; the row disappears. */
	fun revoke(code: String) {
		val ready = ready() ?: return
		viewModelScope.launch {
			when (val result = source.revokeInvite(code)) {
				is ApiResult.Ok -> _state.value = ready.copy(
					codes = ready.codes.filterNot { it.code == code },
					error = null,
					note = "Code revoked",
				)

				is ApiResult.Err -> _state.value = ready.copy(error = result.error.message)
			}
		}
	}

	/** Copy hands the full join URL to the clipboard; the row then reads "Copied". */
	fun copied(code: String) {
		val ready = ready() ?: return
		_state.value = ready.copy(copiedCode = code, copyFailed = false)
	}

	fun copyFailed() {
		val ready = ready() ?: return
		_state.value = ready.copy(copiedCode = null, copyFailed = true)
	}

	fun consumeNote() {
		val ready = ready() ?: return
		_state.value = ready.copy(note = null, error = null)
	}

	private fun load(id: String) {
		viewModelScope.launch {
			_state.value = FamilyInvitesState.Loading
			val families = when (val overview = source.overview()) {
				is ApiResult.Ok -> overview.value.families
				is ApiResult.Err -> emptyList()
			}
			when (val codes = source.inviteCodes(id)) {
				is ApiResult.Ok -> _state.value = FamilyInvitesState.Ready(
					families = families,
					familyId = id,
					canManage = codes.value.canManageInvites,
					codes = codes.value.codes,
				)

				is ApiResult.Err -> _state.value = FamilyInvitesState.Failed(codes.error.message)
			}
		}
	}

	private fun ready(): FamilyInvitesState.Ready? = _state.value as? FamilyInvitesState.Ready
}

/** The shareable join URL for a code (`/family/join/{code}` on the web). */
fun inviteLink(code: String): String = "$WEB_ORIGIN/family/join/$code"

/** AC-FI-1: "{used}/{max} uses" with the expiry line. */
fun inviteUseLine(row: InviteCodeDto): String =
	"${row.useCount}/${row.maxUses ?: '\u221E'} uses \u00B7 expires ${row.expiresAt?.substringBefore('T') ?: "never"}"
