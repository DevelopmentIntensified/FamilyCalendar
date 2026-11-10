package com.familyplanz.app.data

import kotlinx.serialization.json.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/** Who the bearer token belongs to (the Tasks lane's own thin slice). */
interface AccountSource {
	suspend fun me(): ApiResult<MeDto>
}

class NetworkAccountSource(private val api: FamilyPlanzApi) : AccountSource {
	override suspend fun me(): ApiResult<MeDto> = apiCall { api.me() }
}

/**
 * The `/api/me` slice the Account screen and the verify banner consume
 * (#292 G1, G3, G12, G13, G14). Own Retrofit interface so this lane never
 * edits another lane's API file.
 */
@Suppress("TooManyFunctions")
interface AccountApi {
	@GET("api/me")
	suspend fun me(): AccountMeDto

	@GET("api/me/settings")
	suspend fun settings(): AccountSettingsDto

	/** Any subset of the calendar-settings fields (G3); the server merges. */
	@PATCH("api/me/settings")
	suspend fun patchSettings(@Body body: JsonObject): AccountSettingsDto

	@PATCH("api/me/profile")
	suspend fun updateProfile(@Body body: ProfileBody): ProfileResultDto

	@POST("api/me/email")
	suspend fun updateEmail(@Body body: EmailBody): MessageResultDto

	@POST("api/me/sessions/revoke-others")
	suspend fun revokeOtherSessions(): RevokedSessionsDto

	@GET("api/me/api-tokens")
	suspend fun apiTokens(): ApiTokenListDto

	@POST("api/me/api-tokens")
	suspend fun createApiToken(@Body body: TokenNameBody): CreatedTokenDto

	@DELETE("api/me/api-tokens/{id}")
	suspend fun revokeApiToken(@Path("id") id: String): AckDto

	/** DELETE with a JSON body, so Retrofit needs @HTTP. */
	@HTTP(method = "DELETE", path = "api/me", hasBody = true)
	suspend fun deleteAccount(@Body body: DeleteAccountBody): AckDto

	@PUT("api/me/dashboard-modules")
	suspend fun saveDashboardModules(@Body body: HiddenModulesBody): ModulesResultDto

	@GET("api/me/notification-preferences")
	suspend fun notificationPreferences(): NotificationPreferencesDto

	@PUT("api/me/notification-preferences/{id}")
	suspend fun setNotificationPreference(
		@Path("id") id: String,
		@Body body: PreferenceValueBody,
	): MessageResultDto

	@GET("api/me/subscription")
	suspend fun subscription(): SubscriptionDto

	@POST("api/me/verify-email")
	suspend fun verifyEmail(@Body body: VerifyCodeBody): AckDto

	@POST("api/me/verify-email/resend")
	suspend fun resendVerification(): AckDto

	@POST("api/me/claim")
	suspend fun claim(@Body body: EmailBody): AckDto

	/** #189: the caller's own data as one JSON document (an attachment on the web). */
	@GET("api/account/export")
	suspend fun exportData(): ResponseBody
}

/** The Account screens' network edge: one call per spec endpoint. */
@Suppress("TooManyFunctions")
interface AccountSettingsSource {
	suspend fun me(): ApiResult<AccountMeDto>

	suspend fun settings(): ApiResult<AccountSettingsDto>

	suspend fun patchSettings(patch: JsonObject): ApiResult<AccountSettingsDto>

	suspend fun updateProfile(firstName: String, lastName: String): ApiResult<AccountUserDto?>

	suspend fun updateEmail(email: String): ApiResult<String>

	suspend fun revokeOtherSessions(): ApiResult<Int>

	suspend fun apiTokens(): ApiResult<List<ApiTokenDto>>

	suspend fun createApiToken(name: String): ApiResult<CreatedTokenDto>

	suspend fun revokeApiToken(id: String): ApiResult<Unit>

	suspend fun deleteAccount(confirmation: String): ApiResult<Unit>

	suspend fun saveDashboardModules(hidden: List<String>): ApiResult<List<String>>

	suspend fun notificationPreferences(): ApiResult<NotificationPreferencesDto>

	suspend fun setNotificationPreference(id: String, value: Boolean): ApiResult<String>

	suspend fun subscription(): ApiResult<SubscriptionDto>

	/** G12: redeems the emailed code for **my own** address; clears the banner. */
	suspend fun verifyEmail(code: String): ApiResult<Unit>

	suspend fun resendVerification(): ApiResult<Unit>

	/** G13: emails the web claim link to a guest's address. */
	suspend fun claim(email: String): ApiResult<Unit>

	/** #189: the caller's data export, as the JSON text the server sent. */
	suspend fun exportData(): ApiResult<String>
}

@Suppress("TooManyFunctions")
class NetworkAccountSettingsSource(private val api: AccountApi) : AccountSettingsSource {
	override suspend fun me(): ApiResult<AccountMeDto> = apiCall { api.me() }

	override suspend fun settings(): ApiResult<AccountSettingsDto> = apiCall { api.settings() }

	override suspend fun patchSettings(patch: JsonObject): ApiResult<AccountSettingsDto> =
		apiCall { api.patchSettings(patch) }

	override suspend fun updateProfile(firstName: String, lastName: String): ApiResult<AccountUserDto?> =
		apiCall { api.updateProfile(ProfileBody(firstName.trim(), lastName.trim())).user }

	override suspend fun updateEmail(email: String): ApiResult<String> =
		apiCall { api.updateEmail(EmailBody(email.trim())).message }

	override suspend fun revokeOtherSessions(): ApiResult<Int> =
		apiCall { api.revokeOtherSessions().revoked }

	override suspend fun apiTokens(): ApiResult<List<ApiTokenDto>> =
		apiCall { api.apiTokens().tokens }

	override suspend fun createApiToken(name: String): ApiResult<CreatedTokenDto> =
		apiCall { api.createApiToken(TokenNameBody(name.trim())) }

	override suspend fun revokeApiToken(id: String): ApiResult<Unit> =
		apiCall { api.revokeApiToken(id) }.unit()

	override suspend fun deleteAccount(confirmation: String): ApiResult<Unit> =
		apiCall { api.deleteAccount(DeleteAccountBody(confirmation.trim())) }.unit()

	override suspend fun saveDashboardModules(hidden: List<String>): ApiResult<List<String>> =
		apiCall { api.saveDashboardModules(HiddenModulesBody(hidden)).hidden }

	override suspend fun notificationPreferences(): ApiResult<NotificationPreferencesDto> =
		apiCall { api.notificationPreferences() }

	override suspend fun setNotificationPreference(id: String, value: Boolean): ApiResult<String> =
		apiCall { api.setNotificationPreference(id, PreferenceValueBody(value)).message }

	override suspend fun subscription(): ApiResult<SubscriptionDto> = apiCall { api.subscription() }

	override suspend fun verifyEmail(code: String): ApiResult<Unit> =
		apiCall { api.verifyEmail(VerifyCodeBody(code.trim())) }.unit()

	override suspend fun resendVerification(): ApiResult<Unit> = apiCall { api.resendVerification() }.unit()

	override suspend fun claim(email: String): ApiResult<Unit> = apiCall { api.claim(EmailBody(email.trim())) }.unit()

	override suspend fun exportData(): ApiResult<String> = apiCall { api.exportData().string() }

	private fun <T> ApiResult<T>.unit(): ApiResult<Unit> = when (this) {
		is ApiResult.Ok -> ApiResult.Ok(Unit)
		is ApiResult.Err -> this
	}
}

/** Bearer-carrying client for [AccountApi]. */
object AccountApis {
	fun create(baseUrl: String, tokenProvider: () -> String?): AccountApi =
		Retrofit.Builder()
			.baseUrl(baseUrl)
			.client(ApiFactory.createClient(tokenProvider))
			.addConverterFactory(ApiFactory.json.asConverterFactory("application/json".toMediaType()))
			.build()
			.create(AccountApi::class.java)
}

/** For a build with no account edge (UI fakes, previews): every call is refused, nothing reaches the network. */
@Suppress("TooManyFunctions")
object UnavailableAccountSettingsSource : AccountSettingsSource {
	private val none = ApiResult.Err(ApiError.Unsupported)

	override suspend fun me(): ApiResult<AccountMeDto> = none

	override suspend fun settings(): ApiResult<AccountSettingsDto> = none

	override suspend fun patchSettings(patch: JsonObject): ApiResult<AccountSettingsDto> = none

	override suspend fun updateProfile(firstName: String, lastName: String): ApiResult<AccountUserDto?> = none

	override suspend fun updateEmail(email: String): ApiResult<String> = none

	override suspend fun revokeOtherSessions(): ApiResult<Int> = none

	override suspend fun apiTokens(): ApiResult<List<ApiTokenDto>> = none

	override suspend fun createApiToken(name: String): ApiResult<CreatedTokenDto> = none

	override suspend fun revokeApiToken(id: String): ApiResult<Unit> = none

	override suspend fun deleteAccount(confirmation: String): ApiResult<Unit> = none

	override suspend fun saveDashboardModules(hidden: List<String>): ApiResult<List<String>> = none

	override suspend fun notificationPreferences(): ApiResult<NotificationPreferencesDto> = none

	override suspend fun setNotificationPreference(id: String, value: Boolean): ApiResult<String> = none

	override suspend fun subscription(): ApiResult<SubscriptionDto> = none

	override suspend fun verifyEmail(code: String): ApiResult<Unit> = none

	override suspend fun resendVerification(): ApiResult<Unit> = none

	override suspend fun claim(email: String): ApiResult<Unit> = none

	override suspend fun exportData(): ApiResult<String> = none
}
