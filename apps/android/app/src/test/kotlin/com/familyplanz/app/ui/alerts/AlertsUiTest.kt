package com.familyplanz.app.ui.alerts

import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.NotificationDto
import com.familyplanz.app.data.NotificationFeedDto
import com.familyplanz.app.data.NotificationSource
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

class FakeNotificationSource(var rows: List<NotificationDto> = emptyList()) : NotificationSource {
	val posts = mutableListOf<String>()
	var fail = false
	var feedError: ApiError? = null

	override suspend fun feed(): ApiResult<NotificationFeedDto> =
		feedError?.let { ApiResult.Err(it) } ?: ApiResult.Ok(NotificationFeedDto(rows, rows.count { it.readAt == null }))

	private fun answer(body: String, change: () -> Unit): ApiResult<Unit> {
		posts += body
		if (fail) return ApiResult.Err(ApiError.Server("boom"))
		change()
		return ApiResult.Ok(Unit)
	}

	override suspend fun markRead(id: String) = answer("""{"id":"$id"}""") {
		rows = rows.map { if (it.id == id) it.copy(readAt = "2026-11-03T10:00:00Z") else it }
	}

	override suspend fun markAllRead() = answer("""{"all":true}""") {
		rows = rows.map { it.copy(readAt = it.readAt ?: "2026-11-03T10:00:00Z") }
	}

	override suspend fun pruneRead() = answer("""{"pruneRead":true}""") { rows = rows.filter { it.readAt == null } }
}

@Suppress("LongParameterList")
fun alert(id: String, type: String, read: Boolean = false, link: String? = null, actor: String = "Dad", message: String = "did a thing") =
	NotificationDto(
		id = id, type = type, rawType = type, actorName = actor, message = message, link = link,
		readAt = if (read) "2026-11-01T10:00:00Z" else null, createdAt = "2026-11-01T09:00:00Z",
	)

/** §2.6 AC-AL-1…8 over a fake feed. */
@RunWith(RobolectricTestRunner::class)
class AlertsUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val shell = L4TestShell()
	private val badge = MutableStateFlow(0)
	private val nav = AppNav(AppRoute.ALERTS)

	private fun launch(source: FakeNotificationSource): AlertsViewModel {
		val vm = AlertsViewModel(source, badge)
		rule.setContent { shell.Provide { AlertsRoute(vm, nav, baseUrl = "https://www.familyplanz.com/") } }
		rule.waitUntil(5_000) { !vm.ui.value.loading }
		return vm
	}

	@Test
	fun ac_al_1_title_shows_unread_count_or_caught_up() {
		launch(FakeNotificationSource(listOf(alert("a", "task_completed"), alert("b", "task_completed"))))
		rule.onNodeWithText("Alerts").assertExists()
		rule.onNodeWithText("2 unread").assertExists()
	}

	@Test
	fun ac_al_1_zero_unread_reads_all_caught_up() {
		launch(FakeNotificationSource(listOf(alert("a", "task_completed", read = true))))
		rule.onNodeWithText("You're all caught up").assertExists()
	}

	@Test
	fun ac_al_2_rows_split_into_needs_you_and_just_news() {
		launch(
			FakeNotificationSource(
				listOf(
					alert("p", "assignment_pending"),
					alert("d", "assignment_declined"),
					alert("c", "task_completed"),
					alert("x", "something_new"),
				),
			),
		)
		rule.onNode(hasTestTag("alerts-section-needs_you")).assertExists()
		rule.onNode(hasTestTag("alert-row-p") and hasAncestorTag("alerts-section-needs_you")).assertExists()
		rule.onNode(hasTestTag("alert-row-d") and hasAncestorTag("alerts-section-needs_you")).assertExists()
		rule.onNode(hasTestTag("alert-row-c") and hasAncestorTag("alerts-section-news")).assertExists()
		rule.onNode(hasTestTag("alert-row-x") and hasAncestorTag("alerts-section-news")).assertExists()
		rule.onNode(hasText("Needs you 2") and hasAncestorTag("alerts-section-needs_you")).assertExists()
		rule.onNode(hasText("Just news 2") and hasAncestorTag("alerts-section-news")).assertExists()
	}

	@Test
	fun ac_al_3_row_shows_dot_glyph_actor_message_pill_and_time() {
		launch(
			FakeNotificationSource(
				listOf(
					alert("p", "assignment_pending", actor = "Mom", message = "asked you to take Dishes"),
					alert("a", "assignment_accepted", read = true),
					alert("d", "assignment_declined", read = true),
					alert("f", "added_to_family", read = true),
				),
			),
		)
		rule.onNodeWithText("Mom asked you to take Dishes").assertExists()
		assertEquals(1, rule.onAllNodesWithTag("unread-dot", useUnmergedTree = true).fetchSemanticsNodes().size)
		listOf("Asked you", "Accepted", "Declined", "Added to family").forEach { rule.onNodeWithText(it).assertExists() }
		listOf("?", "✓", "✕", "+").forEach { rule.onNodeWithText(it).assertExists() }
		assertTrue(rule.onAllNodes(hasText("ago", substring = true)).fetchSemanticsNodes().size >= 4)
		assertEquals("✓", alertGlyph("task_completed"))
		assertEquals("Update", alertLabel("mystery"))
	}

	@Test
	fun ac_al_4_filter_chips_change_rows_and_say_when_nothing_matches() {
		launch(FakeNotificationSource(listOf(alert("p", "assignment_pending", read = true), alert("c", "task_completed"))))
		rule.onNode(hasText("All 2") and hasTestTag("alert-filter-all")).assertExists()
		rule.onNode(hasText("Needs you 1") and hasTestTag("alert-filter-needs_you")).assertExists()
		rule.onNode(hasText("Unread 1") and hasTestTag("alert-filter-unread")).assertExists()

		rule.onNodeWithTag("alert-filter-needs_you").performClick().assertIsSelected()
		rule.onNodeWithTag("alert-row-p").assertExists()
		rule.onNodeWithTag("alert-row-c").assertDoesNotExist()

		rule.onNodeWithTag("alert-filter-unread").performClick()
		rule.onNodeWithTag("alert-row-c").assertExists()
		rule.onNodeWithTag("alert-row-p").assertDoesNotExist()
	}

	@Test
	fun ac_al_4_a_filter_with_no_hits_says_so() {
		launch(FakeNotificationSource(listOf(alert("c", "task_completed", read = true))))
		rule.onNodeWithTag("alert-filter-unread").performClick()
		rule.onNodeWithText("Nothing matches this filter.").assertExists()
	}

	@Test
	fun ac_al_5_tapping_an_unread_row_marks_it_read_drops_the_badge_and_navigates() {
		val source = FakeNotificationSource(listOf(alert("p", "assignment_pending", link = "/calendar/tasks?focus=t1"),
			alert("c", "task_completed")))
		launch(source)
		assertEquals(2, badge.value)

		rule.onNodeWithTag("alert-row-p").performClick()
		rule.waitUntil(5_000) { source.posts.isNotEmpty() }
		assertEquals(listOf("""{"id":"p"}"""), source.posts)
		assertEquals(1, badge.value)
		assertEquals(AppRoute.TASKS, nav.route)
	}

	@Test
	fun ac_al_5_a_failed_read_mark_still_opens_and_says_so() {
		val source = FakeNotificationSource(listOf(alert("p", "assignment_pending", link = "/family/f1"))).apply { fail = true }
		launch(source)
		rule.onNodeWithTag("alert-row-p").performClick()
		rule.waitUntil(5_000) { shell.snacks.isNotEmpty() }
		assertEquals(listOf("Couldn't mark that alert read — opening it anyway."), shell.snacks)
		assertEquals(AppRoute.FAMILY, nav.route)
	}

	@Test
	fun ac_al_6_mark_all_read_posts_all_and_toasts() {
		val source = FakeNotificationSource(listOf(alert("p", "assignment_pending"), alert("c", "task_completed")))
		launch(source)
		rule.onNodeWithText("Mark all read").performClick()
		rule.waitUntil(5_000) { shell.snacks.isNotEmpty() }
		assertEquals(listOf("""{"all":true}"""), source.posts)
		assertEquals(listOf("Everything marked as read."), shell.snacks)
		rule.onNodeWithText("You're all caught up").assertExists()
		assertEquals(0, badge.value)
	}

	@Test
	fun ac_al_6_a_failed_mark_all_reverts_and_says_try_again() {
		val source = FakeNotificationSource(listOf(alert("p", "assignment_pending"))).apply { fail = true }
		launch(source)
		rule.onNodeWithText("Mark all read").performClick()
		rule.waitUntil(5_000) { shell.snacks.isNotEmpty() }
		assertEquals(listOf("Couldn't mark everything read — try again."), shell.snacks)
		rule.onNodeWithText("1 unread").assertExists()
	}

	@Test
	fun ac_al_7_delete_read_alerts_asks_then_prunes_and_toasts() {
		val source = FakeNotificationSource(
			listOf(
				alert("a", "task_completed", read = true),
				alert("b", "task_completed", read = true),
				alert("c", "task_completed", read = true),
				alert("u", "assignment_pending"),
			),
		)
		launch(source)
		rule.onNodeWithText("Delete read alerts").performClick()
		rule.onNodeWithText("Delete 3 read alerts?").assertExists()
		rule.onNodeWithText("Keep them").assertExists()
		rule.onNodeWithText("Delete them").performClick()
		rule.waitUntil(5_000) { shell.snacks.isNotEmpty() }
		assertEquals(listOf("""{"pruneRead":true}"""), source.posts)
		assertEquals(listOf("Deleted 3 read alerts."), shell.snacks)
		rule.onNodeWithTag("alert-row-a").assertDoesNotExist()
		rule.onNodeWithTag("alert-row-u").assertExists()
	}

	@Test
	fun ac_al_7_keep_them_cancels() {
		launch(FakeNotificationSource(listOf(alert("a", "task_completed", read = true))))
		rule.onNodeWithText("Delete read alerts").performClick()
		rule.onNodeWithText("Delete 1 read alert?").assertExists()
		rule.onNodeWithText("Keep them").performClick()
		rule.onNodeWithText("Delete read alerts").assertExists()
	}

	@Test
	fun ac_al_8_empty_feed_shows_the_bell_card_verbatim() {
		launch(FakeNotificationSource())
		rule.onNodeWithTag("alerts-screen").performScrollToNode(hasTestTag("alerts-empty"))
		rule.onNodeWithText("🔔").assertExists()
		rule.onNodeWithText("No alerts yet").assertExists()
		rule.onNodeWithText(
			"When family members assign you tasks, accept, decline, or complete them — or add you to their family — you'll see it here.",
		).assertExists()
		rule.onNodeWithText("All 0").assertDoesNotExist()
	}

	@Test
	fun a_401_ends_the_session() {
		launch(FakeNotificationSource().apply { feedError = ApiError.Unauthorized })
		rule.waitUntil(5_000) { shell.ended == 1 }
	}

	@Test
	fun an_unclaimed_link_opens_the_website() {
		launch(FakeNotificationSource(listOf(alert("r", "task_completed", read = true, link = "/pricing"))))
		rule.onNodeWithTag("alert-row-r").performClick()
		rule.waitUntil(5_000) { shell.opened.isNotEmpty() }
		assertEquals(listOf("https://www.familyplanz.com/pricing"), shell.opened)
		assertEquals(AppRoute.ALERTS, nav.route)
	}
}

private fun hasAncestorTag(tag: String) = androidx.compose.ui.test.hasAnyAncestor(hasTestTag(tag))
