package com.familyplanz.app.ui.family

import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import com.familyplanz.app.data.ActivityRowDto
import com.familyplanz.app.data.FamilyDetailDto
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.math.abs

/**
 * #306: the feed row is the web's one sentence (`+page.svelte:593-606`) and a
 * relative time pinned to the row's end; the sentence alone wraps.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w320dp-h1600dp")
class FamilyActivityBandTest {
	@get:Rule
	val rule = createComposeRule()

	private val twoHoursAgo = Instant.now().minus(2, ChronoUnit.HOURS).toString()

	private fun show(vararg rows: ActivityRowDto) {
		rule.setContent { FamilyPlanzTheme { ActivityBand(FamilyDetailDto(activity = rows.toList())) } }
		rule.waitForIdle()
	}

	private fun boundsOf(tag: String): Rect =
		rule.onNodeWithTag(tag, useUnmergedTree = true).fetchSemanticsNode().boundsInRoot

	// --- Part A: the sentence itself -------------------------------------

	@Test
	fun a_completed_row_reads_as_the_web_sentence() {
		val row = ActivityRowDto(kind = "completed", title = "Mow lawn", actorName = "Sam")
		assertEquals("✅ Sam completed 'Mow lawn'", activitySentence(row))
	}

	@Test
	fun an_assigned_row_names_the_assignee() {
		val row = ActivityRowDto(kind = "assigned", title = "Mow lawn", actorName = "Sam", targetName = "Ada")
		assertEquals("📋 Sam assigned 'Mow lawn' to Ada", activitySentence(row))
	}

	@Test
	fun an_assigned_row_without_a_target_omits_the_to_part() {
		val row = ActivityRowDto(kind = "assigned", title = "Mow lawn", actorName = "Sam", targetName = null)
		assertEquals("📋 Sam assigned 'Mow lawn'", activitySentence(row))
	}

	@Test
	fun a_completed_row_ignores_a_target() {
		val row = ActivityRowDto(kind = "completed", title = "Mow lawn", actorName = "Sam", targetName = "Ada")
		assertEquals("✅ Sam completed 'Mow lawn'", activitySentence(row))
	}

	@Test
	fun an_unknown_kind_reads_as_assigned() {
		val row = ActivityRowDto(kind = "renamed", title = "Mow lawn", actorName = "Sam", targetName = "Ada")
		assertEquals("📋 Sam assigned 'Mow lawn' to Ada", activitySentence(row))
	}

	// --- Part B: the row layout ------------------------------------------

	@Test
	fun a_long_title_wraps_and_both_times_end_on_the_row_edge() {
		show(
			ActivityRowDto(
				kind = "completed",
				title = "Take the recycling, the glass and the cardboard out to the kerb before the truck comes",
				actorName = "Sam",
				at = twoHoursAgo,
			),
			ActivityRowDto(kind = "completed", title = "Milk", actorName = "Sam", at = twoHoursAgo),
		)
		val row0 = boundsOf("activity-row-0")
		val text0 = boundsOf("activity-text-0")
		val time0 = boundsOf("activity-time-0")
		val time1 = boundsOf("activity-time-1")
		assertTrue(
			"the sentence and the time share one row without overlap " +
				"(text $text0 time $time0 row $row0)",
			time0.left >= text0.right,
		)
		assertTrue("the time stays inside the row", time0.right <= row0.right)
		assertTrue("both times end on the same edge", abs(time0.right - time1.right) < 1f)
	}

	@Test
	fun the_time_is_relative_never_an_iso_date() {
		show(ActivityRowDto(kind = "completed", title = "Mow lawn", actorName = "Sam", at = twoHoursAgo))
		rule.onNodeWithTag("activity-time-0", useUnmergedTree = true).assertTextEquals("2 hours ago")
	}

	@Test
	fun a_row_without_a_timestamp_shows_no_time() {
		show(ActivityRowDto(kind = "completed", title = "Mow lawn", actorName = "Sam", at = null))
		assertTrue(
			"no time node",
			rule.onAllNodesWithTag("activity-time-0", useUnmergedTree = true).fetchSemanticsNodes().isEmpty(),
		)
	}

	@Test
	fun the_empty_feed_keeps_the_pages_copy() {
		show()
		rule.onNodeWithText(NO_ACTIVITY_COPY).assertExists()
	}
}
