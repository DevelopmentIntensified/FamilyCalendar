package com.familyplanz.app.ui.secondary.reportbug

import android.os.Looper
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.testing.FakeBugReportSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/** #299 AC-SP-3: POST /api/bug-report carries the screen the user came from. */
@RunWith(RobolectricTestRunner::class)
class ReportBugViewModelTest {
	private val source = FakeBugReportSource()
	private val vm = ReportBugViewModel(source)

	private fun idle() = shadowOf(Looper.getMainLooper()).idle()

	@Test
	fun ac_sp_3_submit_posts_the_chosen_area_description_and_the_screen_the_bug_was_on() {
		vm.setArea("tasks")
		vm.setDescription("  The task list forgets my filter.  ")
		vm.submit("/calendar/tasks?view=list")

		idle()

		val request = source.requests.single()
		assertEquals("tasks", request.area)
		assertEquals("The task list forgets my filter.", request.description)
		assertEquals("/calendar/tasks?view=list", request.url)
		assertTrue(vm.ui.value.submitted)
	}

	@Test
	fun a_missing_origin_reports_the_form_itself_as_the_web_does() {
		vm.setDescription("Something broke")
		vm.submit(null)
		idle()

		assertEquals(BUG_REPORT_PATH, source.requests.single().url)
	}

	@Test
	fun the_form_itself_protocol_relative_and_foreign_origins_are_never_reported() {
		assertEquals("", safeReportedPath(null))
		assertEquals("", safeReportedPath("/report-bug"))
		assertEquals("", safeReportedPath("/report-bug?area=tasks"))
		assertEquals("", safeReportedPath("/report-bug/thanks"))
		assertEquals("", safeReportedPath("//evil.example/x"))
		assertEquals("", safeReportedPath("https://evil.example/x"))
		assertEquals("/calendar", safeReportedPath(" /calendar "))
	}

	@Test
	fun an_empty_description_is_refused_locally_without_a_call_and_the_form_stays() {
		vm.submit("/calendar")

		assertTrue(source.requests.isEmpty())
		assertEquals("Please describe the bug.", vm.ui.value.error)
		assertTrue(!vm.ui.value.submitted)
	}

	@Test
	fun a_server_error_shows_inline_and_keeps_the_form() {
		source.result = ApiResult.Err(ApiError.BadRequest("Too many reports. Try again shortly."))
		vm.setDescription("Something broke")
		vm.submit("/calendar")
		idle()

		assertEquals("Too many reports. Try again shortly.", vm.ui.value.error)
		assertTrue(!vm.ui.value.submitted)
	}

	@Test
	fun the_description_is_capped_at_the_server_limit_and_typing_clears_the_error() {
		vm.submit("/calendar")
		vm.setDescription("x".repeat(BUG_MAX_LENGTH + 100))

		assertEquals(BUG_MAX_LENGTH, vm.ui.value.description.length)
		assertNull(vm.ui.value.error)
		idle()
		assertTrue(source.requests.isEmpty())
	}
}
