package com.familyplanz.app.ui.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** NotificationBell dropdown body. */
sealed interface BellList {
	data object Loading : BellList

	data object Failed : BellList

	data class Ready(val rows: List<NotificationDto>) : BellList
}

/** The verify banner's form state (`calendar/+layout.svelte:66-136`). */
data class VerifyForm(
	val code: String = "",
	val busy: Boolean = false,
	val error: String? = null,
	val dismissed: Boolean = false,
	/** "Sent again ✓" pill; the banner clears it after 3 s. */
	val resent: Boolean = false,
)

/**
 * Per-session shell chrome: the unread badge (BottomNav + bell), the bell
 * list, `/api/me` for the account banners and admin rows, and the verify
 * form. Lives in the session's lane store, so sign-out drops it.
 */
class ShellChromeViewModel(
	private val source: ShellSource,
	private val toasts: ToastQueue,
	private val onUnauthorized: () -> Unit = {},
) : ViewModel() {
	private val _unread = MutableStateFlow(0)
	val unread: StateFlow<Int> = _unread

	private val _bell = MutableStateFlow<BellList>(BellList.Loading)
	val bell: StateFlow<BellList> = _bell

	private val _me = MutableStateFlow<ShellMeDto?>(null)
	val me: StateFlow<ShellMeDto?> = _me

	private val _verify = MutableStateFlow(VerifyForm())
	val verify: StateFlow<VerifyForm> = _verify

	/** BottomNav `refreshBadge`: on mount, every route change and resume; silent (0) on failure. */
	fun refreshBadge() {
		viewModelScope.launch {
			_unread.value = when (val r = source.notifications()) {
				is ApiResult.Ok -> r.value.unreadCount
				is ApiResult.Err -> 0.also { if (r.error == ApiError.Unauthorized) onUnauthorized() }
			}
		}
	}

	fun loadMe() {
		viewModelScope.launch {
			(source.me() as? ApiResult.Ok)?.let { _me.value = it.value }
		}
	}

	/** Bell `fetchList`: opening the dropdown refreshes list and count. */
	fun loadBell() {
		_bell.value = BellList.Loading
		viewModelScope.launch {
			when (val r = source.notifications()) {
				is ApiResult.Ok -> {
					_bell.value = BellList.Ready(r.value.notifications)
					_unread.value = r.value.unreadCount
				}
				is ApiResult.Err -> _bell.value = BellList.Failed
			}
		}
	}

	/** Bell `markRead`: optimistic, rolled back with a toast if the server says no. */
	fun markRead(row: NotificationDto) {
		if (row.readAt != null) return
		setRead(row.id, READ_NOW)
		_unread.update { (it - 1).coerceAtLeast(0) }
		viewModelScope.launch {
			if (source.markRead(row.id) is ApiResult.Err) {
				setRead(row.id, null)
				_unread.update { it + 1 }
				toasts.push("Couldn't mark that alert read — it stays in your list.")
			}
		}
	}

	fun markAllRead() {
		val before = (_bell.value as? BellList.Ready)?.rows.orEmpty()
		_bell.value = BellList.Ready(before.map { it.copy(readAt = it.readAt ?: READ_NOW) })
		_unread.value = 0
		viewModelScope.launch {
			if (source.markAllRead() is ApiResult.Err) {
				_bell.value = BellList.Ready(before)
				_unread.value = before.count { it.readAt == null }
				toasts.push("Couldn't mark everything read — try again.")
			}
		}
	}

	private fun setRead(id: String, readAt: String?) {
		val ready = _bell.value as? BellList.Ready ?: return
		_bell.value = BellList.Ready(ready.rows.map { if (it.id == id) it.copy(readAt = readAt) else it })
	}

	fun setVerifyCode(code: String) = _verify.update { it.copy(code = code) }

	fun dismissVerify() = _verify.update { it.copy(dismissed = true) }

	fun clearResent() = _verify.update { it.copy(resent = false) }

	/** `submitVerifyCode`: success re-reads `/api/me`, which drops the banner. */
	fun submitVerify() {
		val form = _verify.value
		if (form.code.isBlank() || form.busy) return
		_verify.value = form.copy(busy = true, error = null)
		viewModelScope.launch {
			when (val r = source.verifyEmail(form.code.trim())) {
				is ApiResult.Ok -> {
					_me.update { it?.copy(emailVerified = true) }
					_verify.value = VerifyForm()
					loadMe()
				}
				is ApiResult.Err -> _verify.update {
					it.copy(busy = false, error = verifyError(r.error, network = VerifyCopy.VERIFY_NETWORK, fallback = VerifyCopy.INVALID))
				}
			}
		}
	}

	/** `resendVerifyCode`. */
	fun resendVerify() {
		if (_verify.value.busy) return
		_verify.update { it.copy(busy = true, error = null) }
		viewModelScope.launch {
			when (val r = source.resendVerifyEmail()) {
				is ApiResult.Ok -> _verify.update { it.copy(busy = false, resent = true) }
				is ApiResult.Err -> _verify.update {
					it.copy(busy = false, error = verifyError(r.error, network = VerifyCopy.RESEND_NETWORK, fallback = VerifyCopy.RESEND_FAILED))
				}
			}
		}
	}

	private fun verifyError(error: ApiError, network: String, fallback: String): String = when (error) {
		is ApiError.Network -> network
		is ApiError.BadRequest -> error.errorText.ifBlank { fallback }
		is ApiError.Forbidden -> error.errorText.ifBlank { fallback }
		// 429 throttle and friends: the web shows `body.error` too.
		is ApiError.Server -> error.message.takeUnless { it == "Unknown server error" } ?: fallback
		else -> fallback
	}

	private companion object {
		/** Any non-null marks a row read locally; the server stamps the real time. */
		const val READ_NOW = "now"
	}
}
