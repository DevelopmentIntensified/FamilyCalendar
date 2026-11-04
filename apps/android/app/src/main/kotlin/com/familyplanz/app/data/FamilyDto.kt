package com.familyplanz.app.data

import kotlinx.serialization.Serializable

/**
 * Read models of the `/api/families` routes (docs/guides/task-api-spec.md, "Families
 * (G10a-c, G11)"): /family, /family/[id], /family/invitations, create,
 * members and the Family Task Board. Every list defaults empty and every
 * field is nullable-tolerated, so a partially-deployed server parses.
 */
@Serializable
data class FamiliesOverviewDto(
	val families: List<FamilyCardDto> = emptyList(),
	val roster: List<RosterRowDto> = emptyList(),
	val activeInvites: List<LiveInviteDto> = emptyList(),
	val plan: FamilyPlanDto = FamilyPlanDto(),
)

/** One /family card; [createdLabel] is the page's pre-formatted date. */
@Serializable
data class FamilyCardDto(
	val id: String,
	val name: String = "",
	val color: String? = null,
	val createdAt: String? = null,
	val createdLabel: String? = null,
	val memberCount: Int = 0,
	val openTasks: Int = 0,
	val members: List<FamilyNameDto> = emptyList(),
	/** The page offers "Invite by link" only to a creator/admin. */
	val canInvite: Boolean = false,
	val role: String? = null,
)

@Serializable
data class FamilyNameDto(val firstName: String = "", val userId: String = "")

/** A roster row: the member list, the create picker and the invitation switcher. */
@Serializable
data class RosterRowDto(
	val familyId: String = "",
	val userId: String = "",
	val firstName: String? = null,
	val lastName: String? = null,
	val email: String? = null,
	val role: String? = null,
	val memberType: String? = null,
)

@Serializable
data class LiveInviteDto(
	val familyId: String = "",
	val code: String = "",
	val useCount: Int = 0,
	val maxUses: Int? = null,
	val expiresAt: String? = null,
)

@Serializable
data class FamilyPlanDto(val used: Int = 0, val limit: Int = 0)

/** The detail hero (a `families` row). */
@Serializable
data class FamilyDto(
	val id: String,
	val name: String = "",
	val color: String? = null,
	val createdAt: String? = null,
)

@Serializable
data class FamilyDetailDto(
	val family: FamilyDto? = null,
	val members: List<RosterRowDto> = emptyList(),
	val currentUserRole: String = "member",
	val currentUserId: String = "",
	val activity: List<ActivityRowDto> = emptyList(),
	val moduleSwitches: Map<String, Boolean> = emptyMap(),
	val hiddenDashboardModules: List<String> = emptyList(),
	val activeInvite: DetailInviteDto? = null,
	val inviteCreatedBy: String? = null,
	val planUsage: PlanUsageDto = PlanUsageDto(),
)

@Serializable
data class ActivityRowDto(
	val kind: String = "completed",
	val title: String = "",
	val actorName: String = "",
	val targetName: String? = null,
	val at: String? = null,
)

@Serializable
data class DetailInviteDto(
	val code: String = "",
	val useCount: Int = 0,
	val maxUses: Int? = null,
	val expiresAt: String? = null,
)

@Serializable
data class PlanUsageDto(
	val tierName: String? = null,
	val aiUsed: Int = 0,
	val aiLimit: Int = 0,
	val familiesUsed: Int = 0,
	val familyLimit: Int = 0,
	val members: Int = 0,
	val memberLimit: Int = 0,
	val archivedRetentionDays: Int = 0,
	val exportImportEnabled: Boolean = false,
)

@Serializable
data class InviteCodesDto(
	val canManageInvites: Boolean = false,
	val codes: List<InviteCodeDto> = emptyList(),
)

@Serializable
data class InviteCodeDto(
	val code: String = "",
	val useCount: Int = 0,
	val maxUses: Int? = null,
	val expiresAt: String? = null,
	val createdBy: String? = null,
)

/** POST /api/family/invite: the minted code and its web join path. */
@Serializable
data class MintedInviteDto(
	val code: String = "",
	val expiresAt: String? = null,
	val inviteUrl: String = "",
)

@Serializable
data class FamilyTasksDto(
	val tasks: List<TaskDto> = emptyList(),
	val publicTasks: List<TaskDto> = emptyList(),
	val familyRoster: List<RosterRowDto> = emptyList(),
	val taskCategories: List<FamilyCategoryDto> = emptyList(),
)

/** The board's add-form suggestions (`{id,name}` only). */
@Serializable
data class FamilyCategoryDto(val id: String = "", val name: String = "")

@Serializable
data class EmailInviteLinkDto(val success: Boolean = true, val link: String = "")

@Serializable
data class ChildMemberDto(
	val success: Boolean = true,
	val user: ChildUserDto? = null,
)

@Serializable
data class ChildUserDto(
	val id: String = "",
	val firstName: String? = null,
	val lastName: String? = null,
	val email: String? = null,
)

/** A member-search hit; the server masks the email. */
@Serializable
data class MemberHitDto(
	val id: String = "",
	val firstName: String? = null,
	val lastName: String? = null,
	val email: String? = null,
)

@Serializable
data class MemberSearchDto(val users: List<MemberHitDto> = emptyList())
