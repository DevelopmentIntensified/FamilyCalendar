package com.familyplanz.app.ui.gesture

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.StartRouteProvider
import com.familyplanz.app.ui.shell.COMING_SOON
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #292 S1a: the web's six tabs, each showing its lane's entry; Account and the start screen. */
@RunWith(RobolectricTestRunner::class)
class ShellNavUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val host = HostHarness(rule)

	private val isTab = SemanticsMatcher("is a tab") { it.config.getOrNull(SemanticsProperties.Role) == Role.Tab }

	private fun entryShown(route: AppRoute) {
		host.waitFor { rule.onAllNodesWithTag(entryTag(route)).fetchSemanticsNodes().isNotEmpty() }
	}

	private fun entryTag(route: AppRoute) = "entry-${route.name.lowercase()}"

	@Test
	fun the_tab_bar_shows_the_six_web_tabs_in_order() {
		host.launch()
		entryShown(AppRoute.TASKS)

		val tabs = rule.onAllNodes(isTab, useUnmergedTree = false).fetchSemanticsNodes()
			.sortedBy { it.boundsInRoot.left }
		val labels = tabs.map { node -> node.config.getOrNull(SemanticsProperties.Text).orEmpty().joinToString { it.text } }
		assertEquals(listOf("Calendar", "Dashboard", "Tasks", "Shop", "Alerts", "Family"), labels)
		rule.onNodeWithContentDescription("Groceries").assertExists()
	}

	@Test
	fun each_tab_shows_its_entry() {
		host.repo.tasks = ApiResult.Ok(listOf(task("t1", "Water the plants")))
		host.launch()
		host.waitForText("Water the plants")

		PhoneTab.entries.forEach { tab ->
			rule.onNodeWithText(tab.label).performClick()
			entryShown(tab.route)
			rule.onNodeWithTag(entryTag(tab.route)).assertExists()
		}
		rule.onNodeWithText("Tasks").performClick()
		host.waitForText("Water the plants")
	}

	@Test
	fun dashboard_and_groceries_tabs_show_their_real_entries_not_the_placeholder() {
		host.launch(PhoneTab.DASHBOARD)
		entryShown(AppRoute.DASHBOARD)
		rule.onNodeWithTag(entryTag(AppRoute.DASHBOARD)).assertExists()
		rule.onNodeWithText(COMING_SOON).assertDoesNotExist()

		rule.onNodeWithText("Shop").performClick()
		entryShown(AppRoute.GROCERIES)
		rule.onNodeWithTag(entryTag(AppRoute.GROCERIES)).assertExists()
		rule.onNodeWithText(COMING_SOON).assertDoesNotExist()
	}

	@Test
	fun account_is_reachable_from_the_menu() {
		host.launch()
		entryShown(AppRoute.TASKS)

		rule.onNodeWithContentDescription("Open menu").performClick()
		rule.onNodeWithText("Settings").performClick()

		entryShown(AppRoute.ACCOUNT)
		rule.onNodeWithText(COMING_SOON).assertDoesNotExist()
		rule.onNodeWithText("Account Settings").assertExists()
	}

	@Test
	fun with_no_setting_the_session_opens_on_calendar() {
		host.launch(tab = null)
		entryShown(AppRoute.CALENDAR)
	}

	@Test
	fun a_dashboard_default_view_opens_on_dashboard() {
		host.startRoute = StartRouteProvider { AppRoute.DASHBOARD }
		host.launch(tab = null)
		entryShown(AppRoute.DASHBOARD)
	}

	@Test
	fun an_explicit_tab_beats_the_start_setting() {
		host.startRoute = StartRouteProvider { AppRoute.DASHBOARD }
		host.launch(PhoneTab.TASKS)
		entryShown(AppRoute.TASKS)
		rule.waitForIdle()
		rule.onNodeWithTag(entryTag(AppRoute.TASKS)).assertExists()
	}
}
