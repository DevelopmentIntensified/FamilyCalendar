@file:Suppress("MatchingDeclarationName")
package com.familyplanz.app.ui.account

/**
 * The account rail's rows, in `accountSections.ts:15-26` order, plus the
 * Report a Bug row the web keeps below the sections (AC-AC-1). [hash] is the
 * fragment the web addresses the section with (`/account#calendar`).
 */
@Suppress("MatchingDeclarationName")
enum class AccountSection(val label: String, val hash: String) {
	PROFILE("Profile", "profile"),
	FAMILIES("Your families", "families"),
	NOTIFICATIONS("Notifications", "notifications"),
	CALENDAR("Calendar", "calendar"),
	DASHBOARD("Dashboard", "dashboard"),
	PLAN("Plan & usage", "plan"),
	EMAIL("Email", "email"),
	SECURITY("Security", "security"),
	API_TOKENS("API Tokens", "api"),
	DANGER_ZONE("Danger Zone", "danger"),
	REPORT_BUG("Report a Bug", "bug"),
	;

	companion object {
		/** AC-AC-2: `account#calendar` and `#api` open those sections; anything else starts at Profile. */
		fun fromHash(arg: String?): AccountSection {
			val hash = arg?.substringAfterLast('#')?.trim()?.lowercase() ?: return PROFILE
			return entries.firstOrNull { it.hash == hash } ?: PROFILE
		}
	}
}

/** The rail's header text. */
const val SETTINGS_RAIL_TITLE = "SETTINGS"

/** AC-AC-13: an anonymous account's identity line. */
const val NO_EMAIL_YET = "No email yet \u00B7 Save your calendar"

/** The identity card's claim link. */
const val CLAIM_CTA = "Save your calendar"

/** AC-AC-10: the Security section's copy. */
const val LOGOUT_ALL_COPY = "Log out from all devices except the current one. This will invalidate all other sessions."

/** AC-AC-12: the Danger Zone confirmation label. */
const val DELETE_CONFIRM_LABEL = "Enter your user ID to confirm"

/** AC-AC-7: the empty sponsorship trail line. */
const val NO_CONSENT_COPY = "No ad consent recorded yet \u2014 the trail begins when the setting is first changed."

/** AC-AC-3: the header copy of the Account screen. */
const val ACCOUNT_SUBTITLE = "Manage your account settings and preferences"

/** The "‹ Back to Calendar" jump. */
const val BACK_TO_CALENDAR = "\u2039 Back to Calendar"

/** AC-AC-11: the token-name placeholder the web uses. */
const val TOKEN_NAME_PLACEHOLDER = "Token name (e.g. TaskFocus laptop)"

/** AC-AC-4: the week-start choices. */
val WEEK_START_OPTIONS = listOf("sunday" to "Sunday", "monday" to "Monday")

/** AC-AC-5: the default-view choices, `dashboard` = Day Dashboard. */
val DEFAULT_VIEW_OPTIONS = listOf(
	"dayView" to "Day",
	"weekView" to "Week",
	"monthView" to "Month",
	"listView" to "List",
	"dashboard" to "Dashboard (Day Dashboard)",
)

/** AC-AC-6: the verse translations the settings offer (ids only; labels come from the server). */
val FALLBACK_TRANSLATIONS = listOf("esv" to "ESV", "kjv" to "KJV", "niv" to "NIV")
