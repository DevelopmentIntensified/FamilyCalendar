package com.familyplanz.app.ui.review

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import com.familyplanz.app.data.AuthIntent
import com.familyplanz.app.data.CalendarDto
import com.familyplanz.app.data.CompletedTaskDto
import com.familyplanz.app.data.DashboardDataDto
import com.familyplanz.app.data.DashboardDto
import com.familyplanz.app.data.FamilyMemberDto
import com.familyplanz.app.data.GlanceCountsDto
import com.familyplanz.app.data.GlanceEventDto
import com.familyplanz.app.data.GroceryCardItemDto
import com.familyplanz.app.data.GroceryItemDto
import com.familyplanz.app.data.KidDto
import com.familyplanz.app.data.KidsEventDto
import com.familyplanz.app.data.RosterMemberDto
import com.familyplanz.app.data.SignupNames
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.data.VerseDto
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.domain.TaskMapper
import com.familyplanz.app.ui.alerts.L4TestShell
import com.familyplanz.app.ui.auth.PasswordSignup
import com.familyplanz.app.ui.auth.SignInActions
import com.familyplanz.app.ui.auth.SignInScreen
import com.familyplanz.app.ui.auth.SignInStep
import com.familyplanz.app.ui.auth.SignInUiState
import com.familyplanz.app.ui.calendar.CalendarActions
import com.familyplanz.app.ui.calendar.CalendarBulkActions
import com.familyplanz.app.ui.calendar.CalendarData
import com.familyplanz.app.ui.calendar.CalendarEventActions
import com.familyplanz.app.ui.calendar.CalendarFilterActions
import com.familyplanz.app.ui.calendar.CalendarFormActions
import com.familyplanz.app.ui.calendar.CalendarModeActions
import com.familyplanz.app.ui.calendar.CalendarNavActions
import com.familyplanz.app.ui.calendar.CalendarScreen
import com.familyplanz.app.ui.calendar.CalendarSheetActions
import com.familyplanz.app.ui.calendar.CalendarUiState
import com.familyplanz.app.ui.calendar.CalendarView
import com.familyplanz.app.ui.dashboard.DashboardRoute
import com.familyplanz.app.ui.dashboard.DashboardViewModel
import com.familyplanz.app.ui.dashboard.FakeDashboardSource
import com.familyplanz.app.ui.groceries.GroceriesActions
import com.familyplanz.app.ui.groceries.GroceriesScreen
import com.familyplanz.app.ui.groceries.GroceriesUiState
import com.familyplanz.app.ui.groceries.StoreViewer
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.tasks.TaskActions
import com.familyplanz.app.ui.tasks.TaskListScreen
import com.familyplanz.app.ui.tasks.TasksUiState
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.LocalDate
import java.time.ZoneId

/**
 * 380 dp review shots (owner request): the main tabs at a width narrower than
 * the 411 dp the unit tests run at. PNGs land in `build/screenshots/380/` for
 * the owner to open; the test itself is the proof every main screen composes.
 * Tall windows keep the full column visible — width is what this harness pins.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class Review380Test {
	@get:Rule
	val rule = createAndroidComposeRule<ComponentActivity>()

	private var current by mutableStateOf(0)

	private fun shots() {
		rule.setContent {
			FamilyPlanzTheme { shot(current) }
		}
		PAGES.forEachIndexed { index, name ->
			current = index
			rule.waitForIdle()
			save(name)
		}
	}

	@Composable
	private fun shot(index: Int) {
		when (index) {
			0 -> SignInScreen(SignInUiState(), null, signinNops())
			1 -> TaskListScreen(state = tasksState(), actions = taskNops())
			2 -> {
				val shell = L4TestShell()
				val vm = DashboardViewModel(FakeDashboardSource(dashboardPayload())) { LocalDate.of(2026, 11, 3) }
				shell.Provide { DashboardRoute(vm, AppNav(AppRoute.DASHBOARD)) }
			}
			3 -> GroceriesScreen(groceriesState(), GroceriesActions())
			4 -> CalendarScreen(state = calendarState(CalendarView.MONTH), actions = calendarNops(), onBrowseTasks = {})
			5 -> CalendarScreen(state = calendarState(CalendarView.WEEK), actions = calendarNops(), onBrowseTasks = {})
		}
	}

	private fun save(name: String) {
		val view = rule.activity.window.decorView
		val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
		view.draw(Canvas(bitmap))
		val dir = File("build/screenshots/380").apply { mkdirs() }
		File(dir, "$name.png").outputStream().use { out ->
			bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
		}
	}

	@Test
	@Config(qualifiers = "w380dp-h2600dp-xhdpi")
	fun the_screens_at_380dp() = shots()

	private companion object {
		/** Order (and the save names) of the faces; the render lives in [shot]. */
		private val PAGES = listOf("signin", "tasks", "dashboard", "groceries", "calendar-month", "calendar-week")
	}
}

private fun signinNops() = SignInActions(
	onRequestCode = { _: String, _: SignupNames? -> },
	onVerifyCode = {},
	onResendCode = {},
	onPassword = { _: String, _: String, _: PasswordSignup? -> },
	onGuest = {},
	onIntent = { _: AuthIntent -> },
	onStep = { _: SignInStep -> },
	onSaveToken = {},
)

private fun taskNops() = TaskActions(
	onRefresh = {}, onOpenSettings = {}, onToggleComplete = {}, onStartFocus = {}, onStopFocus = {},
)

private fun tasksState(): TasksUiState = TasksUiState.Ready(
	tasks = listOf(
		TaskMapper.fromDto(
			TaskDto(
				id = "t1", title = "Take out the recycling — the big one", userId = "u1",
				dueDate = "2026-11-06T00:00:00.000Z", priority = "high", category = "Chores",
			),
		),
		TaskMapper.fromDto(
			TaskDto(
				id = "t2", title = "Pay rent", userId = "u1", familyId = "fam-1",
				assignedTo = "u2", assigneeFirstName = "Dad",
				recurrenceFrequency = "monthly", priority = "normal",
			),
		),
	),
	meId = "u1",
)

private fun dashboardPayload() = DashboardDto(
	zone = "America/Chicago",
	dayISO = "2026-11-03T00:00:00.000-06:00",
	isToday = true,
	meId = "u1",
	familyId = "fam-1",
	dailyVerse = VerseDto("Ps 118:24", "This is the day which the LORD hath made; we will rejoice and be glad in it.", "KJV"),
	data = DashboardDataDto(
		familyTasks = listOf(TaskDto(id = "t5", title = "Hang shelves in the garage", userId = "u1", familyId = "fam-1", assignedTo = "u2")),
		familyMembers = listOf(
			FamilyMemberDto("u1", "Mum", "Smith"),
			FamilyMemberDto("u2", "Dad", "Smith"),
			FamilyMemberDto("u3", "Ada", "Smith"),
		),
		dayEvents = listOf(
			GlanceEventDto(
				id = "e1", title = "Dentist — rebooking still pending", start = "2026-11-03T20:00:00.000Z",
				end = "2026-11-03T21:00:00.000Z", color = "#2563EB", source = "family", rsvpStatus = "going",
			),
			GlanceEventDto(id = "e2", title = "Camp", start = "2026-11-03", allDay = true),
		),
		top3 = listOf(
			TaskDto(id = "t1", title = "Take out the recycling", userId = "u1", dueDate = "2026-11-03T00:00:00.000Z", priority = "high"),
			TaskDto(id = "t2", title = "Pay rent", userId = "u2", familyId = "fam-1", recurrenceFrequency = "monthly", priority = "high"),
		),
		glance = GlanceCountsDto(doneToday = 2, openToday = 3, weekStreak = 4),
		completedToday = listOf(
			CompletedTaskDto("t9", "Milk", "2026-11-03T14:00:00.000Z"),
			CompletedTaskDto("t10", "Eggs", "2026-11-03T15:00:00.000Z"),
		),
		kidsSchedule = listOf(
			KidsEventDto(
				id = "k1", title = "Soccer", start = "2026-11-04T00:00:00.000Z",
				location = "the park by the school that floods when it rains", kids = listOf(KidDto("kid-1", "Ada")),
			),
		),
		familyGroceries = listOf(
			GroceryCardItemDto("milk", listOf("Aldi")),
			GroceryCardItemDto("bread", listOf("Kroger")),
			GroceryCardItemDto("eggs", listOf("Aldi")),
		),
	),
)

private fun groceriesState() = GroceriesUiState(
	loading = false,
	viewer = StoreViewer("u1", "fam-1"),
	family = listOf(
		GroceryItemDto("g1", "Milk", stores = listOf("Aldi"), familyId = "fam-1", userId = "u2"),
		GroceryItemDto("g2", "Bread — the good sourdough from the bakery counter", stores = listOf("Kroger"), familyId = "fam-1", userId = "u1"),
	),
	mine = listOf(
		GroceryItemDto("g3", "Coffee beans", stores = listOf("Aldi"), familyId = null, userId = "u1"),
	),
)

private fun calendarState(view: CalendarView): CalendarUiState = CalendarUiState(
	anchor = LocalDate.of(2026, 11, 6),
	today = LocalDate.of(2026, 11, 6),
	zone = ZoneId.of("America/Chicago"),
	view = view,
	loading = false,
	data = CalendarData(
		events = listOf(
			CalendarEvent(
				id = "e1", title = "Dentist — rebooking still pending", startDate = "2026-11-06T14:00:00Z",
				endDate = "2026-11-06T15:00:00Z", allDay = false, location = "47 Main Street, Springfield",
				occurrence = false, rsvpStatus = "going", creatorName = "Mum", day = "2026-11-06", color = "#2563EB",
			),
			CalendarEvent(
				id = "e2", title = "Church", startDate = "2026-11-08T00:00:00Z", endDate = null,
				allDay = true, location = null, occurrence = false, rsvpStatus = null, creatorName = null,
				day = "2026-11-08", color = "#7C3AED",
			),
		),
		tasks = listOf(
			CalendarTask(
				id = "ct1", title = "Buy milk", dueDate = "2026-11-06",
				dueDay = LocalDate.of(2026, 11, 6), calendarId = null, assigneeFirstName = "Ada",
			),
		),
		calendars = listOf(CalendarDto("c1", "Family", "#3b82f6", "family")),
		roster = listOf(RosterMemberDto("u1", "Mum", "Smith")),
		meId = "u1",
	),
)

private fun calendarNops() = CalendarActions(
	nav = CalendarNavActions(
		onPrev = {}, onNext = {}, onToday = {}, onPickMonth = {}, onSetView = {},
		onOpenDay = {}, onBack = {}, onSwipe = { _, _ -> },
	),
	sheets = CalendarSheetActions(onCellTap = {}, onOpen = {}, onClose = {}, onMenu = {}),
	filters = CalendarFilterActions(
		onToggleCalendar = {}, onHideAll = {}, onToggleAssignee = {},
		onShowEveryone = {}, onQuery = {}, onDismissFirstRun = {},
	),
	modes = CalendarModeActions(
		onSetSelection = {}, onToggleSelect = {}, onToggleAdd = {}, onRange = {}, onRetry = {},
	),
	form = CalendarFormActions(
		onCreate = { _, _ -> }, onCreateTask = {}, onEdit = {}, onDuplicate = {},
		onUpdate = { it }, onSubmit = {}, onClose = {}, onQuickAdd = {}, onParse = {},
	),
	events = CalendarEventActions(onRsvp = { _, _ -> }, onDelete = { _, _ -> }, onAddChecklist = { _, _ -> }, onCompleteTask = {}),
	bulk = CalendarBulkActions(
		onDelete = {}, onDone = {}, onCalendar = {}, onLocation = {},
		onAttendants = {}, onPlan = {}, onApplyPlan = {}, onDiscardPlan = {},
	),
)
