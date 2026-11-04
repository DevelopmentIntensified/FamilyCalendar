package com.familyplanz.app.ui.admin

import com.familyplanz.app.data.BugReportDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.ZoneId

/** #299: the admin registers' labels and the stored `matched` JSON sample. */
class AdminModelTest {
	private val utc = ZoneId.of("UTC")

	@Test
	fun area_and_source_labels_match_the_web_maps_and_pass_unknown_values_through() {
		assertEquals("Calendar", bugAreaLabel("calendar"))
		assertEquals("Payments", bugAreaLabel("payments"))
		assertEquals("something-new", bugAreaLabel("something-new"))
		assertEquals("Event parse", phraseSourceLabel("event_parse"))
		assertEquals("Bulk edit", phraseSourceLabel("bulk_edit"))
		assertEquals("other_source", phraseSourceLabel("other_source"))
	}

	@Test
	fun a_report_from_a_deleted_user_reads_as_anonymous() {
		assertEquals("Ada Lovelace", reporterName(BugReportDto(reporterFirstName = "Ada", reporterLastName = "Lovelace")))
		assertEquals("Anonymous / deleted", reporterName(BugReportDto()))
	}

	@Test
	fun the_matched_sample_keeps_its_non_empty_scalars_and_drops_nulls_and_false() {
		val summary = matchedSummary("""{"title":"meeting","allDay":false,"count":0,"empty":"","tags":["a","b"],"extra":null}""")

		assertEquals(mapOf("title" to "meeting", "count" to "0", "tags" to """["a","b"]"""), summary)
		assertNull(matchedSummary(null))
		assertNull(matchedSummary("  "))
		assertNull(matchedSummary("not json"))
		assertNull(matchedSummary("{}"))
	}

	@Test
	fun timestamps_read_as_the_page_writes_them() {
		assertEquals("Nov 3, 5:30 PM", reportedAtLabel("2026-11-03T17:30:00Z", utc))
		assertEquals("11/1/2026", firstSeenLabel("2026-11-01T12:00:00Z", utc))
		assertEquals("nope", reportedAtLabel("nope", utc))
		assertEquals("nope", firstSeenLabel("nope", utc))
	}
}
