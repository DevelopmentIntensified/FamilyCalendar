package com.familyplanz.app.ui.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.AccountMeDto
import com.familyplanz.app.data.AccountSettingsSource
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.ApiTokenDto
import com.familyplanz.app.data.CalendarSettingsDto
import com.familyplanz.app.data.ConsentRowDto
import com.familyplanz.app.data.FamiliesOverviewDto
import com.familyplanz.app.data.FamilyCardDto
import com.familyplanz.app.data.NotificationPreferencesDto
import com.familyplanz.app.data.SubscriptionDto
import com.familyplanz.app.data.VerseTranslationDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The green/red banner under the identity card (AC-AC-9). */
data class AccountBanner(val text: String, val success: Boolean = true)

/** The data export's progress and outcome banners (`AccountDangerSection.svelte:19,30,33`). */
const val EXPORT_PREPARING = "Preparing your data export\u2026"
const val EXPORT_DONE = "Data export downloaded."
const val EXPORT_FAILED = "Data export failed \u2014 please try again."

/**
 * Everything the Account screen shows (2.12): the identity card, the twelve
 * editable bands, the token list and the delete gate. One load fills them
 * from G1/G3/G14; each write reports the server's own message in [banner].
 */
data class AccountState(
	val loading: Boolean = true,
	val section: AccountSection = AccountSection.PROFILE,
	val me: AccountMeDto? = null,
	val settings: CalendarSettingsDto = CalendarSettingsDto(),
	val translations: List<VerseTranslationDto> = emptyList(),
	val consentTrail: List<ConsentRowDto> = emptyList(),
	val families: List<FamilyCardDto> = emptyList(),
	val notifications: NotificationPreferencesDto = NotificationPreferencesDto(),
	val subscription: SubscriptionDto? = null,
	val tokens: List<ApiTokenDto> = emptyList(),
	/** Profile drafts (AC-AC-3). */
	val firstName: String = "",
	val lastName: String = "",
	/** Email draft (AC-AC-9). */
	val emailDraft: String = "",
	/** Token name draft (AC-AC-11). */
	val tokenName: String = "",
	/** The plaintext minted once; null once dismissed. */
	val createdToken: String? = null,
	/** Danger Zone draft and its refusals (AC-AC-12). */
	val deleteConfirm: String = "",
	val deleting: Boolean = false,
	/** Set when the account was deleted: the entry returns to sign-in. */
	val deleted: Boolean = false,
	/** A data export is being fetched and written (#189). */
	val exporting: Boolean = false,
	val banner: AccountBanner? = null,
)

/**
 * The Account screen's ViewModel. Reads come from [source]; the "Your
 * families" list is read through [families] (the Family screens' own edge)
 * so the two screens never disagree.
 */
@Suppress("TooManyFunctions")
class AccountViewModel(
	private val source: AccountSettingsSource,
	/** The "Your families" list, read through the Family screens' own edge so the two never disagree. */
	private val families: suspend () -> ApiResult<FamiliesOverviewDto>,
) : ViewModel() {
	private val _state = MutableStateFlow(AccountState())
	val state: StateFlow<AccountState> = _state

	init {
		refresh()
	}

	fun refresh() {
		viewModelScope.launch {
			_state.value = _state.value.copy(loading = true)
			val me = (source.me() as? ApiResult.Ok)?.value
			val settings = (source.settings() as? ApiResult.Ok)?.value
			val notifications = (source.notificationPreferences() as? ApiResult.Ok)?.value
			val subscription = (source.subscription() as? ApiResult.Ok)?.value
			val tokens = (source.apiTokens() as? ApiResult.Ok)?.value ?: emptyList()
			val familyCards = (families() as? ApiResult.Ok)?.value?.families ?: emptyList()
			_state.value = _state.value.copy(
				loading = false,
				me = me,
				settings = settings?.settings ?: CalendarSettingsDto(),
				translations = settings?.verseTranslations ?: emptyList(),
				consentTrail = settings?.consentHistory ?: emptyList(),
				notifications = notifications ?: NotificationPreferencesDto(),
				subscription = subscription,
				tokens = tokens,
				families = familyCards,
				firstName = me?.firstName.orEmpty(),
				lastName = me?.lastName.orEmpty(),
				emailDraft = me?.email.orEmpty(),
			)
		}
	}

	/** AC-AC-2: the rail and the hash deep links both land here. */
	fun selectSection(section: AccountSection) {
		_state.value = _state.value.copy(section = section, banner = null, createdToken = null)
	}

	fun setFirstName(value: String) {
		_state.value = _state.value.copy(firstName = value)
	}

	fun setLastName(value: String) {
		_state.value = _state.value.copy(lastName = value)
	}

	fun setEmail(value: String) {
		_state.value = _state.value.copy(emailDraft = value)
	}

	/** AC-AC-3: saves both names; the identity card reads them straight back. */
	fun saveProfile() {
		val state = _state.value
		viewModelScope.launch {
			when (val result = source.updateProfile(state.firstName, state.lastName)) {
				is ApiResult.Ok -> {
					val user = result.value
					_state.value = state.copy(
						me = state.me?.copy(
							firstName = user?.firstName ?: state.firstName,
							lastName = user?.lastName ?: state.lastName,
						),
						banner = AccountBanner("Profile saved."),
					)
				}

				is ApiResult.Err -> _state.value = state.copy(banner = AccountBanner(result.error.message, success = false))
			}
		}
	}

	/** AC-AC-9: the server's verification message lands in the green banner. */
	fun saveEmail() {
		val state = _state.value
		viewModelScope.launch {
			when (val result = source.updateEmail(state.emailDraft)) {
				is ApiResult.Ok -> _state.value = state.copy(banner = AccountBanner(result.value))
				is ApiResult.Err -> _state.value = state.copy(banner = AccountBanner(result.error.message, success = false))
			}
		}
	}

	/** AC-AC-4..7: one patch per control, then the settings round-trip back. */
	fun patchSettings(patch: JsonObject, note: String? = null) {
		val state = _state.value
		viewModelScope.launch {
			when (val result = source.patchSettings(patch)) {
				is ApiResult.Ok -> _state.value = state.copy(
					settings = result.value.settings,
					consentTrail = result.value.consentHistory,
					banner = note?.let { AccountBanner(it) },
				)

				is ApiResult.Err -> _state.value = state.copy(banner = AccountBanner(result.error.message, success = false))
			}
		}
	}

	fun setWeekStart(value: String) = patchSettings(buildJsonObject { put("weekStart", value) })

	fun setDefaultView(value: String) = patchSettings(buildJsonObject { put("defaultView", value) })

	fun setTimeZone(value: String) = patchSettings(buildJsonObject { put("timeZone", value) })

	fun setColor(value: String) = patchSettings(buildJsonObject { put("color", value) })

	fun setSyncToFamily(value: Boolean) = patchSettings(buildJsonObject { put("syncEventsToFamilyCalendar", value) })

	fun setSmartCreation(value: Boolean) = patchSettings(buildJsonObject { put("autoParseEventDetails", value) })

	fun setDailyVerse(value: Boolean) = patchSettings(buildJsonObject { put("showDailyVerse", value) })

	fun setVerseTranslation(value: String) = patchSettings(buildJsonObject { put("verseTranslation", value) })

	/** AC-AC-7: flipping sponsorship on records consent; the trail gains a row. */
	fun setSponsorship(value: Boolean) =
		patchSettings(buildJsonObject { put("showAdsAsEvents", value) }, note = "Sponsorship setting saved.")

	/** AC-AC-6/CA-8: per-user dashboard modules; the hidden list is what the server stores. */
	fun toggleDashboardModule(module: String, enabled: Boolean) {
		val hidden = _state.value.settings.hiddenDashboardModules
		val next = if (enabled) hidden - module else hidden + module
		val state = _state.value
		viewModelScope.launch {
			when (val result = source.saveDashboardModules(next)) {
				is ApiResult.Ok -> _state.value = state.copy(
					settings = state.settings.copy(hiddenDashboardModules = result.value),
					banner = AccountBanner("Dashboard modules saved."),
				)

				is ApiResult.Err -> _state.value = state.copy(banner = AccountBanner(result.error.message, success = false))
			}
		}
	}

	fun setNotificationPreference(id: String, value: Boolean) {
		val state = _state.value
		viewModelScope.launch {
			when (val result = source.setNotificationPreference(id, value)) {
				is ApiResult.Ok -> _state.value = state.copy(
					notifications = state.notifications.copy(preferences = state.notifications.preferences + (id to value)),
					banner = AccountBanner(result.value),
				)

				is ApiResult.Err -> _state.value = state.copy(banner = AccountBanner(result.error.message, success = false))
			}
		}
	}

	/** AC-AC-10: other sessions go, this device's token stays. */
	fun revokeOtherSessions() {
		val state = _state.value
		viewModelScope.launch {
			when (val result = source.revokeOtherSessions()) {
				is ApiResult.Ok -> _state.value = state.copy(
					banner = AccountBanner(
						if (result.value == 1) "Logged out 1 other session." else "Logged out ${result.value} other sessions.",
					),
				)

				is ApiResult.Err -> _state.value = state.copy(banner = AccountBanner(result.error.message, success = false))
			}
		}
	}

	fun setTokenName(value: String) {
		_state.value = _state.value.copy(tokenName = value)
	}

	/** AC-AC-11: the plaintext shows once, then only the record's name stays. */
	fun createToken() {
		val state = _state.value
		if (state.tokenName.isBlank()) {
			_state.value = state.copy(banner = AccountBanner("Give the token a name.", success = false))
			return
		}
		viewModelScope.launch {
			when (val result = source.createApiToken(state.tokenName)) {
				is ApiResult.Ok -> _state.value = state.copy(
					tokens = state.tokens + result.value.record,
					createdToken = result.value.token,
					tokenName = "",
					banner = AccountBanner("Token created - copy it now, it is shown once."),
				)

				is ApiResult.Err -> _state.value = state.copy(banner = AccountBanner(result.error.message, success = false))
			}
		}
	}

	fun revokeToken(id: String) {
		val state = _state.value
		viewModelScope.launch {
			when (val result = source.revokeApiToken(id)) {
				is ApiResult.Ok -> _state.value = state.copy(
					tokens = state.tokens.filterNot { it.id == id },
					banner = AccountBanner("Token revoked."),
				)

				is ApiResult.Err -> _state.value = state.copy(banner = AccountBanner(result.error.message, success = false))
			}
		}
	}

	fun dismissCreatedToken() {
		_state.value = _state.value.copy(createdToken = null)
	}

	fun setDeleteConfirm(value: String) {
		_state.value = _state.value.copy(deleteConfirm = value)
	}

	/** AC-AC-12: the typed id must match exactly; the server says so otherwise. */
	fun deleteAccount() {
		val state = _state.value
		val meId = state.me?.id.orEmpty()
		if (state.deleteConfirm.trim().isEmpty() || state.deleteConfirm.trim() != meId) {
			_state.value = state.copy(banner = AccountBanner("Type your user id exactly to confirm.", success = false))
			return
		}
		viewModelScope.launch {
			_state.value = state.copy(deleting = true)
			when (val result = source.deleteAccount(state.deleteConfirm)) {
				is ApiResult.Ok -> _state.value = state.copy(deleting = false, deleted = true)
				is ApiResult.Err -> _state.value = state.copy(
					deleting = false,
					banner = AccountBanner(result.error.message, success = false),
				)
			}
		}
	}

	/**
	 * #189: fetch the caller's data and hand it to [write] (the file the user
	 * picked). [write] gets null when the fetch failed, so it can remove the
	 * empty file; it answers whether the file was saved. The banner names each step.
	 */
	fun exportData(write: suspend (json: String?) -> Boolean) {
		if (_state.value.exporting) return
		_state.value = _state.value.copy(exporting = true, banner = AccountBanner(EXPORT_PREPARING))
		viewModelScope.launch {
			val json = (source.exportData() as? ApiResult.Ok)?.value
			val saved = write(json)
			_state.value = _state.value.copy(
				exporting = false,
				banner = AccountBanner(if (saved) EXPORT_DONE else EXPORT_FAILED, success = saved),
			)
		}
	}

	fun consumeBanner() {
		_state.value = _state.value.copy(banner = null)
	}
}

/** AC-AC-13: the identity card's email line, or the guest's call to claim. */
fun identityEmailLine(me: AccountMeDto?): String = when {
	me == null -> NO_EMAIL_YET
	me.isAnonymous -> NO_EMAIL_YET
	me.email.isNullOrBlank() -> NO_EMAIL_YET
	else -> me.email
}

/** The claim path a guest's identity card links to (G13). */
const val CLAIM_PATH = "/claim"
