package com.familyplanz.app.ui.gesture

import com.familyplanz.app.data.AuthIntent
import com.familyplanz.app.data.AuthResult
import com.familyplanz.app.data.AuthSessionDto
import com.familyplanz.app.data.AuthSource
import com.familyplanz.app.data.AuthUserDto
import com.familyplanz.app.data.SignupNames
import kotlinx.coroutines.CompletableDeferred

/** In-memory [AuthSource] (#288): settable answers, every call recorded, optional gate to hold a call pending. */
class FakeAuthSource : AuthSource {
	var codeResult: AuthResult<Unit> = AuthResult.Ok(Unit)
	var session: AuthResult<AuthSessionDto> = AuthResult.Ok(AuthSessionDto("fp_signed_in", AuthUserDto(id = "u-1")))
	var gate: CompletableDeferred<Unit>? = null

	val codeRequests = mutableListOf<Pair<String, AuthIntent>>()
	val codeNames = mutableListOf<SignupNames?>()
	val verifications = mutableListOf<Triple<String, String, AuthIntent>>()
	val passwords = mutableListOf<Pair<String, String>>()
	var guests = 0
	val loggedOut = mutableListOf<String>()

	override suspend fun requestCode(email: String, intent: AuthIntent, names: SignupNames?): AuthResult<Unit> {
		codeRequests += email to intent
		codeNames += names
		gate?.await()
		return codeResult
	}

	override suspend fun verifyCode(email: String, code: String, intent: AuthIntent): AuthResult<AuthSessionDto> {
		verifications += Triple(email, code, intent)
		gate?.await()
		return session
	}

	override suspend fun signInWithPassword(email: String, password: String): AuthResult<AuthSessionDto> {
		passwords += email to password
		gate?.await()
		return session
	}

	override suspend fun continueAsGuest(): AuthResult<AuthSessionDto> {
		guests++
		gate?.await()
		return session
	}

	override suspend fun logout(bearer: String): AuthResult<Unit> {
		loggedOut += bearer
		return AuthResult.Ok(Unit)
	}
}
