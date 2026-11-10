package com.familyplanz.app.ui.review

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.CalendarDto
import com.familyplanz.app.data.RosterMemberDto
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.FpChip
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.PhoneTab
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
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.BOTTOM_NAV_TAG
import com.familyplanz.app.ui.shell.BellActions
import com.familyplanz.app.ui.shell.BellList
import com.familyplanz.app.ui.shell.FpBottomNav
import com.familyplanz.app.ui.shell.FpCountBadge
import com.familyplanz.app.ui.shell.FpMobileMenu
import com.familyplanz.app.ui.shell.FpNavbar
import com.familyplanz.app.ui.shell.FpNotificationBell
import com.familyplanz.app.ui.shell.MENU_SECONDARY_ROWS
import com.familyplanz.app.ui.shell.MOBILE_MENU_TAG
import com.familyplanz.app.ui.shell.MenuActions
import com.familyplanz.app.ui.shell.MenuState
import com.familyplanz.app.ui.shell.TabLabelText
import com.familyplanz.app.ui.theme.Brand
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import com.familyplanz.app.ui.theme.FpKickerText
import com.familyplanz.app.ui.theme.FpLightColorScheme
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.FpTitleMediumBold
import com.familyplanz.app.ui.theme.Slate
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
 * 380 dp review shots of the signed-in shell (issue #313): navbar, menu,
 * bottom bar and one content surface (the calendar month view) in four
 * variants, saved as `build/screenshots/380/theme-A..D.png` for the owner.
 *
 * - **A** the shipped shell, untouched: orange/slate/white, the menu repeats
 *   the six tabs and the bell lives inside it.
 * - **B** nav de-dup: only the secondary rows stay in the menu, the bell moves
 *   into the navbar, the six-tab bar stays.
 * - **C** third colour: mint (`theme.css:67`, `Brand.Mint`) on the active tab
 *   pill and the section header band. The month's today cell stays orange:
 *   `CalendarMonthGrid` hard-codes `Primary.P50/P600` (the follow-up ticket's
 *   job), so the shot shows exactly how far a palette role reaches today.
 * - **D** colour-focal: blush (`theme.css:62`, `Brand.Blush`) washes the chrome
 *   and cards; orange survives only as the action colour (Logout, FAB, tab).
 *
 * Only [PrototypeTheme] — a local wrapper — overrides colour. No app file is
 * touched: A renders the real `FpNavbar`/`FpMobileMenu`/`FpBottomNav`, B keeps
 * the real navbar + tab bar and swaps the menu body, C re-tints the active tab
 * pill (a harness copy of `BottomNav.kt`'s tab row) plus the header band, D
 * re-tints `MaterialTheme.colorScheme.surface`.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ReviewThemeVariantsTest {
	@get:Rule
	val rule = createAndroidComposeRule<ComponentActivity>()

	private var current by mutableStateOf(0)

	private fun shots() {
		rule.setContent {
			PrototypeTheme(VARIANTS[current]) { Shell(VARIANTS[current]) }
		}
		VARIANTS.forEachIndexed { index, variant ->
			current = index
			rule.waitForIdle()
			save("theme-${variant.key}")
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
	fun the_shell_and_theme_variants_at_380dp() = shots()

	private companion object {
		/** Order (and the save names) of the variants; the render lives in the top-level [Shell]. */
		private val VARIANTS = listOf(
			Variant(key = "A"),
			Variant(key = "B", menu = MenuShape.SECONDARY_ONLY, bellInNavbar = true),
			Variant(
				key = "C",
				tabPill = ChipTone(Brand.Mint, Brand.MintInk),
				sectionInk = Brand.MintInk,
				sectionWash = wash(Brand.Mint, 0.4f),
			),
			Variant(
				key = "D",
				sectionInk = Brand.Terracotta,
				sectionWash = wash(Brand.Blush, 0.9f),
				surface = wash(Brand.Blush, 0.7f),
			),
		)
	}
}

/** Which menu body a variant shows. */
private enum class MenuShape { FULL, SECONDARY_ONLY }

/**
 * One prototype variant: the structural delta ([menu], [bellInNavbar]) and the
 * colour delta (`null` = the shipped token). Nothing here is production code.
 */
private data class Variant(
	val key: String,
	val menu: MenuShape = MenuShape.FULL,
	val bellInNavbar: Boolean = false,
	/** Active tab pill; null keeps `tabTone()`'s primary-50/600. */
	val tabPill: ChipTone? = null,
	/** Section-header kicker/title ink; null keeps slate. */
	val sectionInk: Color? = null,
	/** Section-header band wash; null = no band. */
	val sectionWash: Color? = null,
	/** `MaterialTheme.colorScheme.surface` override: chrome, menu, cards and month cells. */
	val surface: Color? = null,
)

/** A tint pulled toward white: the opaque wash a palette colour needs on a card. */
private fun wash(color: Color, fraction: Float): Color = lerp(Color.White, color, fraction)

/**
 * The variant's colour override. Everything else — type, shapes, the rest of
 * the palette — comes from [FamilyPlanzTheme], so a variant can only move
 * colour, never the design language.
 */
@Composable
private fun PrototypeTheme(variant: Variant, content: @Composable () -> Unit) {
	FamilyPlanzTheme {
		MaterialTheme(
			colorScheme = FpLightColorScheme.copy(
				tertiary = variant.sectionInk ?: FpLightColorScheme.tertiary,
				tertiaryContainer = variant.sectionWash ?: FpLightColorScheme.tertiaryContainer,
				surface = variant.surface ?: FpLightColorScheme.surface,
			),
			content = content,
		)
	}
}

/** The signed-in shell: navbar, menu, section header, one card, the month view, the tab bar. */
@Composable
private fun Shell(variant: Variant) {
	Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
		PrototypeNavbar(variant)
		when (variant.menu) {
			MenuShape.FULL -> FpMobileMenu(
				state = MenuState(open = true, active = AppRoute.CALENDAR, admin = false),
				actions = MenuActions(onOpen = {}, onLogout = {}),
				bell = { PrototypeBell() },
			)
			MenuShape.SECONDARY_ONLY -> SecondaryOnlyMenu()
		}
		SectionHeader(variant, kicker = "This week", title = "Nov 3 – 9")
		TodayCard()
		Box(modifier = Modifier.weight(1f).fillMaxWidth().padding(top = 4.dp)) {
			CalendarScreen(
				state = shellCalendarState(),
				actions = shellCalendarNops(),
				onBrowseTasks = {},
			)
		}
		PrototypeBottomNav(variant)
	}
}

/** The real navbar; B overlays the real bell where a promoted bell would sit (left of the hamburger). */
@Composable
private fun PrototypeNavbar(variant: Variant) {
	Box(modifier = Modifier.fillMaxWidth()) {
		FpNavbar(menuOpen = true, onLogo = {}, onToggleMenu = {})
		if (variant.bellInNavbar) {
			// Navbar row: 16 dp top inset, 44 dp buttons, 24 dp end inset — so
			// `end = 68.dp` puts the 44 dp bell immediately left of the hamburger.
			Box(modifier = Modifier.align(Alignment.TopEnd).padding(top = 16.dp, end = 68.dp)) {
				PrototypeBell()
			}
		}
	}
}

@Composable
private fun PrototypeBell() {
	FpNotificationBell(
		unread = 3,
		open = false,
		list = BellList.Loading,
		actions = BellActions(onToggle = {}, onRetry = {}, onRow = {}, onMarkAll = {}),
	)
}

/**
 * B's menu: the four secondary destinations and Logout. The rows mirror
 * `SecondaryRow` in `Navbar.kt` (bodyMedium, slate-600, 44 dp, 12 dp padding)
 * and the destinations are the real `MENU_SECONDARY_ROWS`.
 */
@Composable
private fun SecondaryOnlyMenu() {
	Column(
		modifier = Modifier
			.fillMaxWidth()
			.background(MaterialTheme.colorScheme.surface)
			.testTag(MOBILE_MENU_TAG),
	) {
		Column(modifier = Modifier.padding(12.dp)) {
			MENU_SECONDARY_ROWS.forEach { row ->
				Text(
					row.label,
					style = MaterialTheme.typography.bodyMedium,
					color = FpTheme.colors.textBody,
					modifier = Modifier
						.fillMaxWidth()
						.heightIn(min = 44.dp)
						.clip(MaterialTheme.shapes.small)
						.clickable(role = Role.Button, onClick = {})
						.padding(horizontal = 12.dp, vertical = 12.dp),
				)
			}
			HorizontalDivider(Modifier.padding(top = 16.dp), color = MaterialTheme.colorScheme.outlineVariant)
			FpPrimaryButton(onClick = {}, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
				Text("Logout", style = MaterialTheme.typography.labelLarge)
			}
		}
		HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
	}
}

/** Kicker + title: slate in A/B, the variant's third colour (and wash) in C/D. */
@Composable
private fun SectionHeader(variant: Variant, kicker: String, title: String) {
	Column(
		modifier = Modifier
			.fillMaxWidth()
			.background(variant.sectionWash ?: Color.Transparent)
			.padding(horizontal = 16.dp, vertical = 12.dp),
	) {
		Text(
			kicker.uppercase(),
			style = FpKickerText,
			color = variant.sectionInk ?: FpTheme.colors.kicker,
		)
		Text(
			title,
			style = FpTitleMediumBold,
			color = variant.sectionInk ?: FpTheme.colors.textStrong,
		)
	}
}

/** One real card on the content surface — the wash in D lands here. */
@Composable
private fun TodayCard() {
	FpCard(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
		Row(verticalAlignment = Alignment.CenterVertically) {
			Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
				Text("Today", style = MaterialTheme.typography.titleSmall, color = FpTheme.colors.textStrong)
				Text(
					"2 done · 3 open · 4-day streak",
					style = MaterialTheme.typography.bodySmall,
					color = FpTheme.colors.textMuted,
				)
			}
			FpChip("Chores", FpTheme.colors.category)
			Spacer(modifier = Modifier.width(8.dp))
			FpChip("Due today", FpTheme.colors.dueToday)
		}
	}
}

/** A: the real six-tab bar. C: the same bar with the third colour on the active pill. */
@Composable
private fun PrototypeBottomNav(variant: Variant) {
	val pill = variant.tabPill
	if (pill == null) {
		FpBottomNav(selected = PhoneTab.CALENDAR, unread = 3, hidden = false, onSelect = {})
		return
	}
	Column(
		modifier = Modifier
			.fillMaxWidth()
			.background(MaterialTheme.colorScheme.surface)
			.testTag(BOTTOM_NAV_TAG),
	) {
		HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
		Row(modifier = Modifier.fillMaxWidth()) {
			PhoneTab.entries.forEach { tab ->
				val selected = tab == PhoneTab.CALENDAR
				Column(
					modifier = Modifier
						.weight(1f)
						.heightIn(min = 52.dp)
						.padding(vertical = 10.dp),
					horizontalAlignment = Alignment.CenterHorizontally,
					verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
				) {
					Box {
						Box(
							modifier = Modifier
								.height(28.dp)
								.clip(FpShape.Pill)
								.background(if (selected) pill.container else Color.Transparent),
							contentAlignment = Alignment.Center,
						) {
							Icon(
								painterResource(tab.icon),
								contentDescription = null,
								tint = if (selected) pill.content else Slate.S400,
								modifier = Modifier.size(20.dp),
							)
						}
						FpCountBadge(
							if (tab == PhoneTab.ALERTS) 3 else 0,
							FpTheme.colors.tabBadge,
							Modifier.align(Alignment.TopEnd).offset(x = 4.dp, y = (-4).dp),
						)
					}
					Text(
						tab.label,
						style = TabLabelText,
						color = if (selected) pill.content else Slate.S500,
						maxLines = 1,
						overflow = TextOverflow.Ellipsis,
						textAlign = TextAlign.Center,
						modifier = Modifier.fillMaxWidth().padding(horizontal = 2.dp),
					)
				}
			}
		}
	}
}

private fun shellCalendarState(): CalendarUiState = CalendarUiState(
	anchor = LocalDate.of(2026, 11, 6),
	today = LocalDate.of(2026, 11, 6),
	zone = ZoneId.of("America/Chicago"),
	view = CalendarView.MONTH,
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

private fun shellCalendarNops() = CalendarActions(
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
