package com.familyplanz.app.ui.gesture

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.BANNER_STACK_TAG
import com.familyplanz.app.ui.shell.GUEST_BANNER_TAG
import com.familyplanz.app.ui.shell.GuestCopy
import com.familyplanz.app.ui.shell.NetworkStatus
import com.familyplanz.app.ui.shell.OFFLINE_BANNER_TAG
import com.familyplanz.app.ui.shell.OFFLINE_TEXT
import com.familyplanz.app.ui.shell.MutablePendingWrites
import com.familyplanz.app.ui.shell.PendingWrites
import com.familyplanz.app.ui.shell.ShellMeDto
import com.familyplanz.app.ui.shell.TOAST_DISMISS_LABEL
import com.familyplanz.app.ui.shell.TOASTER_TAG
import com.familyplanz.app.ui.shell.ToastQueue
import com.familyplanz.app.ui.shell.VERIFY_BANNER_TAG
import com.familyplanz.app.ui.shell.VerifyCopy
import com.familyplanz.app.ui.shell.FpToaster
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.time.Instant

/** A settable [NetworkStatus] so a test can go into airplane mode (AC-SH-15). */
private class FakeNetwork(online: Boolean = true) : NetworkStatus {
	private val state = MutableStateFlow(online)
	override val online: StateFlow<Boolean> = state

	fun set(value: Boolean) {
		state.value = value
	}
}

/**
 * #292 §2.1 banners and toasts: offline (AC-SH-15, -16), guest (AC-SH-17,
 * -18), verify (AC-SH-19), where banners may render (AC-SH-20) and the
 * toaster (AC-SH-12..-14).
 */
@RunWith(RobolectricTestRunner::class)
class ShellBannerUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val shell = FakeShellSource()
	private val network = FakeNetwork()
	private val pending = MutablePendingWrites()
	private val host = HostHarness(rule, edges = ShellEdges(shell = shell, network = network, pendingWrites = pending))

	private fun entryShown(route: AppRoute) {
		host.waitFor { rule.onAllNodesWithTag("entry-${route.name.lowercase()}").fetchSemanticsNodes().isNotEmpty() }
	}

	@Test
	fun airplane_mode_shows_the_offline_banner_with_the_verbatim_sentence() {
		network.set(false)
		host.launch()
		entryShown(AppRoute.TASKS)

		host.waitForText(OFFLINE_TEXT)
		rule.onNodeWithTag(OFFLINE_BANNER_TAG).assertExists()
	}

	@Test
	fun two_queued_writes_read_two_changes_waiting_and_then_synced() {
		network.set(false)
		host.launch()
		entryShown(AppRoute.TASKS)
		host.waitForText(OFFLINE_TEXT)

		pending.set(2)
		host.waitForText("2 changes waiting to sync.")

		network.set(true)
		pending.set(0)
		host.waitForText("Synced 2 changes.")
	}

	@Test
	fun a_guest_account_sees_the_amber_banner_with_the_claim_link() {
		shell.meResult = ApiResult.Ok(ShellMeDto(isAnonymous = true, lastActiveAt = Instant.now().toString()))
		host.launch()
		entryShown(AppRoute.TASKS)

		host.waitForText(GuestCopy.NORMAL)
		rule.onNodeWithTag(GUEST_BANNER_TAG).assertExists()
		rule.onNodeWithText(GuestCopy.NORMAL).assertExists()
		rule.onNodeWithText(GuestCopy.NORMAL_LINK).assertExists()
		rule.onNodeWithText(GuestCopy.NORMAL_HINT).assertExists()
	}

	@Test
	fun the_claim_link_opens_the_account_screen() {
		shell.meResult = ApiResult.Ok(ShellMeDto(isAnonymous = true, lastActiveAt = Instant.now().toString()))
		host.launch()
		entryShown(AppRoute.TASKS)
		host.waitForText(GuestCopy.NORMAL_LINK)

		rule.onNodeWithText(GuestCopy.NORMAL_LINK).performClick()

		entryShown(AppRoute.ACCOUNT)
	}

	@Test
	fun eighty_days_idle_shows_the_red_variant_with_ten_days_left() {
		shell.meResult = ApiResult.Ok(
			ShellMeDto(isAnonymous = true, lastActiveAt = Instant.now().minusSeconds(80 * 86_400L).toString()),
		)
		host.launch()
		entryShown(AppRoute.TASKS)

		host.waitForText(GuestCopy.URGENT)
		rule.onNodeWithText("10 days left.").assertExists()
		rule.onNodeWithText(GuestCopy.URGENT_LINK).assertExists()
	}

	@Test
	fun an_unverified_user_gets_the_verify_banner_and_a_wrong_code_shows_the_error() {
		shell.meResult = ApiResult.Ok(ShellMeDto(emailVerified = false, isAnonymous = false))
		shell.verifyResult = ApiResult.Err(ApiError.BadRequest("That code isn't right."))
		host.launch()
		entryShown(AppRoute.TASKS)

		host.waitForText(VerifyCopy.PROMPT)
		rule.onNodeWithTag(VERIFY_BANNER_TAG).assertExists()
		rule.onNodeWithTag("verify-code").performTextInput("000000")
		rule.onNodeWithText(VerifyCopy.VERIFY).performClick()

		host.waitForText("That code isn't right.")
		assertEquals(listOf("000000"), shell.verifyCodes)
	}

	@Test
	fun a_verified_user_gets_no_account_banner() {
		host.launch()
		entryShown(AppRoute.TASKS)

		rule.onNodeWithTag(GUEST_BANNER_TAG).assertDoesNotExist()
		rule.onNodeWithTag(VERIFY_BANNER_TAG).assertDoesNotExist()
	}

	@Test
	fun banners_do_not_render_on_the_family_tab_or_the_account_screen() {
		shell.meResult = ApiResult.Ok(ShellMeDto(isAnonymous = true, lastActiveAt = Instant.now().toString()))
		host.launch()
		entryShown(AppRoute.TASKS)
		host.waitForText(GuestCopy.NORMAL)

		rule.onNodeWithText(PhoneTab.FAMILY.label).performClick()
		entryShown(AppRoute.FAMILY)
		rule.onNodeWithTag(BANNER_STACK_TAG).assertDoesNotExist()

		rule.onNodeWithContentDescription("Open menu").performClick()
		rule.onNodeWithText("Settings").performClick()
		entryShown(AppRoute.ACCOUNT)
		rule.onNodeWithTag(BANNER_STACK_TAG).assertDoesNotExist()
	}

	@Test
	fun a_toast_sits_in_the_toaster_with_a_dismiss_control() {
		val queue = ToastQueue()
		rule.setContent {
			FamilyPlanzTheme { FpToaster(queue, androidx.compose.ui.Modifier) }
		}
		queue.push("Task deleted", actionLabel = "Undo") {}

		rule.waitUntil(5_000) {
			rule.onAllNodesWithTag(TOASTER_TAG).fetchSemanticsNodes().isNotEmpty()
		}
		rule.onNodeWithText("Task deleted").assertExists()
		rule.onNodeWithContentDescription(TOAST_DISMISS_LABEL).assertExists()
	}

	@Test
	fun four_toasts_stack_and_the_fifth_evicts_the_oldest() {
		val queue = ToastQueue()
		rule.setContent {
			FamilyPlanzTheme { FpToaster(queue, androidx.compose.ui.Modifier) }
		}
		(1..5).forEach { n ->
			rule.runOnIdle { queue.push("toast $n") }
		}

		rule.waitUntil(5_000) {
			rule.onAllNodesWithTag(TOASTER_TAG).fetchSemanticsNodes().isNotEmpty()
		}
		rule.onNodeWithText("toast 1").assertDoesNotExist()
		rule.onNodeWithText("toast 5").assertExists()
	}

	@Test
	fun tapping_a_toast_action_runs_it_and_dismisses_the_toast() {
		val queue = ToastQueue()
		var undone = 0
		rule.setContent {
			FamilyPlanzTheme { FpToaster(queue, androidx.compose.ui.Modifier) }
		}
		rule.runOnIdle { queue.push("Task deleted", actionLabel = "Undo") { undone++ } }

		rule.waitUntil(5_000) { rule.onAllNodesWithText("Undo").fetchSemanticsNodes().isNotEmpty() }
		rule.onNodeWithText("Undo").performClick()

		rule.waitUntil(5_000) { undone == 1 && rule.onAllNodesWithText("Task deleted").fetchSemanticsNodes().isEmpty() }
	}
}
