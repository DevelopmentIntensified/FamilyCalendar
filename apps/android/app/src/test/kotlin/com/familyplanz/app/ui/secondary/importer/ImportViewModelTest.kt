package com.familyplanz.app.ui.secondary.importer

import android.os.Looper
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.testing.FakeImportSource
import com.familyplanz.app.testing.fixturesCommit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import java.util.Base64

/** #299: the import state machine over a fake source: calendars, preview, tick, commit, undo. */
@RunWith(RobolectricTestRunner::class)
class ImportViewModelTest {
	private val source = FakeImportSource()
	private val vm = ImportViewModel(source)

	/**
	 * Drains the main looper, allowing the launch that crossed Dispatchers.Default
	 * (base64 encoding) to resume on a later main-loop turn.
	 */
	private fun idle() {
		val looper = shadowOf(Looper.getMainLooper())
		repeat(40) {
			looper.idle()
			Thread.sleep(5)
		}
		looper.idle()
	}

	@Test
	fun calendars_load_and_the_first_one_is_the_default_target() {
		idle()

		assertEquals(listOf("Personal Calendar", "Family"), vm.ui.value.calendars.map { it.name })
		assertEquals("c1", vm.ui.value.calendarId)
		assertNull(vm.ui.value.pending)
	}

	@Test
	fun preview_sends_the_chosen_files_as_base64_and_follows_the_server_suggestion() {
		idle()
		vm.addFiles(listOf(PickedFile("family.ics", "BEGIN:VCALENDAR".toByteArray())))
		vm.preview()
		idle()

		val request = source.previews.single()
		assertEquals("c1", request.calendarId)
		assertEquals("family.ics", request.files.single().name)
		assertEquals("BEGIN:VCALENDAR", String(Base64.getDecoder().decode(request.files.single().contentBase64)))
		assertEquals(setOf("a"), vm.ui.value.picked)
		assertTrue(vm.ui.value.atDefault)
	}

	@Test
	fun an_empty_tick_set_cannot_be_committed_and_a_server_error_keeps_the_form() {
		idle()
		vm.addFiles(listOf(PickedFile("family.ics", "x".toByteArray())))
		vm.preview()
		idle()

		vm.select(Pick.None)
		vm.commit()
		idle()
		assertTrue(source.commits.isEmpty())

		source.commitResult = ApiResult.Err(ApiError.BadRequest("Nothing selected"))
		vm.select(Pick.All)
		vm.commit()
		idle()

		assertEquals("Nothing selected", vm.ui.value.error)
		assertNull(vm.ui.value.report)
	}

	@Test
	fun commit_posts_only_the_ticked_rows_whole_and_then_offers_undo() {
		idle()
		vm.addFiles(listOf(PickedFile("family.ics", "x".toByteArray())))
		vm.preview()
		idle()

		vm.select(Pick.All)
		vm.commit()
		idle()

		assertEquals(2, source.commits.single().picked.size)
		assertEquals("b", source.commits.single().picked.last()["key"].toString().trim('"'))
		assertEquals(fixturesCommit(), vm.ui.value.report)

		vm.undo()
		idle()

		assertEquals(listOf(2), source.undos.map { it.batch.size })
		assertEquals(2, vm.ui.value.undo?.removed)
	}

	@Test
	fun start_over_returns_to_the_upload_form_after_a_finished_import() {
		idle()
		vm.addFiles(listOf(PickedFile("family.ics", "x".toByteArray())))
		vm.preview()
		idle()
		vm.commit()
		idle()

		vm.startOver()

		assertTrue(vm.ui.value.chosen.isEmpty())
		assertNull(vm.ui.value.preview)
		assertNull(vm.ui.value.report)
	}

	@Test
	fun preview_without_a_file_is_refused_before_any_call() {
		idle()
		vm.preview()
		idle()

		assertEquals("Choose an .ics file to import.", vm.ui.value.error)
		assertTrue(source.previews.isEmpty())
	}

	@Test
	fun a_failed_calendar_load_can_be_retried() {
		source.calendarResult = ApiResult.Err(ApiError.Network("timeout"))
		val retrying = ImportViewModel(source)
		idle()
		assertEquals("Network problem (timeout)", retrying.ui.value.error)

		source.calendarResult = ApiResult.Ok(listOf(com.familyplanz.app.data.ImportCalendarDto("c9", "Family")))
		retrying.loadCalendars()
		idle()

		assertEquals("c9", retrying.ui.value.calendarId)
		assertNull(retrying.ui.value.error)
	}
}
