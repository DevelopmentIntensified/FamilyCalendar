package com.familyplanz.app.data

import kotlinx.serialization.SerializationException
import retrofit2.HttpException
import java.io.IOException

/**
 * Why a sign-in call failed. Unlike [ApiError], a 401 here is a wrong
 * password (not a dead session), so every server answer keeps its own text.
 */
sealed interface AuthError {
	val message: String

	/** 400/401/403/404: bad email, wrong/expired code, wrong password. */
	data class Rejected(override val message: String) : AuthError

	/** 429: the server's "try again in a few minutes". */
	data class RateLimited(override val message: String) : AuthError

	data class Server(override val message: String) : AuthError

	data class Network(val cause: String) : AuthError {
		override val message = "Network problem ($cause)"
	}
}

sealed interface AuthResult<out T> {
	data class Ok<T>(val value: T) : AuthResult<T>

	data class Err(val error: AuthError) : AuthResult<Nothing>
}

/** The name the server gives this phone's token ("Android — <deviceName>"). */
fun interface DeviceNameProvider {
	fun deviceName(): String

	companion object {
		/** Build.MODEL ("Pixel 9"); blank on odd builds → a generic name. */
		val Default = DeviceNameProvider { android.os.Build.MODEL.orEmpty().trim().ifBlank { "Android phone" } }
	}
}

data class SignupNames(val firstName: String, val lastName: String)

/** Native sign-in (#288): every success is a fresh fp_ bearer for this device. */
interface AuthSource {
	/** [names] (first, last) go with signup only; the server needs both there. */
	suspend fun requestCode(email: String, intent: AuthIntent, names: SignupNames? = null): AuthResult<Unit>

	suspend fun verifyCode(email: String, code: String, intent: AuthIntent): AuthResult<AuthSessionDto>

	suspend fun signInWithPassword(email: String, password: String): AuthResult<AuthSessionDto>

	suspend fun continueAsGuest(): AuthResult<AuthSessionDto>

	/** Revokes [bearer] server-side (that token only). */
	suspend fun logout(bearer: String): AuthResult<Unit>

	/** G12 password sign-up: creates the account (email unverified, code sent) and signs in. */
	suspend fun signUpWithPassword(names: SignupNames, email: String, password: String): AuthResult<AuthSessionDto>

	/** G12 forgot password: emails the web reset link when the account exists; Ok either way. */
	suspend fun forgotPassword(email: String): AuthResult<Unit>
}

class NetworkAuthSource(
	private val api: AuthApi,
	private val device: DeviceNameProvider = DeviceNameProvider.Default,
) : AuthSource {
	override suspend fun requestCode(email: String, intent: AuthIntent, names: SignupNames?): AuthResult<Unit> =
		authCall {
			api.email(EmailCodeRequest(email.trim(), intent, names?.firstName?.trim(), names?.lastName?.trim()))
		}.unit()

	override suspend fun verifyCode(email: String, code: String, intent: AuthIntent): AuthResult<AuthSessionDto> =
		authCall { api.verify(VerifyCodeRequest(email.trim(), code, intent, device.deviceName())) }

	override suspend fun signInWithPassword(email: String, password: String): AuthResult<AuthSessionDto> =
		authCall { api.password(PasswordSignInRequest(email.trim(), password, device.deviceName())) }

	override suspend fun continueAsGuest(): AuthResult<AuthSessionDto> =
		authCall { api.guest(GuestSignInRequest(device.deviceName())) }

	override suspend fun logout(bearer: String): AuthResult<Unit> =
		authCall { api.logout("Bearer $bearer") }.unit()

	override suspend fun signUpWithPassword(names: SignupNames, email: String, password: String): AuthResult<AuthSessionDto> =
		authCall {
			api.signup(
				PasswordSignupRequest(names.firstName.trim(), names.lastName.trim(), email.trim(), password, device.deviceName()),
			)
		}

	override suspend fun forgotPassword(email: String): AuthResult<Unit> =
		authCall { api.forgot(ForgotPasswordRequest(email.trim())) }.unit()

	private fun <T> AuthResult<T>.unit(): AuthResult<Unit> = when (this) {
		is AuthResult.Ok -> AuthResult.Ok(Unit)
		is AuthResult.Err -> this
	}
}

internal suspend fun <T> authCall(block: suspend () -> T): AuthResult<T> =
	try {
		AuthResult.Ok(block())
	} catch (e: HttpException) {
		val text = errorBodyText(e.response()?.errorBody()?.string())
		AuthResult.Err(
			when (e.code()) {
				TOO_MANY_REQUESTS -> AuthError.RateLimited(text)
				in CLIENT_ERRORS -> AuthError.Rejected(text)
				else -> AuthError.Server(text)
			},
		)
	} catch (e: IOException) {
		AuthResult.Err(AuthError.Network(e.message?.take(120) ?: "unable to reach server"))
	} catch (_: SerializationException) {
		// A 200 that is not the contract's JSON (proxy page, half-deployed server).
		AuthResult.Err(AuthError.Server("Unexpected sign-in response from the server"))
	}

private const val TOO_MANY_REQUESTS = 429
private val CLIENT_ERRORS = 400..499

