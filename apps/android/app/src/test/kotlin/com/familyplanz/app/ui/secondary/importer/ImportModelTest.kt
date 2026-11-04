package com.familyplanz.app.ui.secondary.importer

import com.familyplanz.app.data.ImportFileSummaryDto
import com.familyplanz.app.data.ImportPreviewDto
import com.familyplanz.app.testing.fixturesPreviewDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** #299: the import page's local checks and tick-set rules, away from the screen. */
class ImportModelTest {
	@Test
	fun a_pick_of_no_file_too_many_files_or_an_oversized_file_is_refused_with_the_server_words() {
		assertEquals("Choose an .ics file to import.", fileProblem(emptyList()))
		assertEquals("Choose up to 10 files at a time.", fileProblem(List(11) { PickedFile("$it.ics", ByteArray(1)) }))
		assertEquals("big.ics is larger than 5 MB.", fileProblem(listOf(PickedFile("big.ics", ByteArray(IMPORT_MAX_FILE_BYTES + 1)))))
		assertNull(fileProblem(listOf(PickedFile("ok.ics", ByteArray(IMPORT_MAX_FILE_BYTES)))))
	}

	@Test
	fun the_tick_set_starts_at_the_server_suggestion_and_every_change_is_applied_to_it() {
		val preview = importPreviewOf(fixturesPreviewDto())

		assertEquals(setOf("a", "b"), applyPick(Pick.Toggle("b", true), null, preview))
		assertEquals(emptySet<String>(), applyPick(Pick.Toggle("a", false), null, preview))
		assertEquals(setOf("a", "b"), applyPick(Pick.All, null, preview))
		assertEquals(emptySet<String>(), applyPick(Pick.None, setOf("a"), preview))
		assertEquals(emptySet<String>(), applyPick(Pick.DropFile("family.ics"), setOf("a", "b"), preview))
		assertNull(applyPick(Pick.Suggested, setOf("b"), preview))
	}

	@Test
	fun a_row_carries_the_fields_the_preview_card_draws() {
		val item = importPreviewOf(fixturesPreviewDto()).items.last()

		assertEquals("Dentist", item.title)
		assertEquals("Tue, Nov 3, 9:00 AM", item.whenText)
		assertEquals("Town hall", item.location)
		assertTrue(item.duplicate)
		assertEquals(DuplicateReason.ALREADY_ON_CALENDAR, item.reason)
		assertEquals("Likely duplicate — already on Personal Calendar", item.reason?.note?.format("Personal Calendar"))
	}

	@Test
	fun the_first_landed_day_is_the_earliest_and_unparseable_days_are_left_out() {
		assertEquals("2026-11-03" to "Tue, Nov 3, 2026", firstLandedLabel(listOf("2026-11-05T09:00:00Z", "2026-11-03T09:00:00Z")))
		assertEquals(null, firstLandedLabel(listOf("nope")))
		assertEquals(null, firstLandedLabel(emptyList()))
	}

	@Test
	fun counts_and_file_sizes_use_the_page_wording() {
		assertEquals("1 event", plural(1, "event"))
		assertEquals("2 events", plural(2, "event"))
		assertEquals("1 KB", sizeLabel(0))
		assertEquals("2 KB", sizeLabel(2048))
		assertEquals("2 KB", sizeLabel(1536))
	}

	@Test
	fun an_empty_preview_still_says_what_was_in_the_file() {
		val preview = importPreviewOf(
			ImportPreviewDto(
				calendarId = "c1",
				calendarName = "Personal Calendar",
				fileName = "empty.ics",
				files = listOf(ImportFileSummaryDto("empty.ics", events = 0, duplicates = 0)),
			),
		)

		assertTrue(preview.items.isEmpty())
		assertTrue(preview.defaultSelection.isEmpty())
	}
}
