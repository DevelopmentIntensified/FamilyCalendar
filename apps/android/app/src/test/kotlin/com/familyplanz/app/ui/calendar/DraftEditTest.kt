package com.familyplanz.app.ui.calendar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** One-field draft edits keep the rest and re-derive `needsTitle`. */
class DraftEditTest {
	private val draft = QuickAddUiState.Draft(
		title = "Dinner",
		needsTitle = false,
		date = "2026-11-06",
		startTime = "19:00",
		endTime = null,
		location = null,
		allDay = false,
		attendants = listOf("a1"),
		method = "llm",
	)

	@Test
	fun `each edit changes only its field`() {
		val cases = listOf(
			DraftEdit.Title("Supper") to draft.copy(title = "Supper"),
			DraftEdit.Date("2026-11-07") to draft.copy(date = "2026-11-07"),
			DraftEdit.StartTime("18:30") to draft.copy(startTime = "18:30"),
			DraftEdit.EndTime("20:00") to draft.copy(endTime = "20:00"),
			DraftEdit.Location("the park") to draft.copy(location = "the park"),
			DraftEdit.AllDay(true) to draft.copy(allDay = true),
		)
		cases.forEach { (edit, expected) -> assertEquals(edit.toString(), expected, draft.applying(edit)) }
	}

	@Test
	fun `blank title flags needsTitle and a real one clears it`() {
		val blank = draft.applying(DraftEdit.Title("  "))
		assertTrue(blank.needsTitle)
		assertFalse(blank.applying(DraftEdit.Title("Dinner")).needsTitle)
	}

	@Test
	fun `non-title edit re-derives needsTitle from the current title`() {
		val stale = draft.copy(title = "", needsTitle = false)
		assertTrue(stale.applying(DraftEdit.Location("home")).needsTitle)
	}
}
