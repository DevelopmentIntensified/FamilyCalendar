package com.familyplanz.app.ui.shell

import com.familyplanz.app.data.ApiError
import androidx.compose.ui.graphics.toArgb
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.gesture.FakeShellSource
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.theme.FpMotion
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * #292 §2.1 shell behaviour that does not need a rendered frame: the toast
 * queue, the offline banner state machine, the account-banner precedence,
 * the verify form and the tab/IME predicates. The composed versions live in
 * `ui/gesture/ShellChromeUiTest.kt`.
 */
class ShellChromeTest {
	private val now = Instant.parse("2026-11-04T12:00:00Z")

	// ---- toasts (AC-SH-13, AC-SH-14) ----

	@Test
	fun a_fifth_toast_evicts_the_oldest_and_four_stay() {
		val queue = ToastQueue()
		(1..5).forEach { queue.push("toast $it") }

		val messages = queue.toasts.value.map { it.message }
		assertEquals(listOf("toast 2", "toast 3", "toast 4", "toast 5"), messages)
		assertEquals(FpMotion.TOAST_STACK, messages.size)
	}

	@Test
	fun a_toast_action_runs_and_dismisses_itself() {
		val queue = ToastQueue()
		val ran = mutableListOf<String>()
		val undo = queue.push("Task deleted", actionLabel = "Undo") { ran += "undo" }
		queue.push("another")

		queue.runAction(undo)

		assertEquals(listOf("undo"), ran)
		assertEquals(listOf("another"), queue.toasts.value.map { it.message })
	}

	@Test
	fun dismissing_a_toast_removes_only_that_one() {
		val queue = ToastQueue()
		val first = queue.push("first")
		queue.push("second")

		queue.dismiss(first)

		assertEquals(listOf("second"), queue.toasts.value.map { it.message })
	}

	// ---- offline banner (AC-SH-15, AC-SH-16) ----

	@Test
	fun offline_shows_the_verbatim_sentence_and_pushes_content() {
		val state = OfflineBannerState().onOnline(false)

		assertTrue(state.visible)
		assertEquals(
			"You're offline — showing your recent events and tasks (this month, last month, next month). " +
				"Months or tasks you haven't visited recently aren't available offline. " +
				"Changes you make now will sync automatically when you're back online.",
			OFFLINE_TEXT,
		)
	}

	@Test
	fun two_queued_writes_read_two_changes_waiting_to_sync() {
		val state = OfflineBannerState().onOnline(false).onPending(2).onOnline(true)

		assertEquals("2 changes waiting to sync.", pendingText(state.pending))
		assertNull(state.synced)
	}

	@Test
	fun a_flush_announces_synced_n_changes_and_then_clears() {
		val offline = OfflineBannerState().onOnline(false).onPending(2)
		val synced = offline.onOnline(true).onPending(0)

		assertEquals("Synced 2 changes.", syncedText(synced.synced ?: 0))
		assertFalse(synced.syncedShown().visible)
	}

	@Test
	fun one_change_reads_change_not_changes() {
		assertEquals("1 change waiting to sync.", pendingText(1))
		assertEquals("Synced 1 change.", syncedText(1))
	}

	// ---- account banner (AC-SH-17, AC-SH-18, AC-SH-19) ----

	@Test
	fun an_anonymous_account_sees_the_guest_banner() {
		assertEquals(AccountBanner.Guest(90), accountBanner(ShellMeDto(isAnonymous = true, lastActiveAt = now.toString()), now, false))
	}

	@Test
	fun eighty_days_idle_leaves_ten_days_and_turns_the_banner_red() {
		val banner = accountBanner(
			ShellMeDto(isAnonymous = true, lastActiveAt = "2026-08-16T12:00:00Z"),
			now,
			false,
		) as AccountBanner.Guest

		assertEquals(10, banner.daysLeft)
		assertTrue(banner.urgent)
		assertEquals("10 days left.", GuestCopy.daysLeft(banner.daysLeft))
	}

	@Test
	fun a_guest_past_the_window_never_shows_negative_days() {
		assertEquals(0, guestDaysLeft("2026-01-01T00:00:00Z", now))
		assertEquals(90, guestDaysLeft(null, now))
	}

	@Test
	fun an_unverified_registered_user_sees_the_verify_banner_until_dismissed() {
		val me = ShellMeDto(emailVerified = false, isAnonymous = false)

		assertEquals(AccountBanner.Verify, accountBanner(me, now, false))
		assertNull(accountBanner(me, now, verifyDismissed = true))
	}

	@Test
	fun a_verified_registered_user_sees_no_banner() {
		assertNull(accountBanner(ShellMeDto(emailVerified = true, isAnonymous = false), now, false))
		assertNull(accountBanner(null, now, false))
	}

	// ---- verify form (AC-SH-19) ----

	private fun verifyChrome(source: FakeShellSource, onVerified: () -> Unit = {}): VerifyChrome =
		VerifyChrome(source, CoroutineScope(Dispatchers.Unconfined), onVerified)

	@Test
	fun a_wrong_code_shows_the_server_error_text_under_the_form() {
		val source = FakeShellSource().apply { verifyResult = ApiResult.Err(ApiError.BadRequest("That code isn't right.")) }
		val chrome = verifyChrome(source)

		chrome.setCode("000000")
		chrome.submit()

		assertEquals(listOf("000000"), source.verifyCodes)
		assertEquals("That code isn't right.", chrome.form.value.error)
		assertFalse(chrome.form.value.busy)
	}

	@Test
	fun a_correct_code_clears_the_form_and_reports_success() {
		val source = FakeShellSource()
		var verified = 0
		val chrome = verifyChrome(source) { verified++ }

		chrome.setCode("123456")
		chrome.submit()

		assertEquals(1, verified)
		assertEquals(VerifyForm(), chrome.form.value)
	}

	@Test
	fun a_network_failure_uses_the_web_copy() {
		val source = FakeShellSource().apply { verifyResult = ApiResult.Err(ApiError.Network("timeout")) }
		val chrome = verifyChrome(source)

		chrome.setCode("123456")
		chrome.submit()

		assertEquals(VerifyCopy.VERIFY_NETWORK, chrome.form.value.error)
	}

	@Test
	fun an_empty_code_is_not_submitted() {
		val source = FakeShellSource()
		val chrome = verifyChrome(source)

		chrome.submit()
		chrome.setCode("   ")
		chrome.submit()

		assertTrue(source.verifyCodes.isEmpty())
	}

	@Test
	fun resend_flags_the_sent_again_pill_which_the_banner_clears() {
		val source = FakeShellSource()
		val chrome = verifyChrome(source)

		chrome.resend()
		assertEquals(1, source.resends)
		assertTrue(chrome.form.value.resent)

		chrome.clearResent()
		assertFalse(chrome.form.value.resent)
	}

	@Test
	fun dismiss_hides_the_verify_banner() {
		val chrome = verifyChrome(FakeShellSource())

		chrome.dismiss()

		assertTrue(chrome.form.value.dismissed)
	}

	// ---- tab bar predicates (AC-SH-2, AC-SH-5) ----

	@Test
	fun the_selected_tab_is_a_primary_pill_with_a_primary_label_and_the_rest_are_slate() {
		val on = tabTone(selected = true)
		val off = tabTone(selected = false)

		assertEquals(0xFFFEF7F0.toInt(), on.pill.container.toArgb())
		assertEquals(0xFFDD5822.toInt(), on.pill.content.toArgb())
		assertEquals(0xFFDD5822.toInt(), on.label.toArgb())
		assertEquals(0x00000000, off.pill.container.toArgb())
		assertEquals(0xFF94A3B8.toInt(), off.pill.content.toArgb())
		assertEquals(0xFF64748B.toInt(), off.label.toArgb())
	}

	@Test
	fun the_alerts_tab_announces_its_unread_count() {
		assertEquals("Alerts", tabLabel(PhoneTab.ALERTS, unread = 0))
		assertEquals("Alerts (3 unread)", tabLabel(PhoneTab.ALERTS, unread = 3))
		assertEquals("Groceries", tabLabel(PhoneTab.GROCERIES, unread = 7))
	}

	@Test
	fun the_tab_bar_hides_only_when_the_keyboard_covers_more_than_150_dp() {
		assertFalse(navHiddenByKeyboard(0f))
		assertFalse(navHiddenByKeyboard(KEYBOARD_THRESHOLD_DP.toFloat()))
		assertTrue(navHiddenByKeyboard(KEYBOARD_THRESHOLD_DP + 1f))
	}

	// ---- badge (AC-SH-3) ----

	@Test
	fun the_badge_reads_the_count_and_caps_at_99_plus() {
		assertEquals("3", badgeText(3))
		assertEquals("99", badgeText(99))
		assertEquals("99+", badgeText(120))
	}

	@Test
	fun the_bell_names_its_unread_count() {
		assertEquals("Notifications", bellLabel(0))
		assertEquals("Notifications (3 unread)", bellLabel(3))
	}

	// ---- menu (AC-SH-10) ----

	@Test
	fun the_active_menu_row_is_primary_100_on_primary_700() {
		val on = menuRowTone(active = true)
		val off = menuRowTone(active = false)

		assertEquals(0xFFFDEDE0.toInt(), on.container.toArgb())
		assertEquals(0xFFB8441C.toInt(), on.content.toArgb())
		assertEquals(0x00000000, off.container.toArgb())
		assertEquals(0xFF475569.toInt(), off.content.toArgb())
	}

	// ---- page canvas (AC-SH-21) ----

	@Test
	fun calendar_dashboard_groceries_and_alerts_paint_white_and_the_rest_slate() {
		val colors = com.familyplanz.app.ui.theme.FpColors()

		listOf(AppRoute.CALENDAR, AppRoute.DASHBOARD, AppRoute.GROCERIES, AppRoute.ALERTS).forEach { route ->
			assertEquals(0xFFFFFFFF.toInt(), com.familyplanz.app.ui.canvasFor(route, colors).toArgb())
		}
		listOf(AppRoute.TASKS, AppRoute.FAMILY, AppRoute.ACCOUNT, AppRoute.FORGOT_PASSWORD).forEach { route ->
			assertEquals(0xFFF8FAFC.toInt(), com.familyplanz.app.ui.canvasFor(route, colors).toArgb())
		}
	}

	@Test
	fun the_banner_stack_covers_the_five_calendar_group_tabs_and_nothing_else() {
		assertEquals(
			setOf(AppRoute.CALENDAR, AppRoute.DASHBOARD, AppRoute.TASKS, AppRoute.GROCERIES, AppRoute.ALERTS),
			BANNER_ROUTES,
		)
	}
}
