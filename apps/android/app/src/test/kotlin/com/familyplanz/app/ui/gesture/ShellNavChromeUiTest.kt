package com.familyplanz.app.ui.gesture

import com.familyplanz.app.data.ApiResult
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.LOGOUT
import com.familyplanz.app.ui.shell.MENU_ADMIN_ROWS
import com.familyplanz.app.ui.shell.MENU_NAV_ROWS
import com.familyplanz.app.ui.shell.MENU_SECONDARY_ROWS
import com.familyplanz.app.ui.shell.MOBILE_MENU_TAG
import com.familyplanz.app.ui.shell.NAVBAR_TAG
import com.familyplanz.app.ui.shell.NotificationsResponse
import com.familyplanz.app.ui.shell.OFFLINE_BANNER_TAG
import com.familyplanz.app.ui.shell.ShellMeDto
import com.familyplanz.app.ui.shell.TabLabelText
import com.familyplanz.app.ui.shell.badgeText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #292 §2.1 shell chrome: the 76 dp navbar, the mobile menu, the unread
 * badge and logout (AC-SH-3, -4, -6..-11). Banners and toasts live in
 * `ShellBannerUiTest`.
 */
@RunWith(RobolectricTestRunner::class)
class ShellNavChromeUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val shell = FakeShellSource()
	private val host = HostHarness(rule, edges = ShellEdges(shell = shell))

	private fun entryShown(route: AppRoute) {
		host.waitFor { rule.onAllNodesWithTag("entry-${route.name.lowercase()}").fetchSemanticsNodes().isNotEmpty() }
	}

	private fun openMenu() {
		rule.onNodeWithContentDescription("Open menu").performClick()
		host.waitFor { rule.onAllNodesWithTag(MOBILE_MENU_TAG).fetchSemanticsNodes().isNotEmpty() }
	}

	@Test
	fun the_header_is_76_dp_with_a_32_dp_mark_and_a_44_dp_hamburger() {
		host.launch()
		entryShown(AppRoute.TASKS)

		val density = rule.density.density
		val header = rule.onNodeWithTag(NAVBAR_TAG).fetchSemanticsNode().boundsInRoot
		assertEquals(76f, header.height / density, 2f)
		assertEquals(32f, rule.onNodeWithTag("navbar-mark", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot.height / density, 1f)
		assertEquals(44f, rule.onNodeWithContentDescription("Open menu").fetchSemanticsNode().boundsInRoot.height / density, 1f)
		rule.onNodeWithContentDescription("Open menu").assertExists()
		assertTrue(rule.onAllNodesWithText("Family Planz").fetchSemanticsNodes().isNotEmpty())
	}

	@Test
	fun the_selected_tab_is_a_28_dp_pill_with_a_20_dp_icon_over_an_11_sp_label() {
		host.launch()
		entryShown(AppRoute.TASKS)
		rule.onNodeWithTag("tab-calendar").performClick()
		entryShown(AppRoute.CALENDAR)

		val density = rule.density.density
		fun height(tag: String) = rule.onNodeWithTag(tag, useUnmergedTree = true).fetchSemanticsNode().boundsInRoot.height / density

		assertTrue(height("tab-pill-calendar") >= 27f)
		assertEquals(20f, height("tab-icon-calendar"), 1f)
		assertTrue(height("tab-calendar") >= 52f)
		assertEquals(11f, TabLabelText.fontSize.value)
	}

	@Test
	fun the_logo_opens_the_calendar_tab() {
		host.launch()
		entryShown(AppRoute.TASKS)

		rule.onNodeWithTag("navbar-logo").performClick()

		entryShown(AppRoute.CALENDAR)
	}

	@Test
	fun the_menu_has_the_bell_the_nav_rows_the_secondary_rows_and_logout_in_that_order() {
		host.launch()
		entryShown(AppRoute.TASKS)

		openMenu()

		rule.onNodeWithContentDescription("Notifications").assertExists()
		MENU_NAV_ROWS.forEach { row -> rule.onNodeWithTag("menu-row-${row.route.name.lowercase()}").assertExists() }
		MENU_SECONDARY_ROWS.forEach { row -> rule.onNodeWithText(row.label).assertExists() }
		rule.onNodeWithText(LOGOUT).assertExists()
		// Alerts is the bell's job, not a menu row (`loggedInNavItems`).
		assertEquals(listOf("Calendar", "Dashboard", "Tasks", "Groceries", "Family"), MENU_NAV_ROWS.map { it.label })

		val tops = MENU_NAV_ROWS.map { rule.onNodeWithTag("menu-row-${it.route.name.lowercase()}").fetchSemanticsNode().boundsInRoot.top }
		assertEquals(tops.sorted(), tops)
		val bellTop = rule.onNodeWithContentDescription("Notifications").fetchSemanticsNode().boundsInRoot.top
		assertTrue(bellTop < tops.first())
	}

	@Test
	fun an_admin_sees_admin_and_bug_reports_other_users_do_not() {
		shell.meResult = ApiResult.Ok(ShellMeDto(emailVerified = true, roles = listOf("admin")))
		host.launch()
		entryShown(AppRoute.TASKS)
		openMenu()
		MENU_ADMIN_ROWS.forEach { row -> rule.onNodeWithText(row.label).assertExists() }
	}

	@Test
	fun a_plain_member_has_no_admin_rows() {
		host.launch()
		entryShown(AppRoute.TASKS)
		openMenu()

		MENU_ADMIN_ROWS.forEach { row -> rule.onNodeWithText(row.label).assertDoesNotExist() }
	}

	@Test
	fun selecting_a_tab_closes_the_menu() {
		host.launch()
		entryShown(AppRoute.TASKS)

		openMenu()
		rule.onNodeWithTag("tab-calendar").performClick()

		host.waitFor { rule.onAllNodesWithTag(MOBILE_MENU_TAG).fetchSemanticsNodes().isEmpty() }
		entryShown(AppRoute.CALENDAR)
	}

	@Test
	fun selecting_a_menu_row_closes_the_menu() {
		host.launch()
		entryShown(AppRoute.TASKS)

		openMenu()
		rule.onNodeWithText("Task Stats").performClick()

		host.waitFor { rule.onAllNodesWithTag(MOBILE_MENU_TAG).fetchSemanticsNodes().isEmpty() }
		entryShown(AppRoute.STATS)
	}

	@Test
	fun the_alert_tab_shows_the_unread_count_and_caps_it_at_99_plus() {
		shell.notificationsResult = ApiResult.Ok(
			NotificationsResponse(unreadCount = 3),
		)
		host.launch()
		entryShown(AppRoute.TASKS)
		host.waitForText(badgeText(3))

		rule.onNodeWithText("3").assertExists()
		rule.onNodeWithContentDescription("Alerts (3 unread)").assertExists()
	}

	@Test
	fun a_hundred_and_twenty_unread_reads_99_plus() {
		shell.notificationsResult = ApiResult.Ok(
			NotificationsResponse(unreadCount = 120),
		)
		host.launch()
		entryShown(AppRoute.TASKS)
		host.waitForText("99+")

		rule.onNodeWithText("99+").assertExists()
	}

	@Test
	fun the_badge_refetches_when_the_tab_changes() {
		host.launch()
		entryShown(AppRoute.TASKS)
		host.waitFor { shell.badgeReads >= 1 }
		val before = shell.badgeReads

		rule.onNodeWithText(PhoneTab.CALENDAR.label).performClick()

		host.waitFor { shell.badgeReads > before }
		entryShown(AppRoute.CALENDAR)
	}

	@Test
	fun logout_revokes_the_token_and_returns_to_sign_in() {
		host.launch()
		entryShown(AppRoute.TASKS)
		openMenu()

		rule.onNodeWithText(LOGOUT).performClick()

		host.waitForText("Continue without an account")
		assertTrue((host.auth as FakeAuthSource).loggedOut.contains("fp_test"))
	}

	@Test
	fun the_offline_banner_is_not_rendered_while_online() {
		host.launch()
		entryShown(AppRoute.TASKS)

		rule.onNodeWithTag(OFFLINE_BANNER_TAG).assertDoesNotExist()
	}
}
