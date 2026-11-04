package com.familyplanz.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.AuthIntent
import com.familyplanz.app.data.AuthResult
import com.familyplanz.app.data.AuthSessionDto
import com.familyplanz.app.data.AuthSource
import com.familyplanz.app.data.SignupNames
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Which face of the AuthCard shows. [PASSWORD] and [EMAIL] are the two
 * ModeToggle segments ("Password" | "Email Link", Password first, as on
 * /login and /signup); [CODE] is the "Check Your Email" step; [FORGOT] is
 * /forgot-password ("Reset Password").
 */
enum class SignInStep { PASSWORD, EMAIL, CODE, FORGOT }

/** Which button is waiting on the server (it shows a busy label; every button is disabled). */
enum class SignInPending { SEND_CODE, RESEND, VERIFY, PASSWORD, GUEST, FORGOT }

data class SignInUiState(
	val step: SignInStep = SignInStep.PASSWORD,
	val intent: AuthIntent = AuthIntent.LOGIN,
	val email: String = "",
	val pending: SignInPending? = null,
	val error: String? = null,
	/** The web's "Sent again ✓" pill after a resend, shown for [SignInViewModel.SENT_AGAIN_MS]. */
	val sentAgain: Boolean = false,
	/** /forgot-password answered: "Check Your Email" replaces the form. */
	val resetSent: Boolean = false,
)

/** What the host stores to open a session: the bearer, plus who it belongs to when known. */
data class SessionCredentials(
	val token: String,
	val userId: String? = null,
	val guest: Boolean = false,
)

/** /signup's password form extras: the names and the "Confirm Password" field. */
data class PasswordSignup(val names: SignupNames, val confirmPassword: String)

/**
 * Native sign-in state machine (#288, cloned to the web's /login, /signup
 * and /forgot-password in #292 §2.13): password, email code (the web's
 * "Email Link", an 8-digit code on Android), guest, password sign-up (G12)
 * and forgot password (G12). A success lands in [signedIn] once; the host
 * stores it and calls [consumeSignedIn], which resets the screen.
 * [pause] waits out the "Sent again ✓" pill (tests drive it by hand).
 */
class SignInViewModel(
	private val auth: AuthSource,
	private val pause: suspend (Long) -> Unit = { delay(it) },
) : ViewModel() {
	private val _ui = MutableStateFlow(SignInUiState())
	val ui: StateFlow<SignInUiState> = _ui

	private val _signedIn = MutableStateFlow<SessionCredentials?>(null)
	val signedIn: StateFlow<SessionCredentials?> = _signedIn

	/** Kept for "Resend" on a signup. */
	private var signupNames: SignupNames? = null
	private var sentAgainJob: Job? = null

	/** "Sign up" / "Sign in" links: the other page, on the same toggle segment. */
	fun setIntent(intent: AuthIntent) = _ui.update {
		val step = if (it.step == SignInStep.EMAIL) SignInStep.EMAIL else SignInStep.PASSWORD
		it.copy(intent = intent, step = step, error = null, resetSent = false)
	}

	/**
	 * "Send Login Link" / "Send Verification Link"; on the [SignInStep.FORGOT]
	 * face the same email button is "Send Reset Link". [names] are required
	 * for signup (the server 400s without them) and ignored for login.
	 */
	fun requestCode(email: String, names: SignupNames? = null) {
		val address = email.trim()
		if (_ui.value.step == SignInStep.FORGOT) return forgot(address)
		val signup = _ui.value.intent == AuthIntent.SIGNUP
		val error = when {
			address.isEmpty() -> "Enter your email"
			signup && !names.complete() -> "First and last name are required"
			else -> null
		}
		_ui.update { it.copy(email = address, error = error) }
		if (error != null) return
		signupNames = if (signup) names else null
		send(SignInPending.SEND_CODE)
	}

	/** "Didn't receive the code? Resend". */
	fun resendCode() = send(SignInPending.RESEND)

	fun verifyCode(code: String) {
		val digits = code.filter(Char::isDigit)
		if (digits.length != CODE_LENGTH) {
			_ui.update { it.copy(error = "Enter the $CODE_LENGTH-digit code from the email") }
			return
		}
		val state = _ui.value
		run(SignInPending.VERIFY, guest = false) { auth.verifyCode(state.email, digits, state.intent) }
	}

	/**
	 * "Login" on /login; "Create Account" on /signup when [signup] carries
	 * the names and confirmation (the web's local checks run first).
	 */
	fun signInWithPassword(email: String, password: String, signup: PasswordSignup? = null) {
		val address = email.trim()
		_ui.update { it.copy(email = address) }
		val creating = _ui.value.intent == AuthIntent.SIGNUP
		val error = when {
			address.isEmpty() || password.isEmpty() -> "Enter your email and password"
			!creating -> null
			signup == null || !signup.names.complete() -> "All fields are required"
			// /signup/+page.svelte:45,51 — checked before the request.
			password != signup.confirmPassword -> "Passwords do not match"
			password.length < MIN_PASSWORD -> "Password must be at least 8 characters"
			else -> null
		}
		if (error != null) {
			_ui.update { it.copy(error = error) }
			return
		}
		if (creating && signup != null) {
			run(SignInPending.PASSWORD, guest = false) { auth.signUpWithPassword(signup.names, address, password) }
		} else {
			run(SignInPending.PASSWORD, guest = false) { auth.signInWithPassword(address, password) }
		}
	}

	fun continueAsGuest() = run(SignInPending.GUEST, guest = true) { auth.continueAsGuest() }

	/** The toggle segments, "Forgot your password?" and the way back from the code step. */
	fun showStep(step: SignInStep) {
		stopSentAgain()
		_ui.update { it.copy(step = step, error = null, resetSent = false) }
	}

	fun consumeSignedIn() {
		_signedIn.value = null
		stopSentAgain()
		_ui.value = SignInUiState(email = _ui.value.email)
	}

	private fun forgot(address: String) {
		if (_ui.value.pending != null) return
		if (address.isEmpty()) {
			_ui.update { it.copy(error = "Email is required") }
			return
		}
		_ui.update { it.copy(email = address, pending = SignInPending.FORGOT, error = null) }
		viewModelScope.launch {
			when (val result = auth.forgotPassword(address)) {
				is AuthResult.Ok -> _ui.update { it.copy(pending = null, resetSent = true) }
				is AuthResult.Err -> _ui.update { it.copy(pending = null, error = result.error.message) }
			}
		}
	}

	private fun send(pending: SignInPending) {
		if (_ui.value.pending != null) return
		val state = _ui.value
		_ui.update { it.copy(pending = pending, error = null) }
		viewModelScope.launch {
			when (val result = auth.requestCode(state.email, state.intent, signupNames)) {
				is AuthResult.Ok -> {
					_ui.update { it.copy(step = SignInStep.CODE, pending = null) }
					if (pending == SignInPending.RESEND) flashSentAgain()
				}
				is AuthResult.Err -> _ui.update { it.copy(pending = null, error = result.error.message) }
			}
		}
	}

	private fun flashSentAgain() {
		stopSentAgain()
		_ui.update { it.copy(sentAgain = true) }
		sentAgainJob = viewModelScope.launch {
			pause(SENT_AGAIN_MS)
			_ui.update { it.copy(sentAgain = false) }
		}
	}

	private fun stopSentAgain() {
		sentAgainJob?.cancel()
		sentAgainJob = null
		_ui.update { it.copy(sentAgain = false) }
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
		const val MIN_PASSWORD = 8

		/** `calendar/+layout.svelte:126` / `login/+page.svelte` resend timer. */
		const val SENT_AGAIN_MS = 3_000L
	}
}

private fun SignupNames?.complete(): Boolean = this != null && firstName.isNotBlank() && lastName.isNotBlank()
