package com.familyplanz.app.ui.account

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.familyplanz.app.AppModules
import com.familyplanz.app.data.AccountMeDto
import com.familyplanz.app.data.AccountSettingsDto
import com.familyplanz.app.data.AccountSettingsSource
import com.familyplanz.app.data.AccountUserDto
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.ApiTokenDto
import com.familyplanz.app.data.FamiliesOverviewDto
import com.familyplanz.app.data.NotificationPreferencesDto
import com.familyplanz.app.data.SubscriptionDto
import com.familyplanz.app.data.UnavailableAccountSettingsSource
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.Shell
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #310: the Account route over its ViewModel - the rail's eleven sections,
 * the profile round-trip, the `/account#calendar` / `#api` links and the
 * delete gate's sign-out.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h3200dp")
class AccountRouteTest {
	@get:Rule
	val rule = createComposeRule()

	private class FakeAccountSource : AccountSettingsSource by UnavailableAccountSettingsSource {
		var savedProfile: Pair<String, String>? = null
		var deleted = 0

		override suspend fun me() = ApiResult.Ok(
			AccountMeDto(id = "u1", firstName = "Dad", lastName = "Smith", email = "dad@example.com"),
		)

		override suspend fun settings() = ApiResult.Ok(AccountSettingsDto())

		override suspend fun notificationPreferences() = ApiResult.Ok(NotificationPreferencesDto())

		override suspend fun subscription() = ApiResult.Ok(SubscriptionDto())

		override suspend fun apiTokens() = ApiResult.Ok(emptyList<ApiTokenDto>())

		override suspend fun updateProfile(firstName: String, lastName: String): ApiResult<AccountUserDto?> {
			savedProfile = firstName to lastName
			return ApiResult.Ok(AccountUserDto(id = "u1", firstName = firstName, lastName = lastName))
		}

		override suspend fun deleteAccount(confirmation: String): ApiResult<Unit> {
			deleted++
			return ApiResult.Ok(Unit)
		}
	}

	private class RecordingShell : Shell {
		var signedOut = 0
		override val guestNoteVisible: StateFlow<Boolean> = MutableStateFlow(false)

		override fun showSnack(text: String) = Unit

		override fun endSession(note: String) = Unit

		override fun signOut() {
			signedOut++
		}

		override fun dismissGuestNote() = Unit
	}

	private val source = FakeAccountSource()
	private val shell = RecordingShell()

	private fun show(nav: AppNav = AppNav(AppRoute.ACCOUNT)) {
		val vm = AccountViewModel(source) { ApiResult.Ok(FamiliesOverviewDto()) }
		rule.setContent {
			CompositionLocalProvider(LocalShell provides shell) {
				FamilyPlanzTheme { AccountRoute(vm, nav, baseUrl = "https://example.test/") }
			}
		}
		rule.waitUntil(5_000) { !vm.state.value.loading }
	}

	/** A rail label can also be a card title once its section is open: the rail comes first on the page. */
	private fun openSection(label: String) {
		rule.onAllNodesWithText(label)[0].performScrollTo().performClick()
	}

	@Test
	fun every_section_opens_from_the_rail() {
		show()

		val sections = listOf(
			"Profile" to "Save profile",
			"Your families" to "Create a family",
			"Notifications" to "See the alerts",
			"Calendar" to "Week start",
			"Dashboard" to "Kids' Schedule",
			"Plan & usage" to "See Plans & Pricing",
			"Email" to "Update email",
			"Security" to "Log out all devices",
			"API Tokens" to "Create token",
			"Danger Zone" to "Delete Account",
			"Report a Bug" to "Open the bug form",
		)
		sections.forEach { (label, marker) ->
			openSection(label)
			rule.onNodeWithText(marker).performScrollTo().assertExists()
		}
	}

	@Test
	fun a_profile_save_round_trips() {
		show()

		rule.onNodeWithText("First Name").performScrollTo().performTextReplacement("Dadda")
		rule.onNodeWithText("Save profile").performScrollTo().performClick()

		rule.waitUntil(5_000) { source.savedProfile == ("Dadda" to "Smith") }
		rule.onNodeWithText("Profile saved.").assertExists()
		rule.onNodeWithText("Dadda Smith").assertExists()
	}

	@Test
	fun a_calendar_link_opens_that_section() {
		val nav = AppNav(AppRoute.CALENDAR, AppModules.DEEP_LINKS)
		assertTrue(nav.openLink("/account#calendar"))
		assertEquals(AppRoute.ACCOUNT, nav.route)

		show(nav)
		rule.onNodeWithText("Week start").performScrollTo().assertExists()
	}

	@Test
	fun an_api_link_opens_that_section() {
		val nav = AppNav(AppRoute.CALENDAR, AppModules.DEEP_LINKS)
		assertTrue(nav.openLink("https://www.familyplanz.com/account#api"))
		assertEquals(AppRoute.ACCOUNT, nav.route)

		show(nav)
		rule.onNodeWithText("Create token").performScrollTo().assertExists()
	}

	@Test
	fun deleting_the_account_signs_out() {
		show()

		openSection("Danger Zone")
		rule.onNodeWithText(DELETE_CONFIRM_LABEL).performScrollTo().performTextReplacement("u1")
		rule.onNodeWithText("Delete Account").performScrollTo().performClick()

		rule.waitUntil(5_000) { shell.signedOut == 1 }
		assertEquals(1, source.deleted)
	}
}
