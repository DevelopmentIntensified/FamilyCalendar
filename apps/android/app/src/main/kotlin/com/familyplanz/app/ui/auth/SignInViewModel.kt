package com.familyplanz.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.AuthIntent
import com.familyplanz.app.data.AuthResult
import com.familyplanz.app.data.AuthSessionDto
import com.familyplanz.app.data.AuthSource
import com.familyplanz.app.data.SignupNames
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class SignInStep { EMAIL, CODE, PASSWORD }

/** Which button is waiting on the server (it shows a busy label; every button is disabled). */
enum class SignInPending { SEND_CODE, RESEND, VERIFY, PASSWORD, GUEST }

data class SignInUiState(
	val step: SignInStep = SignInStep.EMAIL,
	val intent: AuthIntent = AuthIntent.LOGIN,
	val email: String = "",
	val pending: SignInPending? = null,
	val error: String? = null,
	/** Seconds until "Resend code" unlocks; 0 = enabled. */
	val resendInSeconds: Int = 0,
)

/** What the host stores to open a session: the bearer, plus who it belongs to when known. */
data class SessionCredentials(
	val token: String,
	val userId: String? = null,
	val guest: Boolean = false,
)

/**
 * Native sign-in state machine (#288): email → code → signed in, or
 * password, or guest. A success lands in [signedIn] once; the host stores it
 * and calls [consumeSignedIn], which resets the screen for the next sign-in.
 * [tick] waits one second of the resend countdown (tests drive it by hand).
 */
class SignInViewModel(
	private val auth: AuthSource,
	private val tick: suspend () -> Unit = { delay(1_000) },
) : ViewModel() {
	private val _ui = MutableStateFlow(SignInUiState())
	val ui: StateFlow<SignInUiState> = _ui

	private val _signedIn = MutableStateFlow<SessionCredentials?>(null)
	val signedIn: StateFlow<SessionCredentials?> = _signedIn

	/** Kept for "Resend code" on a signup. */
	private var signupNames: SignupNames? = null

	private val countdown = ResendCountdown(viewModelScope, tick) { left ->
		_ui.update { it.copy(resendInSeconds = left) }
	}

	fun setIntent(intent: AuthIntent) = _ui.update { it.copy(intent = intent, error = null) }

	/** [names] are required for signup (the server 400s without them) and ignored for login. */
	fun requestCode(email: String, names: SignupNames? = null) {
		val address = email.trim()
		val signup = _ui.value.intent == AuthIntent.SIGNUP
		val error = when {
			address.isEmpty() -> "Enter your email"
			signup && (names == null || names.firstName.isBlank() || names.lastName.isBlank()) -> "Enter your first and last name"
			else -> null
		}
		_ui.update { it.copy(email = address, error = error) }
		if (error != null) return
		signupNames = if (signup) names else null
		send(SignInPending.SEND_CODE)
	}

	fun resendCode() {
		if (_ui.value.resendInSeconds == 0) send(SignInPending.RESEND)
	}

	fun verifyCode(code: String) {
		val digits = code.filter(Char::isDigit)
		if (digits.length != CODE_LENGTH) {
			_ui.update { it.copy(error = "Enter the $CODE_LENGTH-digit code from the email") }
			return
		}
		val state = _ui.value
		run(SignInPending.VERIFY, guest = false) { auth.verifyCode(state.email, digits, state.intent) }
	}

	fun signInWithPassword(email: String, password: String) {
		val address = email.trim()
		_ui.update { it.copy(email = address) }
		if (address.isEmpty() || password.isEmpty()) {
			_ui.update { it.copy(error = "Enter your email and password") }
			return
		}
		run(SignInPending.PASSWORD, guest = false) { auth.signInWithPassword(address, password) }
	}

	fun continueAsGuest() = run(SignInPending.GUEST, guest = true) { auth.continueAsGuest() }

	fun showStep(step: SignInStep) {
		if (step != SignInStep.CODE) countdown.stop()
		_ui.update { it.copy(step = step, error = null) }
	}

	fun consumeSignedIn() {
		_signedIn.value = null
		countdown.stop()
		_ui.value = SignInUiState(email = _ui.value.email)
	}

	private fun send(pending: SignInPending) {
		if (_ui.value.pending != null) return
		val state = _ui.value
		_ui.update { it.copy(pending = pending, error = null) }
		viewModelScope.launch {
			when (val result = auth.requestCode(state.email, state.intent, signupNames)) {
				is AuthResult.Ok -> {
					_ui.update { it.copy(step = SignInStep.CODE, pending = null) }
					countdown.start(RESEND_SECONDS)
				}
				is AuthResult.Err -> _ui.update { it.copy(pending = null, error = result.error.message) }
			}
		}
	}

	private fun run(pending: SignInPending, guest: Boolean, call: suspend () -> AuthResult<AuthSessionDto>) {
		if (_ui.value.pending != null) return
		_ui.update { it.copy(pending = pending, error = null) }
		viewModelScope.launch {
			when (val result = call()) {
				// Pending stays on until the host consumes the session and swaps screens.
				is AuthResult.Ok -> _signedIn.value = SessionCredentials(result.value.token, result.value.user.id, guest)
				is AuthResult.Err -> _ui.update { it.copy(pending = null, error = result.error.message) }
			}
		}
	}

	companion object {
		const val CODE_LENGTH = 8
		const val RESEND_SECONDS = 30
	}
}

/** Counts [from] down to 0, one [tick] per second, reporting each value (the start value first). */
internal class ResendCountdown(
	private val scope: CoroutineScope,
	private val tick: suspend () -> Unit,
	private val report: (Int) -> Unit,
) {
	private var job: Job? = null

	fun start(from: Int) {
		stop()
		report(from)
		job = scope.launch {
			for (left in from - 1 downTo 0) {
				tick()
				report(left)
			}
		}
	}

	fun stop() {
		job?.cancel()
		job = null
		report(0)
	}
}
