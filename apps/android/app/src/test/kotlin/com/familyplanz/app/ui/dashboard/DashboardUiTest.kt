package com.familyplanz.app.ui.dashboard

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
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
import com.familyplanz.app.data.CompletedTaskDto
import com.familyplanz.app.data.DashboardDataDto
import com.familyplanz.app.data.DashboardDto
import com.familyplanz.app.data.DashboardSource
import com.familyplanz.app.data.FamilyMemberDto
import com.familyplanz.app.data.GlanceCountsDto
import com.familyplanz.app.data.GlanceEventDto
import com.familyplanz.app.data.GroceryCardItemDto
import com.familyplanz.app.data.KidDto
import com.familyplanz.app.data.KidsEventDto
import com.familyplanz.app.data.NewFamilyTask
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.data.VerseDto
import com.familyplanz.app.ui.alerts.L4TestShell
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import kotlinx.coroutines.CompletableDeferred
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.ZoneId
import java.util.TimeZone

/** A scripted dashboard: the payload the server would send, plus every write it records. */
class FakeDashboardSource(var payload: DashboardDto) : DashboardSource {
	val calls = mutableListOf<String>()
	var fail: ApiError? = null
	var gate: CompletableDeferred<Unit>? = null

	override suspend fun load(date: String?): ApiResult<DashboardDto> {
		calls += "load:${date ?: "today"}"
		gate?.await()
		return fail?.let { ApiResult.Err(it) } ?: ApiResult.Ok(payload)
	}

	override suspend fun toggleComplete(id: String): ApiResult<Unit> {
		calls += "toggle:$id"
		if (fail != null) return ApiResult.Err(ApiError.Server("boom"))
		val data = payload.data
		payload = payload.copy(
			data = data.copy(
				top3 = data.top3.filterNot { it.id == id },
				completedToday = data.completedToday + CompletedTaskDto(id, "Done", "2026-11-03T18:00:00.000Z"),
			),
		)
		return ApiResult.Ok(Unit)
	}

	override suspend fun setPriority(id: String, priority: String): ApiResult<Unit> {
		calls += "priority:$id:$priority"
		return if (fail != null) ApiResult.Err(ApiError.Server("boom")) else ApiResult.Ok(Unit)
	}

	override suspend fun createFamilyTask(task: NewFamilyTask): ApiResult<Unit> {
		calls += "create:${task.json()}"
		return if (fail != null) ApiResult.Err(ApiError.Server("boom")) else ApiResult.Ok(Unit)
	}
}

/** §2.3 AC-DB-1…15 over a scripted payload. */
@RunWith(RobolectricTestRunner::class)
class DashboardUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val shell = L4TestShell()
	private val nav = AppNav(AppRoute.DASHBOARD)
	private lateinit var defaultZone: TimeZone

	@Before
	fun pinZone() {
		defaultZone = TimeZone.getDefault()
		TimeZone.setDefault(TimeZone.getTimeZone(ZoneId.of("America/Chicago")))
	}

	@After
	fun restoreZone() {
		TimeZone.setDefault(defaultZone)
	}

	private fun launch(source: FakeDashboardSource, wait: Boolean = true): DashboardViewModel {
		val vm = DashboardViewModel(source) { LocalDate.of(2026, 11, 4) }
		rule.setContent { shell.Provide { DashboardRoute(vm, nav) } }
		if (wait) rule.waitUntil(5_000) { !vm.ui.value.loading }
		return vm
	}

	@Test
	fun ac_db_1_header_names_the_day_and_says_today() {
		launch(FakeDashboardSource(payload()))
		rule.onNodeWithText("Day Dashboard").assertIsDisplayed()
		rule.onNodeWithTag("dashboard-date-line").assertTextEquals("Tuesday, November 3 · today")
	}

	@Test
	fun ac_db_2_arrows_walk_the_day_and_today_comes_back() {
		val source = FakeDashboardSource(payload(isToday = false))
		launch(source)
		rule.onNodeWithTag("dashboard-date-line").assertTextEquals("Tuesday, November 3")
		rule.onNodeWithTag("day-nav-next").performClick()
		rule.waitUntil(5_000) { source.calls.contains("load:2026-11-04") }
		rule.onNodeWithTag("day-nav-prev").performClick()
		rule.waitUntil(5_000) { source.calls.contains("load:2026-11-02") }
		rule.onNodeWithTag("day-nav-today").performClick()
		rule.waitUntil(5_000) { source.calls.count { it == "load:today" } == 2 }
	}

	@Test
	@Config(qualifiers = "w411dp-h3400dp")
	fun ac_db_3_cards_render_in_the_spec_order() {
		launch(FakeDashboardSource(payload()))
		val order = listOf("verse-band", "card-glance", "card-top3", "card-completed", "card-board", "card-kids", "card-groceries")
		val tops = order.map { rule.onNodeWithTag(it).fetchSemanticsNode().positionInRoot.y }
		assertEquals(order.joinToString(), tops.sorted(), tops)
	}

	@Test
	fun ac_db_4_no_family_means_no_board_and_no_kids() {
		launch(FakeDashboardSource(payload(familyId = null)))
		rule.onNodeWithTag("card-glance").assertIsDisplayed()
		rule.onNodeWithTag("card-board").assertDoesNotExist()
		rule.onNodeWithTag("card-kids").assertDoesNotExist()
	}

	@Test
	fun ac_db_5_a_module_switched_off_is_absent() {
		launch(FakeDashboardSource(payload(modules = mapOf("top3" to false, "groceries" to false))))
		rule.onNodeWithTag("card-glance").assertIsDisplayed()
		rule.onNodeWithTag("card-top3").assertDoesNotExist()
		rule.onNodeWithTag("card-groceries").assertDoesNotExist()
	}

	@Test
	fun ac_db_6_glance_with_no_events_offers_the_day_view() {
		launch(FakeDashboardSource(payload(events = emptyList())))
		rule.onNodeWithTag("glance-empty").assertIsDisplayed()
		rule.onNodeWithText("No events scheduled today").assertIsDisplayed()
		rule.onNodeWithTag("glance-open-day").performClick()
		rule.waitForIdle()
		assertEquals(AppRoute.CALENDAR, nav.route)
		assertEquals("2026-11-03", nav.takeArg(AppRoute.CALENDAR))
	}

	@Test
	fun ac_db_7_a_timed_row_shows_start_over_end() {
		launch(FakeDashboardSource(payload()))
		rule.onNodeWithText("8:00 AM").assertIsDisplayed()
		rule.onNodeWithText("9:00 AM").assertIsDisplayed()
	}

	@Test
	fun ac_db_8_all_clear_copy_and_the_task_link() {
		launch(FakeDashboardSource(payload(top3 = emptyList())))
		rule.onNodeWithText("All clear — nothing needs you right now.").assertIsDisplayed()
		rule.onNodeWithTag("top3-view-all").performClick()
		rule.waitForIdle()
		assertEquals(AppRoute.TASKS, nav.route)
	}

	@Test
	fun ac_db_8_the_groups_are_named_and_counted() {
		launch(FakeDashboardSource(payload()))
		rule.onNodeWithText("ONE-OFF (1)").assertIsDisplayed()
		rule.onNodeWithText("RECURRING (1)").assertIsDisplayed()
	}

	@Test
	fun ac_db_9_a_check_marks_done_removes_the_row_and_adds_a_win() {
		val source = FakeDashboardSource(payload())
		launch(source)
		rule.onNodeWithText("2 wins").assertIsDisplayed()
		rule.onNodeWithContentDescription("Mark done: Take out bins").performClick()
		rule.waitUntil(5_000) { shell.snacks.contains("\"Take out bins\" marked done.") }
		rule.waitUntil(5_000) { rule.onAllNodesWithTag("top3-row-t1").fetchSemanticsNodes().isEmpty() }
		assertTrue(source.calls.contains("toggle:t1"))
		rule.waitUntil(5_000) { rule.onAllNodesWithText("3 wins").fetchSemanticsNodes().isNotEmpty() }
	}

	@Test
	fun ac_db_10_high_sends_the_priority_and_tones_the_segment() {
		val source = FakeDashboardSource(payload())
		launch(source)
		rule.onNodeWithTag("priority-t1-high").performClick()
		rule.waitUntil(5_000) { source.calls.contains("priority:t1:high") }
		assertTrue(shell.snacks.contains("Priority for \"Take out bins\" set to High."))
	}

	@Test
	fun ac_db_11_two_completions_read_as_two_wins() {
		launch(FakeDashboardSource(payload()))
		rule.onNodeWithText("2 wins").assertIsDisplayed()
		rule.onNodeWithTag("completed-row-t9").assertExists()
	}

	@Test
	fun ac_db_12_quick_add_parses_saturday_for_dad() {
		val source = FakeDashboardSource(payload())
		launch(source)
		rule.onNodeWithTag("board-quick-input").performTextInput("take out bins saturday for Dad")
		rule.onNodeWithText("Add").performClick()
		rule.waitUntil(5_000) { source.calls.any { it.startsWith("create:") } }
		val body = source.calls.first { it.startsWith("create:") }
		assertTrue(body, body.contains("\"title\":\"take out bins\""))
		assertTrue(body, body.contains("\"assignedTo\":\"u2\""))
		assertTrue(body, body.contains("\"dueDate\":\"2026-11-07\""))
		rule.waitUntil(5_000) { shell.snacks.contains("Added \"take out bins\" to the family board.") }
	}

	@Test
	fun ac_db_12_an_unknown_handle_names_the_problem_and_sends_nothing() {
		val source = FakeDashboardSource(payload())
		launch(source)
		rule.onNodeWithTag("board-quick-input").performTextInput("@ghost fix the sink")
		rule.onNodeWithText("Add").performClick()
		rule.waitUntil(5_000) { rule.onAllNodesWithTag("board-quick-error").fetchSemanticsNodes().isNotEmpty() }
		rule.onNodeWithText(
			"Unknown member @ghost — check the spelling or pick someone from your family.",
		).assertIsDisplayed()
		assertTrue(source.calls.none { it.startsWith("create:") })
	}

	@Test
	fun ac_db_13_a_member_with_nothing_says_so() {
		launch(FakeDashboardSource(payload()))
		rule.onNodeWithTag("board-empty-u3").assertTextEquals("nothing assigned")
		rule.onNodeWithTag("board-group-u2").assertExists()
	}

	@Test
	fun ac_db_14_groceries_count_store_chips_and_three_names() {
		launch(FakeDashboardSource(payload()))
		rule.onNodeWithTag("groceries-open-total").assertTextEquals("7 open")
		rule.onNodeWithTag("groceries-names-family").assertTextEquals("milk, bread, eggs, +4 more")
		rule.onNodeWithText("Aldi").assertIsDisplayed()
	}

	@Test
	fun ac_db_15_loading_shows_the_six_pulse_blocks() {
		val source = FakeDashboardSource(payload()).apply { gate = CompletableDeferred() }
		launch(source, wait = false)
		rule.onAllNodesWithTag("skeleton-block").assertCountEquals(6)
		source.gate?.complete(Unit)
		rule.waitUntil(5_000) { !source.calls.isEmpty() }
	}

	@Test
	fun ac_db_15_failure_names_the_problem_and_offers_retry() {
		val source = FakeDashboardSource(payload()).apply { fail = ApiError.Server("boom") }
		launch(source)
		rule.onNodeWithText("Couldn't load the dashboard.").assertIsDisplayed()
		rule.onNodeWithTag("dashboard-retry").performClick()
		rule.waitUntil(5_000) { source.calls.size >= 2 }
	}

	@Suppress("LongParameterList")
	private fun payload(
		isToday: Boolean = true,
		familyId: String? = "fam-1",
		modules: Map<String, Boolean> = emptyMap(),
		events: List<GlanceEventDto> = listOf(timedEvent(), allDayEvent()),
		top3: List<TaskDto> = listOf(oneOff(), recurring()),
		completed: List<CompletedTaskDto> = listOf(
			CompletedTaskDto("t9", "Milk", "2026-11-03T14:00:00.000Z"),
			CompletedTaskDto("t10", "Eggs", "2026-11-03T15:00:00.000Z"),
		),
	) = DashboardDto(
		zone = "America/Chicago",
		dayISO = "2026-11-03T00:00:00.000-06:00",
		isToday = isToday,
		meId = "u1",
		familyId = familyId,
		modules = modules,
		dailyVerse = VerseDto("Ps 118:24", "This is the day", "KJV"),
		taskCategories = emptyList(),
		data = DashboardDataDto(
			familyTasks = listOf(familyTask()),
			familyMembers = listOf(
				FamilyMemberDto("u1", "Mum", "Smith"),
				FamilyMemberDto("u2", "Dad", "Smith"),
				FamilyMemberDto("u3", "Ada", "Smith"),
			),
			dayEvents = events,
			top3 = top3,
			glance = GlanceCountsDto(doneToday = 2, openToday = 3, weekStreak = 4),
			completedToday = completed,
			kidsSchedule = listOf(
				KidsEventDto(
					id = "k1", title = "Soccer", start = "2026-11-03T22:00:00.000Z",
					location = "Park", kids = listOf(KidDto("kid-1", "Ada")),
				),
			),
			familyGroceries = sevenGroceries(),
			mineGroceries = emptyList(),
		),
	)

	private fun oneOff() = TaskDto(id = "t1", title = "Take out bins", userId = "u1", dueDate = "2026-11-03T00:00:00.000Z")

	private fun recurring() = TaskDto(
		id = "t2", title = "Pay rent", userId = "u1", familyId = "fam-1",
		assignedTo = "u2", assigneeFirstName = "Dad", recurrenceFrequency = "monthly", priority = "high",
	)

	private fun familyTask() = TaskDto(id = "t5", title = "Hang shelves", userId = "u1", familyId = "fam-1", assignedTo = "u2")

	private fun timedEvent() = GlanceEventDto(
		id = "e1", title = "Dentist", start = "2026-11-03T14:00:00.000Z", end = "2026-11-03T15:00:00.000Z",
		color = "#2563EB", source = "family", rsvpStatus = "going",
	)

	private fun allDayEvent() = GlanceEventDto(id = "e2", title = "Camp", start = "2026-11-03T00:00:00.000Z", allDay = true)

	private fun sevenGroceries() = listOf(
		GroceryCardItemDto("milk", listOf("Aldi")),
		GroceryCardItemDto("bread", listOf("Kroger")),
		GroceryCardItemDto("eggs", listOf("Aldi")),
		GroceryCardItemDto("jam", listOf("Aldi")),
		GroceryCardItemDto("ham", listOf("Aldi")),
		GroceryCardItemDto("tea", listOf("Aldi")),
		GroceryCardItemDto("rice", listOf("Aldi")),
	)
}
