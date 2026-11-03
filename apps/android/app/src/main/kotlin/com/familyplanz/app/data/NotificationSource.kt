package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * One Alerts row, as `GET /api/notifications` sends it (`toNotificationRow`,
 * `src/lib/utils/notificationTypes.ts`): the raw `type` column is kept so an
 * unknown value still renders (as "Update").
 */
@Serializable
data class NotificationDto(
	val id: String,
	val type: String? = null,
	val rawType: String = "",
	val group: String = "news",
	val actorName: String = "",
	val message: String = "",
	val link: String? = null,
	val readAt: String? = null,
	val createdAt: String = "",
)

@Serializable
data class NotificationFeedDto(
	val notifications: List<NotificationDto> = emptyList(),
	val unreadCount: Int = 0,
)

/** The Alerts feed (§2.6): read it, mark one or all read, prune the read rows. */
interface NotificationSource {
	suspend fun feed(): ApiResult<NotificationFeedDto>

	/** `POST {id}`. */
	suspend fun markRead(id: String): ApiResult<Unit>

	/** `POST {all:true}`. */
	suspend fun markAllRead(): ApiResult<Unit>

	/** `POST {pruneRead:true}`. */
	suspend fun pruneRead(): ApiResult<Unit>
}

interface NotificationApi {
	@GET("api/notifications")
	suspend fun feed(): NotificationFeedDto

	@POST("api/notifications")
	suspend fun post(@Body body: JsonElement): JsonElement
}

class NetworkNotificationSource(private val api: NotificationApi) : NotificationSource {
	override suspend fun feed(): ApiResult<NotificationFeedDto> = apiCall { api.feed() }

	override suspend fun markRead(id: String): ApiResult<Unit> =
		post("id" to JsonPrimitive(id))

	override suspend fun markAllRead(): ApiResult<Unit> = post("all" to JsonPrimitive(true))

	override suspend fun pruneRead(): ApiResult<Unit> = post("pruneRead" to JsonPrimitive(true))

	private suspend fun post(field: Pair<String, JsonPrimitive>): ApiResult<Unit> = apiCall {
		api.post(buildJsonObject { put(field.first, field.second) })
		Unit
	}
}

/**
 * Retrofit for lane 4's own API slices (alerts, groceries, dashboard) over
 * the production client: same Json settings, Bearer interceptor and
 * no-redirect rule as [ApiFactory].
 */
object L4Http {
	private val converter = ApiFactory.json.asConverterFactory("application/json".toMediaType())

	fun <T> create(baseUrl: String, service: Class<T>, tokenProvider: () -> String?): T =
		Retrofit.Builder()
			.baseUrl(baseUrl)
			.client(ApiFactory.createClient(tokenProvider))
			.addConverterFactory(converter)
			.build()
			.create(service)
}
