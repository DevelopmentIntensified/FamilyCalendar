package com.familyplanz.app.ui.shell

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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
 * The verify-email banner's state and two `/api/me/verify-email` calls
 * (`calendar/+layout.svelte:66-136`, G12). [onVerified] runs on success so
 * the shell can re-read `/api/me` and drop the banner. Owned by
 * [ShellChromeViewModel] and dropped with it on sign-out.
 */
class VerifyChrome(
	private val source: ShellSource,
	private val scope: CoroutineScope,
	private val onVerified: () -> Unit = {},
) {
	private val _form = MutableStateFlow(VerifyForm())
	val form: StateFlow<VerifyForm> = _form

	fun setCode(code: String) = _form.update { it.copy(code = code) }

	fun dismiss() = _form.update { it.copy(dismissed = true) }

	fun clearResent() = _form.update { it.copy(resent = false) }

	/** `submitVerifyCode`: success re-reads `/api/me`, which drops the banner. */
	fun submit() {
		val current = _form.value
		if (current.code.isBlank() || current.busy) return
		_form.value = current.copy(busy = true, error = null)
		scope.launch {
			when (val r = source.verifyEmail(current.code.trim())) {
				is ApiResult.Ok -> {
					_form.value = VerifyForm()
					onVerified()
				}
				is ApiResult.Err -> _form.update {
					it.copy(busy = false, error = verifyError(r.error, network = VerifyCopy.VERIFY_NETWORK, fallback = VerifyCopy.INVALID))
				}
			}
		}
	}

	/** `resendVerifyCode`. */
	fun resend() {
		if (_form.value.busy) return
		_form.update { it.copy(busy = true, error = null) }
		scope.launch {
			when (val r = source.resendVerifyEmail()) {
				is ApiResult.Ok -> _form.update { it.copy(busy = false, resent = true) }
				is ApiResult.Err -> _form.update {
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
}
