package com.familyplanz.app.ui.family

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.FamiliesOverviewDto
import com.familyplanz.app.data.FamilySource
import com.familyplanz.app.data.MintedInviteDto
import com.familyplanz.app.ui.shell.UiSnack
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** The minted join link for one family, plus its Copy/Copied state (AC-FM-6). */
data class JoinLink(
	val familyId: String,
	val link: String,
	val copied: Boolean = false,
	val copyFailed: Boolean = false,
)

sealed interface FamilyListState {
	data object Loading : FamilyListState

	data class Ready(
		val overview: FamiliesOverviewDto,
		val joinLink: JoinLink? = null,
		val mintError: String? = null,
	) : FamilyListState

	data class Failed(val reason: String) : FamilyListState
}

/**
 * The Families tab (`/family`, 2.7): the plan-gated hero, one card per
 * family and the invitation card's 10-use join links. Minting matches the
 * web's `generateInviteCode` defaults: [INVITE_DAYS] days, [INVITE_USES] uses.
 */
class FamilyListViewModel(private val source: FamilySource) : ViewModel() {
	private val _state = MutableStateFlow<FamilyListState>(FamilyListState.Loading)
	val state: StateFlow<FamilyListState> = _state

	private val _snack = MutableStateFlow<UiSnack?>(null)
	val snack: StateFlow<UiSnack?> = _snack

	init {
		refresh()
	}

	fun consumeSnack() {
		_snack.value = null
	}

	fun refresh() {
		viewModelScope.launch {
			_state.value = FamilyListState.Loading
			when (val result = source.overview()) {
				is ApiResult.Ok -> _state.value = FamilyListState.Ready(result.value)
				is ApiResult.Err -> {
					_state.value = FamilyListState.Failed(result.error.message)
					_snack.value = UiSnack(result.error.message)
				}
			}
		}
	}

	/** AC-FM-6: "Invite by link" mints a fresh 10-use code for [familyId]. */
	fun mint(familyId: String) {
		viewModelScope.launch {
			val ready = _state.value as? FamilyListState.Ready ?: return@launch
			_state.value = ready.copy(mintError = null)
			when (val result = source.mintInvite(familyId, INVITE_DAYS, INVITE_USES)) {
				is ApiResult.Ok -> _state.value = ready.copy(
					joinLink = JoinLink(familyId, joinUrl(result.value)),
					mintError = null,
				)

				is ApiResult.Err -> _state.value = ready.copy(mintError = result.error.message)
			}
		}
	}

	/** The clipboard write landed: the button reads "Copied". */
	fun copied() {
		val ready = _state.value as? FamilyListState.Ready ?: return
		val link = ready.joinLink ?: return
		_state.value = ready.copy(joinLink = link.copy(copied = true, copyFailed = false))
	}

	/** The clipboard write failed: the page's "select the link above" line shows. */
	fun copyFailed() {
		val ready = _state.value as? FamilyListState.Ready ?: return
		val link = ready.joinLink ?: return
		_state.value = ready.copy(joinLink = link.copy(copied = false, copyFailed = true))
	}

	companion object {
		const val INVITE_DAYS = 7
		const val INVITE_USES = 10
	}
}

/** The web's join path (`inviteUrl`), absolute so Copy yields something pasteable. */
fun joinUrl(minted: MintedInviteDto): String =
	if (minted.inviteUrl.startsWith("http")) minted.inviteUrl else "$WEB_ORIGIN${minted.inviteUrl}"

internal const val WEB_ORIGIN = "https://familyplanz.com"

/** "1 family" / "2 families" (the hero subline and the plan pill share it). */
fun familiesLabel(count: Int): String = if (count == 1) "1 family" else "$count families"

/** AC-FM-3: a colour-less family reads "Not set"; a set one reads its hex. */
fun colourLabel(color: String?): String = color?.takeIf { it.isNotBlank() } ?: "Not set"

/** Plan-limit gate for the hero CTA (AC-FM-2). */
fun isAtFamilyLimit(used: Int, limit: Int): Boolean = limit > 0 && used >= limit

/** The 403/404 the detail screen shows when the caller is not a member. */
internal val ApiError.isNotMember: Boolean
	get() = this is ApiError.Forbidden || this is ApiError.NotFound
