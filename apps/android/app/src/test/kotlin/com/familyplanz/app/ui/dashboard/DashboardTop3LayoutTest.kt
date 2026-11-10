package com.familyplanz.app.ui.dashboard

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.familyplanz.app.data.DashboardDataDto
import com.familyplanz.app.data.DashboardDto
import com.familyplanz.app.data.FamilyMemberDto
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.data.VerseDto
import com.familyplanz.app.ui.alerts.L4TestShell
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDate

/** #303: at 380 dp the title owns the row and the priority controls flow beneath it. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w380dp-h2600dp")
class DashboardTop3LayoutTest {
	@get:Rule
	val rule = createComposeRule()

	private val shell = L4TestShell()

	private fun launch() {
		val vm = DashboardViewModel(FakeDashboardSource(payload())) { LocalDate.of(2026, 11, 3) }
		rule.setContent { shell.Provide { DashboardRoute(vm, AppNav(AppRoute.DASHBOARD)) } }
		rule.waitUntil(5_000) { !vm.ui.value.loading }
	}

	@Test
	fun the_title_owns_the_row_width_and_the_priority_controls_sit_below_it() {
		launch()
		val row = rule.onNodeWithTag("top3-row-t1", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
		val title = rule.onNodeWithTag("top3-title-t1", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
		val high = rule.onNodeWithTag("priority-t1-high", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
		val low = rule.onNodeWithTag("priority-t1-low", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
		// 8 padding + 16 number + 12 gap + 44 check + 12 gap + 8 padding = 100 dp of chrome; the title owns the rest.
		val chrome = 101 * rule.density.density
		assertTrue("title ${title.width} of row ${row.width}", title.width >= row.width - chrome)
		assertTrue("controls start below the title", low.top >= title.bottom)
		assertTrue("controls stay inside the row", high.right <= row.right)
	}
}

private fun payload() = DashboardDto(
	zone = "America/Chicago",
	dayISO = "2026-11-03T00:00:00.000-06:00",
	isToday = true,
	meId = "u1",
	familyId = "fam-1",
	dailyVerse = VerseDto("Ps 118:24", "This is the day which the LORD hath made; we will rejoice and be glad in it.", "KJV"),
	data = DashboardDataDto(
		familyMembers = listOf(
			FamilyMemberDto("u1", "Mum", "Smith"),
			FamilyMemberDto("u2", "Dad", "Smith"),
			FamilyMemberDto("u3", "Ada", "Smith"),
		),
		top3 = listOf(
			TaskDto(
				id = "t1",
				title = "Take out the recycling before the truck comes on Thursday morning",
				userId = "u1",
				dueDate = "2026-11-03T00:00:00.000Z",
				priority = "high",
				category = "Chores",
			),
		),
	),
)
