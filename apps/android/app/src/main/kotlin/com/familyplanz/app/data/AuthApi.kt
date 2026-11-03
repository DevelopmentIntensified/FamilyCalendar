package com.familyplanz.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

/**
 * Native sign-in (#288 contract, docs/guides/task-api-spec.md "Mobile sign-in").
 * Every call but logout is unauthenticated; logout names the bearer it revokes.
 */
interface AuthApi {
	@POST("api/mobile/auth/email")
	suspend fun email(@Body body: EmailCodeRequest): CodeSentResponse

	@POST("api/mobile/auth/verify")
	suspend fun verify(@Body body: VerifyCodeRequest): AuthSessionDto

	@POST("api/mobile/auth/password")
	suspend fun password(@Body body: PasswordSignInRequest): AuthSessionDto

	@POST("api/mobile/auth/guest")
	suspend fun guest(@Body body: GuestSignInRequest): AuthSessionDto

	@POST("api/mobile/auth/logout")
	suspend fun logout(@Header("Authorization") authorization: String): LogoutResponse
}

/** `login` signs into an existing account; `signup` creates one (same rules as the web). */
@Serializable
enum class AuthIntent {
	@SerialName("login")
	LOGIN,

	@SerialName("signup")
	SIGNUP,
}

/** Names are signup-only (required there); null keys are omitted on the wire. */
@Serializable
data class EmailCodeRequest(
	val email: String,
	val intent: AuthIntent,
	val firstName: String? = null,
	val lastName: String? = null,
)

@Serializable
data class VerifyCodeRequest(val email: String, val code: String, val intent: AuthIntent, val deviceName: String)

@Serializable
data class PasswordSignInRequest(val email: String, val password: String, val deviceName: String)

@Serializable
data class GuestSignInRequest(val deviceName: String)

@Serializable
data class CodeSentResponse(val sent: Boolean = false)

@Serializable
data class LogoutResponse(val success: Boolean = false)

/** `email` is null for a guest (Anonymous Account placeholder email hidden). */
@Serializable
data class AuthUserDto(
	val id: String,
	val firstName: String? = null,
	val lastName: String? = null,
	val email: String? = null,
)

@Serializable
data class AuthSessionDto(val token: String, val user: AuthUserDto)
