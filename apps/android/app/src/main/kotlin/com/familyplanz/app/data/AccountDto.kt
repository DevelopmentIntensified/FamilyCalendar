package com.familyplanz.app.data

import kotlinx.serialization.Serializable

/**
 * Read models of the `/api/me` routes (docs/guides/task-api-spec.md, "Account (G14)"
 * and "#292 G1 GET /api/me"): the identity card, settings, notifications,
 * tokens, subscription and the verify banner flags.
 */
@Serializable
data class AccountMeDto(
	val id: String,
	val firstName: String? = null,
	val lastName: String? = null,
	/** Null for a guest: the server masks the placeholder address. */
	val email: String? = null,
	val emailVerified: Boolean = false,
	val isAnonymous: Boolean = false,
	val roles: List<String> = emptyList(),
	val lastActiveAt: String? = null,
	val familyId: String? = null,
)

@Serializable
data class AccountSettingsDto(
	val settings: CalendarSettingsDto = CalendarSettingsDto(),
	val verseTranslations: List<VerseTranslationDto> = emptyList(),
	val consentHistory: List<ConsentRowDto> = emptyList(),
)

@Serializable
data class CalendarSettingsDto(
	val weekStart: String = "sunday",
	val timeZone: String = "UTC",
	val color: String = "#3b82f6",
	val defaultView: String = "dayView",
	val defaultCalendarId: String? = null,
	val syncEventsToFamilyCalendar: Boolean = false,
	val autoParseEventDetails: Boolean = true,
	val showDailyVerse: Boolean = false,
	val showAdsAsEvents: Boolean = false,
	val verseTranslation: String = "esv",
	val hiddenDashboardModules: List<String> = emptyList(),
)

@Serializable
data class VerseTranslationDto(val id: String = "", val label: String = "", val attribution: String? = null)

@Serializable
data class ConsentRowDto(val decision: String = "", val recordedAt: String = "")

@Serializable
data class AccountUserDto(
	val id: String = "",
	val firstName: String? = null,
	val lastName: String? = null,
	val email: String? = null,
)

@Serializable
data class ProfileResultDto(val success: Boolean = true, val user: AccountUserDto? = null)

@Serializable
data class MessageResultDto(val success: Boolean = true, val message: String = "")

@Serializable
data class RevokedSessionsDto(val success: Boolean = true, val revoked: Int = 0)

@Serializable
data class ApiTokenDto(
	val id: String = "",
	val name: String = "",
	val createdAt: String? = null,
	val lastUsedAt: String? = null,
)

@Serializable
data class ApiTokenListDto(val tokens: List<ApiTokenDto> = emptyList())

/** `POST /api/me/api-tokens` → 201; [token] is the only plaintext ever shown. */
@Serializable
data class CreatedTokenDto(val token: String = "", val record: ApiTokenDto = ApiTokenDto())

@Serializable
data class ModulesResultDto(
	val success: Boolean = true,
	val message: String = "",
	val hidden: List<String> = emptyList(),
)

@Serializable
data class NotificationPreferencesDto(
	val preferences: Map<String, Boolean> = emptyMap(),
	val options: List<NotificationOptionDto> = emptyList(),
)

@Serializable
data class NotificationOptionDto(
	val id: String = "",
	val label: String = "",
	val hint: String? = null,
	val default: Boolean = true,
)

@Serializable
data class SubscriptionDto(
	val subscription: SubscriptionStatusDto = SubscriptionStatusDto(),
	val planLimits: PlanLimitsDto = PlanLimitsDto(),
	val aiUsage: AiUsageDto = AiUsageDto(),
)

@Serializable
data class SubscriptionStatusDto(val tier: TierDto? = null)

@Serializable
data class TierDto(val id: String = "", val name: String? = null, val displayName: String? = null)

@Serializable
data class PlanLimitsDto(
	val familyLimit: Int = 1,
	val memberLimit: Int = 6,
	val aiEventCreationsPerMonth: Int = 10,
	val archivedRetentionDays: Int = 90,
	val exportImportEnabled: Boolean = true,
)

@Serializable
data class AiUsageDto(val used: Int = 0, val limit: Int = 0, val remaining: Int = 0)

/** Request bodies; nulls are omitted (ApiFactory.json keeps explicitNulls off). */
@Serializable
data class ProfileBody(val firstName: String, val lastName: String)

@Serializable
data class EmailBody(val email: String)

@Serializable
data class TokenNameBody(val name: String)

@Serializable
data class DeleteAccountBody(val confirmation: String)

@Serializable
data class HiddenModulesBody(val hidden: List<String>)

@Serializable
data class PreferenceValueBody(val value: Boolean)

@Serializable
data class VerifyCodeBody(val code: String)
