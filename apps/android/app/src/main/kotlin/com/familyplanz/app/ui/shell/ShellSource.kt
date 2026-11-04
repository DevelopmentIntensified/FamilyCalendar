package com.familyplanz.app.ui.shell

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.apiCall
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.StartRouteProvider
import androidx.annotation.Keep
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/** `/api/notifications` row (`notificationTypes.ts` NotificationRow, the fields the bell reads). */
@Keep
@Serializable
data class NotificationDto(
	val id: String,
	val type: String? = null,
	val rawType: String? = null,
	val message: String = "",
	val link: String? = null,
	val readAt: String? = null,
	val createdAt: String? = null,
)

@Keep
@Serializable
data class NotificationsResponse(
	val notifications: List<NotificationDto> = emptyList(),
	val unreadCount: Int = 0,
)

/** POST `/api/notifications`: `{id}` marks one read, `{all:true}` marks all. */
@Keep
@Serializable
data class MarkReadRequest(val id: String? = null, val all: Boolean? = null)

/**
 * `GET /api/me` with the G1 fields (all optional, so today's `{id, firstName,
 * lastName}` still decodes and simply shows no account banners).
 */
@Keep
@Serializable
data class ShellMeDto(
	val id: String? = null,
	val firstName: String? = null,
	val email: String? = null,
	val emailVerified: Boolean? = null,
	val isAnonymous: Boolean? = null,
	val roles: List<String> = emptyList(),
	val lastActiveAt: String? = null,
)

@Keep
@Serializable
data class SettingsDto(val defaultView: String? = null)

/** G3 `GET /api/me/settings` → `{settings:{…}}`. */
@Keep
@Serializable
data class SettingsResponse(val settings: SettingsDto = SettingsDto())

@Keep
@Serializable
data class VerifyCodeRequest(val code: String)

/** The `/api` calls the shell makes (bell, badge, banners, start screen). */
interface ShellApi {
	@GET("api/notifications")
	suspend fun notifications(): NotificationsResponse

	@POST("api/notifications")
	suspend fun markRead(@Body body: MarkReadRequest)

	@GET("api/me")
	suspend fun me(): ShellMeDto

	@GET("api/me/settings")
	suspend fun settings(): SettingsResponse

	/** G12 (proposed): mirrors `/signup/password/verify`. */
	@POST("api/me/verify-email")
	suspend fun verifyEmail(@Body body: VerifyCodeRequest)

	/** G12 (proposed): mirrors `/signup/password/resend`. */
	@POST("api/me/verify-email/resend")
	suspend fun resendVerifyEmail()
}

/** The shell's data edge; tests pass a fake. */
interface ShellSource {
	suspend fun notifications(): ApiResult<NotificationsResponse>

	suspend fun markRead(id: String): ApiResult<Unit>

	suspend fun markAllRead(): ApiResult<Unit>

	suspend fun me(): ApiResult<ShellMeDto>

	suspend fun defaultView(): ApiResult<String?>

	suspend fun verifyEmail(code: String): ApiResult<Unit>

	suspend fun resendVerifyEmail(): ApiResult<Unit>

	/** No server: every call fails quietly, so the shell shows no badge and no account banners. */
	object None : ShellSource {
		private val off = ApiResult.Err(ApiError.Network("offline"))

		override suspend fun notifications() = off

		override suspend fun markRead(id: String) = off

		override suspend fun markAllRead() = off

		override suspend fun me() = off

		override suspend fun defaultView() = off

		override suspend fun verifyEmail(code: String) = off

		override suspend fun resendVerifyEmail() = off
	}
}

class NetworkShellSource(private val api: ShellApi) : ShellSource {
	override suspend fun notifications() = apiCall { api.notifications() }

	override suspend fun markRead(id: String) = apiCall { api.markRead(MarkReadRequest(id = id)) }

	override suspend fun markAllRead() = apiCall { api.markRead(MarkReadRequest(all = true)) }

	override suspend fun me() = apiCall { api.me() }

	override suspend fun defaultView() = apiCall { api.settings().settings.defaultView }

	override suspend fun verifyEmail(code: String) = apiCall { api.verifyEmail(VerifyCodeRequest(code)) }

	override suspend fun resendVerifyEmail() = apiCall { api.resendVerifyEmail() }
}

/**
 * Owner 2026-11-03: open on the user's `defaultView` — `"dashboard"` →
 * Dashboard (`calendar/+page.server.ts:96`), anything else, or any failure
 * (G3 not deployed yet, offline), → Calendar.
 */
class SettingsStartRoute(private val source: ShellSource) : StartRouteProvider {
	override suspend fun startRoute(): AppRoute =
		when ((source.defaultView() as? ApiResult.Ok)?.value) {
			"dashboard" -> AppRoute.DASHBOARD
			else -> AppRoute.CALENDAR
		}
}
