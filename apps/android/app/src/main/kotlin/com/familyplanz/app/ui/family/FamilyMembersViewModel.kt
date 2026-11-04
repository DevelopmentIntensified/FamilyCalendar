package com.familyplanz.app.ui.family

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.FamilySource
import com.familyplanz.app.data.MemberHitDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** The add-member page's three tabs (2.10). */
enum class MemberTab(val label: String) {
	FIND("Find someone"),
	EMAIL("Invite by email"),
	CHILD("Create a child"),
}

data class FamilyMembersState(
	val tab: MemberTab = MemberTab.FIND,
	/** Find someone: the query, its hits and the ≥2-character rule (AC-FC-3). */
	val query: String = "",
	val hits: List<MemberHitDto> = emptyList(),
	val searching: Boolean = false,
	/** Invite by email (AC-FC-4). */
	val email: String = "",
	val firstName: String = "",
	val lastName: String = "",
	/** Create a child (AC-FC-5). */
	val childFirst: String = "",
	val childLast: String = "",
	val childEmail: String = "",
	val consent: Boolean = false,
	/** "Member Added!" / "Invite sent" / the copyable link, once a write lands. */
	val addedName: String? = null,
	val inviteSent: Boolean = false,
	val emailLink: String? = null,
	/** AC-FC-4's copy answers: the row reads "Copied" or "Select the link". */
	val linkCopied: Boolean = false,
	val copyFailed: Boolean = false,
	val error: String? = null,
)

/**
 * Add a member (2.10): the Find / Email / Child tabs. Find needs two
 * characters and lists verified users (masked emails); the child tab needs a
 * unique email and the parental consent tick, and shows the server's own
 * refusal text when it fails (AC-FC-3..5).
 */
@Suppress("TooManyFunctions")
class FamilyMembersViewModel(
	private val source: FamilySource,
	private val familyId: String,
) : ViewModel() {
	private val _state = MutableStateFlow(FamilyMembersState())
	val state: StateFlow<FamilyMembersState> = _state

	fun selectTab(tab: MemberTab) {
		_state.value = _state.value.copy(tab = tab, error = null, addedName = null, inviteSent = false)
	}

	/** AC-FC-3: only a query of two or more characters searches. */
	fun search(query: String) {
		_state.value = _state.value.copy(query = query, error = null)
		if (query.trim().length < MIN_SEARCH) {
			_state.value = _state.value.copy(hits = emptyList())
			return
		}
		viewModelScope.launch {
			_state.value = _state.value.copy(searching = true)
			when (val result = source.searchMembers(query, exclude = listOf())) {
				is ApiResult.Ok -> _state.value = _state.value.copy(hits = result.value, searching = false)
				is ApiResult.Err -> _state.value = _state.value.copy(searching = false, error = result.error.message)
			}
		}
	}

	fun addExisting(hit: MemberHitDto) {
		viewModelScope.launch {
			when (val result = source.addMemberDirect(familyId, hit.id)) {
				is ApiResult.Ok -> _state.value = _state.value.copy(
					addedName = listOfNotNull(hit.firstName, hit.lastName).joinToString(" ").ifBlank { "Member" },
					error = null,
				)

				is ApiResult.Err -> _state.value = _state.value.copy(error = result.error.message)
			}
		}
	}

	fun setEmail(value: String) {
		_state.value = _state.value.copy(email = value)
	}

	fun setFirstName(value: String) {
		_state.value = _state.value.copy(firstName = value)
	}

	fun setLastName(value: String) {
		_state.value = _state.value.copy(lastName = value)
	}

	/** AC-FC-4: sends the invite email; "Invite sent" follows. The link variant hands back a copyable link. */
	fun sendEmail(asLink: Boolean) {
		val state = _state.value
		viewModelScope.launch {
			if (asLink) {
				when (val result = source.addMemberEmailLink(familyId, state.email, state.firstName, state.lastName)) {
					is ApiResult.Ok -> _state.value = _state.value.copy(
						inviteSent = false,
						emailLink = result.value.link,
						error = null,
					)

					is ApiResult.Err -> _state.value = _state.value.copy(error = result.error.message)
				}
			} else {
				when (val result = source.addMemberByEmail(familyId, state.email, state.firstName, state.lastName)) {
					is ApiResult.Ok -> _state.value = _state.value.copy(inviteSent = true, emailLink = null, error = null)
					is ApiResult.Err -> _state.value = _state.value.copy(error = result.error.message)
				}
			}
		}
	}

	/** AC-FC-4's Copy answers on the minted email link. */
	fun linkCopied() {
		_state.value = _state.value.copy(linkCopied = true, copyFailed = false, emailLink = null, inviteSent = true)
	}

	fun copyFailed() {
		_state.value = _state.value.copy(linkCopied = false, copyFailed = true)
	}

	fun setChildFirst(value: String) {
		_state.value = _state.value.copy(childFirst = value)
	}

	fun setChildLast(value: String) {
		_state.value = _state.value.copy(childLast = value)
	}

	fun setChildEmail(value: String) {
		_state.value = _state.value.copy(childEmail = value)
	}

	fun setConsent(value: Boolean) {
		_state.value = _state.value.copy(consent = value)
	}

	/** AC-FC-5: every field plus consent, then the server's own errors show inline. */
	fun addChild() {
		val state = _state.value
		val (missing, _) = validateChild(state)
		if (missing != null) {
			_state.value = state.copy(error = missing)
			return
		}
		viewModelScope.launch {
			when (val result = source.addChild(familyId, state.childFirst, state.childLast, state.childEmail, state.consent)) {
				is ApiResult.Ok -> _state.value = state.copy(
					addedName = listOf(state.childFirst, state.childLast).joinToString(" ").trim(),
					error = null,
				)

				is ApiResult.Err -> _state.value = state.copy(error = result.error.message)
			}
		}
	}



	companion object {
		/** AC-FC-3: the find tab searches from two characters on. */
		const val MIN_SEARCH = 2
	}
}

/** The child tab's rule, in order: names, a real email, the consent tick. */
fun validateChild(state: FamilyMembersState): Pair<String?, Boolean> = when {
	state.childFirst.isBlank() -> "A first name is required" to false
	state.childLast.isBlank() -> "A last name is required" to false
	!state.childEmail.contains('@') -> "A valid email is required" to false
	!state.consent -> "Tick the box to confirm you are the parent or guardian" to false
	else -> null to true
}
