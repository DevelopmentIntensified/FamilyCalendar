package com.familyplanz.app.ui.family

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.FamilyDetailDto
import com.familyplanz.app.data.FamilySource
import com.familyplanz.app.data.RosterRowDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed interface FamilyDetailState {
	data object Loading : FamilyDetailState

	data class Ready(
		val detail: FamilyDetailDto,
		/** The Family Settings name field (admin); the hero always reads `detail.family.name`. */
		val name: String,
		val color: String,
		/** Server text shown inline under the band it came from (AC-FD-3). */
		val error: String? = null,
		val note: String? = null,
		/** The member the remove confirmation names (AC-FD-5); null = no confirmation. */
		val removeTarget: RosterRowDto? = null,
		/** The member whose actions sheet is open (AC-FD-6); null = closed. */
		val sheetMember: RosterRowDto? = null,
		val joinLink: JoinLink? = null,
	) : FamilyDetailState

	data class Failed(val reason: String) : FamilyDetailState
}

/**
 * One family's detail page (2.8): member rows and their type/role editors,
 * the admin settings band, the Day Dashboard module switches and the
 * invitation rail. Every write reports the server's own message, so a
 * `fail()` string from the web action shows verbatim (AC-FD-3, AC-FD-9).
 */
class FamilyDetailViewModel(
	private val source: FamilySource,
	private val familyId: String,
) : ViewModel() {
	private val _state = MutableStateFlow<FamilyDetailState>(FamilyDetailState.Loading)
	val state: StateFlow<FamilyDetailState> = _state

	init {
		refresh()
	}

	fun refresh() {
		viewModelScope.launch {
			_state.value = FamilyDetailState.Loading
			when (val result = source.detail(familyId)) {
				is ApiResult.Ok -> {
					val detail = result.value
					_state.value = FamilyDetailState.Ready(
						detail = detail,
						name = detail.family?.name.orEmpty(),
						color = detail.family?.color.orEmpty(),
					)
				}

				is ApiResult.Err -> _state.value = FamilyDetailState.Failed(result.error.message)
			}
		}
	}

	/** AC-FD-3: the row's Pill follows the saved type; a refusal lands inline. */
	fun setMemberType(member: RosterRowDto, memberType: String) = updateMember(member, type = memberType)

	/** AC-FD-4: only the creator is offered `creator` (the screen builds the options). */
	fun setRole(member: RosterRowDto, role: String) = updateMember(member, role = role)

	private fun updateMember(member: RosterRowDto, role: String? = null, type: String? = null) {
		val ready = ready() ?: return
		viewModelScope.launch {
			when (val result = source.updateMember(familyId, member.userId, role, type)) {
				is ApiResult.Ok -> _state.value = ready.copy(
					detail = ready.detail.withMember(member.userId, role, type),
					error = null,
					note = "Member updated",
					sheetMember = null,
				)

				is ApiResult.Err -> _state.value = ready.copy(error = result.error.message)
			}
		}
	}

	/** AC-FD-5: ask first, then drop the row. The creator never gets the button. */
	fun askRemove(member: RosterRowDto) {
		val ready = ready() ?: return
		_state.value = ready.copy(removeTarget = member, error = null)
	}

	fun cancelRemove() {
		val ready = ready() ?: return
		_state.value = ready.copy(removeTarget = null)
	}

	fun confirmRemove() {
		val ready = ready() ?: return
		val target = ready.removeTarget ?: return
		viewModelScope.launch {
			when (val result = source.removeMember(familyId, target.userId)) {
				is ApiResult.Ok -> _state.value = ready.copy(
					detail = ready.detail.copy(members = ready.detail.members.filterNot { it.userId == target.userId }),
					removeTarget = null,
					sheetMember = null,
					note = "Member removed",
				)

				is ApiResult.Err -> _state.value = ready.copy(removeTarget = null, error = result.error.message)
			}
		}
	}

	fun openSheet(member: RosterRowDto) {
		val ready = ready() ?: return
		_state.value = ready.copy(sheetMember = member, error = null)
	}

	fun closeSheet() {
		val ready = ready() ?: return
		_state.value = ready.copy(sheetMember = null)
	}

	fun editName(value: String) {
		val ready = ready() ?: return
		_state.value = ready.copy(name = value)
	}

	fun pickColor(hex: String) {
		val ready = ready() ?: return
		_state.value = ready.copy(color = hex)
	}

	/** AC-FD-7: saves the name and colour, which the Calendar tab then tints with. */
	fun saveSettings() {
		val ready = ready() ?: return
		viewModelScope.launch {
			when (val result = source.updateFamily(familyId, ready.name.trim(), ready.color.ifBlank { null })) {
				is ApiResult.Ok -> {
					val saved = result.value
					_state.value = ready.copy(
						detail = ready.detail.withFamily(saved?.name, saved?.color),
						error = null,
						note = "Family settings saved",
					)
				}

				is ApiResult.Err -> _state.value = ready.copy(error = result.error.message)
			}
		}
	}

	/** AC-FD-8: off hides the card on every member's dashboard (server keeps the list). */
	fun toggleModule(module: String, enabled: Boolean) {
		val ready = ready() ?: return
		viewModelScope.launch {
			when (val result = source.setModule(familyId, module, enabled)) {
				is ApiResult.Ok -> _state.value = ready.copy(
					detail = ready.detail.copy(moduleSwitches = ready.detail.moduleSwitches + (module to enabled)),
					error = null,
				)

				is ApiResult.Err -> _state.value = ready.copy(error = result.error.message)
			}
		}
	}

	/** AC-FD-9: the rail's "Get a join link" mints the same 10-use code as the tab. */
	fun mintInvite() {
		val ready = ready() ?: return
		viewModelScope.launch {
			when (val result = source.mintInvite(familyId, FamilyListViewModel.INVITE_DAYS, FamilyListViewModel.INVITE_USES)) {
				is ApiResult.Ok -> _state.value = ready.copy(joinLink = JoinLink(familyId, joinUrl(result.value)))
				is ApiResult.Err -> _state.value = ready.copy(error = result.error.message)
			}
		}
	}

	private fun ready(): FamilyDetailState.Ready? = _state.value as? FamilyDetailState.Ready

	/** The rail's Copy hands the link to the clipboard, then the row reads "Copied" (AC-FD-9). */
	fun copied() = markJoinLink { it.copy(copied = true, copyFailed = false) }

	fun copyFailed() = markJoinLink { it.copy(copied = false, copyFailed = true) }

	private fun markJoinLink(change: (JoinLink) -> JoinLink) {
		val ready = ready() ?: return
		val link = ready.joinLink ?: return
		_state.value = ready.copy(joinLink = change(link))
	}

	/** 403/404 = the caller is not in this family; the screen shows the server's line. */
	internal fun isRefusal(error: ApiError): Boolean = error.isNotMember
}

/** Swap one member row; [role] / [type] null means "leave as it was". */
internal fun FamilyDetailDto.withMember(userId: String, role: String?, type: String?): FamilyDetailDto = copy(
	members = members.map {
		if (it.userId == userId) it.copy(role = role ?: it.role, memberType = type ?: it.memberType) else it
	},
)

/** Reflect a saved family name/colour in the hero without a reload. */
internal fun FamilyDetailDto.withFamily(name: String?, color: String?): FamilyDetailDto {
	val family = family ?: return this
	return copy(family = family.copy(name = name ?: family.name, color = color ?: family.color))
}

/** AC-FD-4: the role options the caller may hand out (admin cannot promote to creator). */
fun roleOptions(currentUserRole: String): List<String> =
	if (currentUserRole == "creator") listOf("member", "admin", "creator") else listOf("member", "admin")

/** AC-FD-5: the creator row has no remove action. */
fun canRemove(target: RosterRowDto): Boolean = target.role != "creator"

/** AC-FD-4/5: a plain member sees no editors at all (AC-FD-2). */
fun isManager(role: String): Boolean = role == "creator" || role == "admin"
