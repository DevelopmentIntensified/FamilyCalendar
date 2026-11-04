package com.familyplanz.app.ui.secondary.stats

import com.familyplanz.app.data.StatsPersonDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

/** #299 AC-SP-1: the streak grid, the bar scaling and the month labels, away from the screen. */
class StatsModelTest {
	private val utc = ZoneId.of("UTC")

	@Test
	fun `seven ISO weeks end with the week that holds today`() {
		val cells = recentWeekCells(emptyList(), "2026-11-04", utc)

		assertEquals(7, cells.size)
		assertEquals(listOf("2026-W39", "2026-W40", "2026-W41", "2026-W42", "2026-W43", "2026-W44", "2026-W45"), cells.map { it.key })
		assertEquals(listOf("W1", "W2", "W3", "W4", "W5", "W6", "W7"), cells.map { it.label })
		assertTrue(cells.last().isCurrent)
		assertEquals(1, cells.count { it.isCurrent })
		assertFalse(cells.any { it.hit })
	}

	@Test
	fun `several completions in one week light one square`() {
		val completions = listOf(
			"2026-10-26T12:00:00Z",
			"2026-11-02T08:00:00Z",
			"2026-11-02T19:00:00Z",
		)

		val cells = recentWeekCells(completions, "2026-11-04", utc)

		assertEquals(listOf("2026-W44", "2026-W45"), cells.filter { it.hit }.map { it.key })
		assertEquals(5, cells.count { !it.hit })
	}

	@Test
	fun a_completion_whose_instant_will_not_parse_lights_nothing() {
		val cells = recentWeekCells(listOf("not-a-date", ""), "2026-11-04", utc)

		assertFalse(cells.any { it.hit })
	}

	@Test
	fun a_completion_is_dated_in_the_given_zone_before_it_is_put_in_a_week() {
		// 2026-11-02T01:00Z is still Sunday Nov 1 in Los Angeles, so it belongs to W44 there and W45 in UTC.
		val la = ZoneId.of("America/Los_Angeles")

		val utcCells = recentWeekCells(listOf("2026-11-02T01:00:00Z"), "2026-11-04", utc)
		val laCells = recentWeekCells(listOf("2026-11-02T01:00:00Z"), "2026-11-04", la)

		assertTrue(utcCells.last().hit)
		assertTrue(laCells[5].hit)
		assertFalse(laCells.last().hit)
	}

	@Test
	fun bars_scale_against_the_largest_row() {
		val bars = assignmentBars(listOf(StatsPersonDto("Ada", 4), StatsPersonDto("Ben", 2), StatsPersonDto("Cleo", 1)))

		assertEquals(listOf("Ada", "Ben", "Cleo"), bars.map { it.name })
		assertEquals(listOf(100, 50, 25), bars.map { it.pct })
		assertEquals(listOf(4, 2, 1), bars.map { it.total })
	}

	@Test
	fun an_all_zero_bar_set_stays_at_zero_width_and_an_empty_set_is_empty() {
		assertEquals(listOf(0, 0), assignmentBars(listOf(StatsPersonDto("Ada", 0), StatsPersonDto("Ben", 0))).map { it.pct })
		assertTrue(assignmentBars(emptyList()).isEmpty())
	}

	@Test
	fun month_and_completion_labels_follow_the_web_wording() {
		assertEquals("November 2026", monthCompletionLabel("2026-11-04", utc))
		assertEquals("Nov 3", completedLabel("2026-11-03T17:00:00Z", utc))
		assertEquals("", completedLabel("", utc))
		assertEquals(null, monthCompletionLabel("nope", utc))
	}
}
