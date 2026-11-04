package com.familyplanz.app.ui.secondary.archive

import com.familyplanz.app.data.ArchiveEventDto
import com.familyplanz.app.testing.fixturesArchive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

/** #299 AC-SP-2: month grouping, retention bands and the plan-gate copy, away from the screen. */
class ArchiveModelTest {
	private val utc = ZoneId.of("UTC")

	@Test
	fun events_group_into_months_newest_first_and_the_undated_ones_last() {
		val months = groupEventsByMonth(fixturesArchive().events, utc)

		assertEquals(listOf("November 2026", "October 2026", "Date unknown"), months.map { it.label })
		assertEquals(listOf("2026-11", "2026-10", "unknown"), months.map { it.key })
		assertEquals(listOf("Autumn fair"), months.first().events.map { it.title })
	}

	@Test
	fun a_month_sorts_its_own_rows_newest_first() {
		val events = listOf(
			ArchiveEventDto("a", "Morning", "2026-11-02T08:00:00Z"),
			ArchiveEventDto("b", "Evening", "2026-11-02T20:00:00Z"),
			ArchiveEventDto("c", "Later day", "2026-11-03T09:00:00Z"),
		)

		val november = groupEventsByMonth(events, utc).single()

		assertEquals(listOf("Later day", "Evening", "Morning"), november.events.map { it.title })
	}

	@Test
	fun row_and_count_wording_follows_the_web() {
		assertEquals("3 Nov 2026", archiveEventDate("2026-11-03T10:00:00Z", utc))
		assertEquals("", archiveEventDate("not-a-date", utc))
		assertEquals("1 event", eventCount(1))
		assertEquals("3 events", eventCount(3))
		assertEquals("1 family", familyPill(1))
		assertEquals("2 families", familyPill(2))
	}

	@Test
	fun the_retention_track_is_viewable_now_then_kept_then_deleted() {
		val scale = retentionScale(viewDays = 30, archivedDays = 90)

		assertEquals(90, scale.total)
		assertEquals(30, scale.viewable)
		assertEquals(60, scale.kept)
		assertEquals(90, scale.deletedAfter)
		assertEquals(33, scale.viewablePct)
	}

	@Test
	fun a_view_window_larger_than_the_archive_fills_the_whole_track() {
		val scale = retentionScale(viewDays = 120, archivedDays = 90)

		assertEquals(90, scale.viewable)
		assertEquals(0, scale.kept)
		assertEquals(100, scale.viewablePct)
	}

	@Test
	fun a_plan_with_no_windows_fills_nothing() {
		val scale = retentionScale(viewDays = 0, archivedDays = 0)

		assertEquals(0, scale.total)
		assertEquals(0, scale.viewablePct)
		assertTrue(groupEventsByMonth(emptyList(), utc).isEmpty())
	}
}
