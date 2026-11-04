package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import okhttp3.MediaType.Companion.toMediaType
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
import retrofit2.http.Query

/**
 * The `/api/families` slice the phone consumes (#292 L0 G10a-e, G11).
 * A separate Retrofit interface from [FamilyPlanzApi] so this lane never
 * edits another lane's file.
 */
interface FamilyApi {
	@GET("api/families")
	suspend fun overview(): FamiliesOverviewDto

	@GET("api/families/{id}")
	suspend fun detail(@Path("id") id: String): FamilyDetailDto

	@PATCH("api/families/{id}")
	suspend fun updateFamily(@Path("id") id: String, @Body body: FamilyPatch): FamilyMutationDto

	@PATCH("api/families/{id}/members/{userId}")
	suspend fun updateMember(
		@Path("id") id: String,
		@Path("userId") userId: String,
		@Body body: MemberPatch,
	): AckDto

	@DELETE("api/families/{id}/members/{userId}")
	suspend fun removeMember(@Path("id") id: String, @Path("userId") userId: String): AckDto

	@PUT("api/families/{id}/modules/{module}")
	suspend fun setModule(
		@Path("id") id: String,
		@Path("module") module: String,
		@Body body: ModulePatch,
	): AckDto

	@GET("api/families/{id}/invite-codes")
	suspend fun inviteCodes(@Path("id") id: String): InviteCodesDto

	@GET("api/families/{id}/tasks")
	suspend fun tasks(@Path("id") id: String): FamilyTasksDto

	@POST("api/families")
	suspend fun createFamily(@Body body: CreateFamilyBody): CreatedFamilyDto

	@POST("api/families/{id}/members/direct")
	suspend fun addDirect(@Path("id") id: String, @Body body: DirectMemberBody): AckDto

	@POST("api/families/{id}/members/email")
	suspend fun addEmail(@Path("id") id: String, @Body body: EmailMemberBody): AckDto

	@POST("api/families/{id}/members/email/link")
	suspend fun addEmailLink(@Path("id") id: String, @Body body: EmailMemberBody): EmailInviteLinkDto

	@POST("api/families/{id}/members/child")
	suspend fun addChild(@Path("id") id: String, @Body body: ChildMemberBody): ChildMemberDto

	@POST("api/family/invite")
	suspend fun mintInvite(@Body body: MintInviteBody): MintedInviteDto

	/** The existing DELETE-with-body door: one code, by value. */
	@HTTP(method = "DELETE", path = "api/family/invite", hasBody = true)
	suspend fun revokeInvite(@Body body: RevokeInviteBody): AckDto

	@GET("api/family/member-search")
	suspend fun searchMembers(
		@Query("q") query: String,
		@Query("exclude") exclude: List<String>,
	): MemberSearchDto

	/** The Family Task Board writes through the same task door, naming the family (G11). */
	@POST("api/tasks")
	suspend fun createFamilyTask(@Body body: FamilyTaskBody): TaskMutationResponse
}

/** `null` fields are omitted on the wire (ApiFactory.json keeps explicitNulls off). */
@Serializable
data class FamilyPatch(val name: String? = null, val color: String? = null)

@Serializable
data class MemberPatch(val role: String? = null, val memberType: String? = null)

@Serializable
data class ModulePatch(val enabled: Boolean)

@Serializable
data class CreateFamilyBody(val name: String, val color: String? = null, val memberIds: List<String>)

@Serializable
data class DirectMemberBody(val userId: String)

@Serializable
data class EmailMemberBody(val email: String, val firstName: String, val lastName: String)

@Serializable
data class ChildMemberBody(
	val firstName: String,
	val lastName: String,
	val email: String,
	val consentAcknowledged: Boolean,
)

@Serializable
data class MintInviteBody(val familyId: String, val expiresInDays: Int, val maxUses: Int)

@Serializable
data class RevokeInviteBody(val code: String)

/** A family task: the board's add form names the family and (optionally) who mows. */
@Serializable
data class FamilyTaskBody(
	val title: String,
	val familyId: String,
	val assignedTo: String? = null,
	val category: String? = null,
)

@Serializable
data class AckDto(val success: Boolean = true)

@Serializable
data class FamilyMutationDto(val success: Boolean = true, val family: FamilyDto? = null)

@Serializable
data class CreatedFamilyDto(val family: FamilyDto)

/** The Family screens' network edge; one call per spec endpoint. */
interface FamilySource {
	suspend fun overview(): ApiResult<FamiliesOverviewDto>

	suspend fun detail(familyId: String): ApiResult<FamilyDetailDto>

	suspend fun updateFamily(familyId: String, name: String?, color: String?): ApiResult<FamilyDto?>

	suspend fun updateMember(
		familyId: String,
		userId: String,
		role: String?,
		memberType: String?,
	): ApiResult<Unit>

	suspend fun removeMember(familyId: String, userId: String): ApiResult<Unit>

	suspend fun setModule(familyId: String, module: String, enabled: Boolean): ApiResult<Unit>

	suspend fun inviteCodes(familyId: String): ApiResult<InviteCodesDto>

	suspend fun mintInvite(familyId: String, expiresInDays: Int, maxUses: Int): ApiResult<MintedInviteDto>

	suspend fun revokeInvite(code: String): ApiResult<Unit>

	suspend fun createFamily(name: String, color: String?, memberIds: List<String>): ApiResult<FamilyDto>

	suspend fun addMemberDirect(familyId: String, userId: String): ApiResult<Unit>

	suspend fun addMemberByEmail(
		familyId: String,
		email: String,
		firstName: String,
		lastName: String,
	): ApiResult<Unit>

	suspend fun addMemberEmailLink(
		familyId: String,
		email: String,
		firstName: String,
		lastName: String,
	): ApiResult<EmailInviteLinkDto>

	suspend fun addChild(
		familyId: String,
		firstName: String,
		lastName: String,
		email: String,
		consent: Boolean,
	): ApiResult<ChildUserDto?>

	suspend fun tasks(familyId: String): ApiResult<FamilyTasksDto>

	suspend fun searchMembers(query: String, exclude: List<String>): ApiResult<List<MemberHitDto>>

	/** AC-FT-2: a board task lands on `assignedTo` (null = the caller) as a pending request. */
	suspend fun createFamilyTask(
		familyId: String,
		title: String,
		assignedTo: String?,
		category: String?,
	): ApiResult<TaskDto>
}

class NetworkFamilySource(private val api: FamilyApi) : FamilySource {
	override suspend fun overview(): ApiResult<FamiliesOverviewDto> = apiCall { api.overview() }

	override suspend fun detail(familyId: String): ApiResult<FamilyDetailDto> = apiCall { api.detail(familyId) }

	override suspend fun updateFamily(familyId: String, name: String?, color: String?): ApiResult<FamilyDto?> =
		apiCall { api.updateFamily(familyId, FamilyPatch(name, color)).family }

	override suspend fun updateMember(
		familyId: String,
		userId: String,
		role: String?,
		memberType: String?,
	): ApiResult<Unit> = apiCall { api.updateMember(familyId, userId, MemberPatch(role, memberType)) }.unit()

	override suspend fun removeMember(familyId: String, userId: String): ApiResult<Unit> =
		apiCall { api.removeMember(familyId, userId) }.unit()

	override suspend fun setModule(familyId: String, module: String, enabled: Boolean): ApiResult<Unit> =
		apiCall { api.setModule(familyId, module, ModulePatch(enabled)) }.unit()

	override suspend fun inviteCodes(familyId: String): ApiResult<InviteCodesDto> =
		apiCall { api.inviteCodes(familyId) }

	override suspend fun mintInvite(
		familyId: String,
		expiresInDays: Int,
		maxUses: Int,
	): ApiResult<MintedInviteDto> =
		apiCall { api.mintInvite(MintInviteBody(familyId, expiresInDays, maxUses)) }

	override suspend fun revokeInvite(code: String): ApiResult<Unit> =
		apiCall { api.revokeInvite(RevokeInviteBody(code)) }.unit()

	override suspend fun createFamily(name: String, color: String?, memberIds: List<String>): ApiResult<FamilyDto> =
		apiCall { api.createFamily(CreateFamilyBody(name, color, memberIds)).family }

	override suspend fun addMemberDirect(familyId: String, userId: String): ApiResult<Unit> =
		apiCall { api.addDirect(familyId, DirectMemberBody(userId)) }.unit()

	override suspend fun addMemberByEmail(
		familyId: String,
		email: String,
		firstName: String,
		lastName: String,
	): ApiResult<Unit> =
		apiCall { api.addEmail(familyId, EmailMemberBody(email.trim(), firstName.trim(), lastName.trim())) }.unit()

	override suspend fun addMemberEmailLink(
		familyId: String,
		email: String,
		firstName: String,
		lastName: String,
	): ApiResult<EmailInviteLinkDto> =
		apiCall { api.addEmailLink(familyId, EmailMemberBody(email.trim(), firstName.trim(), lastName.trim())) }

	override suspend fun addChild(
		familyId: String,
		firstName: String,
		lastName: String,
		email: String,
		consent: Boolean,
	): ApiResult<ChildUserDto?> = apiCall {
		api.addChild(
			familyId,
			ChildMemberBody(firstName.trim(), lastName.trim(), email.trim(), consent),
		).user
	}

	override suspend fun tasks(familyId: String): ApiResult<FamilyTasksDto> = apiCall { api.tasks(familyId) }

	override suspend fun searchMembers(query: String, exclude: List<String>): ApiResult<List<MemberHitDto>> =
		apiCall { api.searchMembers(query.trim(), exclude).users }

	override suspend fun createFamilyTask(
		familyId: String,
		title: String,
		assignedTo: String?,
		category: String?,
	): ApiResult<TaskDto> =
		apiCall { api.createFamilyTask(FamilyTaskBody(title.trim(), familyId, assignedTo, category)).task }

	private fun <T> ApiResult<T>.unit(): ApiResult<Unit> = when (this) {
		is ApiResult.Ok -> ApiResult.Ok(Unit)
		is ApiResult.Err -> this
	}
}

/** Bearer-carrying client for [FamilyApi]; same redirect/interceptor rules as [ApiFactory.create]. */
object FamilyApis {
	fun create(baseUrl: String, tokenProvider: () -> String?): FamilyApi =
		Retrofit.Builder()
			.baseUrl(baseUrl)
			.client(ApiFactory.createClient(tokenProvider))
			.addConverterFactory(ApiFactory.json.asConverterFactory("application/json".toMediaType()))
			.build()
			.create(FamilyApi::class.java)
}
