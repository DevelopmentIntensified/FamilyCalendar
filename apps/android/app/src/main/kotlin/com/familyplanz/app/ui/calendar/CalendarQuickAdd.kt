package com.familyplanz.app.ui.calendar

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.CalendarSource
import com.familyplanz.app.data.EventSource
import com.familyplanz.app.data.ParsedEventDto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The create form's Quick Add (#302): one debounced auto-parse as the user
 * types (the web's 300 ms), the user's cloud flag, and the phrase-report
 * door. The ViewModel owns the state; this class does the calls, so two
 * lanes never reach into each other's file.
 */
class CalendarQuickAdd(
	private val scope: CoroutineScope,
	private val events: EventSource,
	private val source: CalendarSource,
) {
	private var job: Job? = null

	/**
	 * Parse [phrase] (after the debounce when [auto]); [useCloud] is the
	 * user's cloud-AI setting. One result fills the form through [onParsed],
	 * a multi one offers the preview through [onParsedList], [onFail] turns
	 * on the amber fallback line. A second call cancels the first (a re-type
	 * beats a slow server), so a fast typist never double-parses.
	 */
	@Suppress("LongParameterList")
	fun parse(
		phrase: String,
		useCloud: Boolean,
		auto: Boolean,
		onParsed: (ParsedEventDto) -> Unit,
		onParsedList: (List<ParsedEventDto>) -> Unit,
		onFail: () -> Unit,
	) {
		val mine = scope.launch {
			if (auto) delay(AUTOPARSE_DELAY_MS)
			val result = events.parseQuickAdd(phrase, useCloud)
			if (!isActive) return@launch
			when (result) {
				is ApiResult.Ok -> {
					val multi = result.value.results
					val singles = if (multi.isNotEmpty()) multi.mapNotNull { it.parsed } else listOfNotNull(result.value.parsed)
					when {
						singles.size > 1 -> onParsedList(singles)
						singles.size == 1 -> onParsed(singles.first())
						else -> onFail()
					}
				}

				is ApiResult.Err -> onFail()
			}
		}
		job?.cancel()
		job = mine
	}

	/** Discard a pending auto parse (the form is closing, the text was cleared, a re-type beat me). */
	fun cancel() {
		job?.cancel()
		job = null
	}

	/** POST /api/report-phrase for the phrase the parser refused; a network failure stays retryable, all else settles. */
	fun report(phrase: String, onSettled: () -> Unit, onFail: () -> Unit) {
		scope.launch {
			when (val result = source.reportPhrase(phrase, EVENT_PARSE_SOURCE)) {
				is ApiResult.Ok -> onSettled()

				is ApiResult.Err -> when (result.error) {
					is ApiError.Network -> onFail()
					else -> onSettled()
				}
			}
		}
	}

	companion object {
		/** The web's 300 ms input debounce (`EventFormModal.svelte:319`). */
		const val AUTOPARSE_DELAY_MS = 300L

		/** The source the web reports with (`reportPhrase` `event_parse`). */
		const val EVENT_PARSE_SOURCE = "event_parse"
	}
}
