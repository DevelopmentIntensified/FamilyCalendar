package com.familyplanz.app.ui.calendar

import android.os.Looper
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.CalendarSource
import com.familyplanz.app.data.CreateEventRequest
import com.familyplanz.app.data.EventDto
import com.familyplanz.app.data.EventSource
import com.familyplanz.app.data.ParsedEventDto
import com.familyplanz.app.data.QuickParseResponse
import com.familyplanz.app.data.QuickParseResult
import com.familyplanz.app.data.UnavailableCalendarSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import java.time.Duration

/** #302: the Quick Add delegate — debounce, single/multi results, the cloud flag, the phrase report. */
@RunWith(RobolectricTestRunner::class)
class CalendarQuickAddTest {
	/** Every event call is refused except the parse this test scripts. */
	private class QuickSource : EventSource {
		var quick: () -> ApiResult<QuickParseResponse> = { ApiResult.Err(ApiError.Unsupported) }
		val requests = mutableListOf<Pair<String, Boolean>>()

		override suspend fun monthEvents(year: Int, month: Int): ApiResult<List<EventDto>> =
			ApiResult.Err(ApiError.Unsupported)

		override suspend fun cachedEvents(year: Int, month: Int): List<EventDto>? = null

		override suspend fun createEvent(request: CreateEventRequest): ApiResult<EventDto> =
			ApiResult.Err(ApiError.Unsupported)

		override suspend fun parseQuickAdd(input: String, useCloud: Boolean): ApiResult<QuickParseResponse> {
			requests += input to useCloud
			return quick()
		}
	}

	/** Every calendar call is refused except the phrase report this test scripts. */
	private class QuickReports : CalendarSource by UnavailableCalendarSource {
		val reported = mutableListOf<String>()
		var answer: ApiResult<Unit> = ApiResult.Ok(Unit)

		override suspend fun reportPhrase(phrase: String, source: String): ApiResult<Unit> {
			reported += phrase
			return answer
		}
	}

	/** What the delegate's three callbacks said. */
	private class Seen {
		var parsed: ParsedEventDto? = null
		var list: List<ParsedEventDto>? = null
		var failed = false
	}

	private val events = QuickSource()
	private val reports = QuickReports()
	private val quickAdd = CalendarQuickAdd(CoroutineScope(Dispatchers.Main.immediate), events, reports)

	/**
	 * Runs the main looper past the auto-parse debounce: Robolectric's clock is
	 * frozen until a test advances it, so plain idle() never fires delay().
	 */
	private fun idle() =
		shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(CalendarQuickAdd.AUTOPARSE_DELAY_MS + 1))

	private fun parse(phrase: String, useCloud: Boolean = true, auto: Boolean = false): Seen {
		val seen = Seen()
		quickAdd.parse(
			phrase = phrase,
			useCloud = useCloud,
			auto = auto,
			onParsed = { seen.parsed = it },
			onParsedList = { seen.list = it },
			onFail = { seen.failed = true },
		)
		return seen
	}

	private fun single(title: String) =
		ApiResult.Ok(QuickParseResponse(parsed = ParsedEventDto(title = title, date = "2026-11-06")))

	@Test
	fun `a_single_result_fills_the_form`() {
		events.quick = { single("Dinner") }
		val seen = parse("dinner friday at 7")
		idle()
		assertEquals("Dinner", seen.parsed?.title)
		assertEquals(listOf("dinner friday at 7" to true), events.requests)
	}

	@Test
	fun `a_multi_result_offers_the_pair`() {
		events.quick = {
			ApiResult.Ok(
				QuickParseResponse(
					results = listOf(
						QuickParseResult(ParsedEventDto(title = "Dinner", date = "2026-11-06"), 0.9),
						QuickParseResult(ParsedEventDto(title = "Movie", date = "2026-11-07"), 0.55),
					),
					method = "regex-list",
				),
			)
		}
		val seen = parse("dinner friday and movie saturday")
		idle()
		assertEquals(listOf("Dinner", "Movie"), seen.list?.map { it.title })
		assertNull(seen.parsed)
		assertFalse(seen.failed)
	}

	@Test
	fun `no_result_reports_a_failure`() {
		events.quick = { ApiResult.Ok(QuickParseResponse()) }
		val seen = parse("dinner friday")
		idle()
		assertTrue(seen.failed)
		assertNull(seen.parsed)
		assertNull(seen.list)
	}

	@Test
	fun `an_auto_parse_waits_the_debounce_that_a_retype_beats`() {
		events.quick = { single("Dinner") }
		parse("dinner friday", auto = true)
		parse("dinner", auto = true)
		idle()
		assertEquals(1, events.requests.size)
		assertEquals("dinner" to true, events.requests.single())
	}

	@Test
	fun `cancel_skips_a_pending_auto_parse`() {
		events.quick = { single("Dinner") }
		parse("dinner friday", auto = true)
		quickAdd.cancel()
		idle()
		assertTrue(events.requests.isEmpty())
	}

	@Test
	fun `carrying_the_users_cloud_flag_off`() {
		events.quick = { single("Dinner") }
		parse("dinner", useCloud = false)
		idle()
		assertEquals("dinner" to false, events.requests.single())
	}

	@Test
	fun `a_report_settles_the_affordance`() {
		var settled = false
		var retryable = false
		quickAdd.report("zzz", onSettled = { settled = true }, onFail = { retryable = true })
		idle()
		assertTrue(settled)
		assertFalse(retryable)
		assertEquals(listOf("zzz"), reports.reported)
	}

	@Test
	fun `a_network_report_stays_retryable`() {
		reports.answer = ApiResult.Err(ApiError.Network("offline"))
		var settled = false
		var retryable = false
		quickAdd.report("zzz", onSettled = { settled = true }, onFail = { retryable = true })
		idle()
		assertTrue(retryable)
		assertFalse(settled)
	}

	@Test
	fun `a_rate_limited_report_still_settles`() {
		reports.answer = ApiResult.Err(ApiError.Server("Too many reports. Try again shortly."))
		var settled = false
		var retryable = false
		quickAdd.report("zzz", onSettled = { settled = true }, onFail = { retryable = true })
		idle()
		assertTrue(settled)
		assertFalse(retryable)
	}
}
