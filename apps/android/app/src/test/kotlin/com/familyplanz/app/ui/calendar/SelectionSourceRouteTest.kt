package com.familyplanz.app.ui.calendar

import android.content.Intent
import android.os.Looper
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.CreateEventRequest
import com.familyplanz.app.data.EventDto
import com.familyplanz.app.data.EventSource
import com.familyplanz.app.data.EventTextExtractor
import com.familyplanz.app.data.OnDeviceEventExtractor
import com.familyplanz.app.data.OnDeviceFirstExtractorChain
import com.familyplanz.app.data.ParsedEventDto
import com.familyplanz.app.data.QuickParseResponse
import com.familyplanz.app.data.ServerEventExtractor
import com.familyplanz.app.ui.gesture.FakeRepository
import com.familyplanz.app.ui.nav.SELECTION_PREFIX
import com.familyplanz.app.ui.nav.SHARE_TEXT_PREFIX
import com.familyplanz.app.ui.nav.navArgText
import java.time.LocalDate
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

/**
 * #311: a selection rides the same route-argument slot as a reminder's day and
 * a share's text (#312), and the device-first chain falls back to the server.
 */
class SelectionSourceRouteTest {
	@Test
	fun `a selection argument reads as the phrase, not a day`() {
		val (day, text) = navArgText("sel:Dinner Friday 7pm")
		assertNull(day)
		assertEquals("Dinner Friday 7pm", text)
	}

	@Test
	fun `a bare date argument still reads as a reminder day`() {
		val (day, text) = navArgText("2027-03-05")
		assertEquals(LocalDate.of(2027, 3, 5), day)
		assertNull(text)
	}

	@Test
	fun `a null on-device parse falls back to the server`() = runBlocking {
		val nothing = object : EventTextExtractor {
			override suspend fun extract(text: String): ParsedEventDto? = null
		}
		val chain = OnDeviceFirstExtractorChain(
			nothing,
			ServerEventExtractor(
				source(ApiResult.Ok(QuickParseResponse(parsed = ParsedEventDto(title = "Dinner", date = "2026-11-13")))),
			),
		)
		assertEquals("Dinner", chain.parseSelected("Dinner Friday 7pm").title)
	}

	@Test
	fun `the selection prefix is its own and never reads as a share`() {
		assertEquals("sel:", SELECTION_PREFIX)
		assertNotEquals(SHARE_TEXT_PREFIX, SELECTION_PREFIX)
	}

	/** The four EventSource calls the adapters may make; only the parse is answered here. */
	private fun source(result: ApiResult<QuickParseResponse>) = object : EventSource {
		override suspend fun monthEvents(year: Int, month: Int): ApiResult<List<EventDto>> = error("not used")

		override suspend fun parseQuickAdd(input: String, useCloud: Boolean): ApiResult<QuickParseResponse> = result

		override suspend fun createEvent(request: CreateEventRequest): ApiResult<EventDto> = error("not used")

		override suspend fun cachedEvents(year: Int, month: Int): List<EventDto>? = null
	}
}

/** #311: the sheet's chip opens the create form with the share ack and the device parse already applied. */
@RunWith(RobolectricTestRunner::class)
class SelectionCreateAckTest {
	private val today = LocalDate.of(2026, 11, 10)

	@Test
	fun `a selected phrase opens the form with the ack and the device parse`() {
		val repo = FakeRepository()
		val vm = CalendarViewModel(
			repo,
			selectionExtractor = OnDeviceFirstExtractorChain(OnDeviceEventExtractor { today }, ServerEventExtractor(repo)),
		)
		shadowOf(Looper.getMainLooper()).idle()

		vm.openCreateFromSelection("Dinner Friday 7pm")
		shadowOf(Looper.getMainLooper()).idle()

		val ui = vm.ui.value
		assertEquals("Dinner Friday 7pm", ui.quickAdd)
		assertEquals(CalendarViewModel.SHARED_TARGET_ACK, ui.toast)
		assertTrue(ui.sheet is CalendarSheet.Form)
		val form = (ui.sheet as? CalendarSheet.Form)?.form
		assertEquals("2026-11-13", form?.date)
		assertEquals("19:00", form?.startTime)
	}
}

/** #311's system entry: selected text offers this app's process-text action, so the manifest cannot drop it. */
@RunWith(RobolectricTestRunner::class)
class ProcessTextIntentResolvesTest {
	@Test
	fun `selected text offers this app`() {
		val pm = RuntimeEnvironment.getApplication().packageManager
		val intent = Intent(Intent.ACTION_PROCESS_TEXT).apply { type = "text/plain" }
		val mine = pm.queryIntentActivities(intent, 0).firstOrNull { it.activityInfo.packageName == "com.familyplanz.app" }
		assertNotNull("ACTION_PROCESS_TEXT mimeType text/plain resolves to this app", mine)
		assertEquals("MainActivity", mine?.activityInfo?.name?.substringAfterLast('.'))
	}
}
