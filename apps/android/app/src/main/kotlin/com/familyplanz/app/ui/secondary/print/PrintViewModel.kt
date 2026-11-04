package com.familyplanz.app.ui.secondary.print

import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.PrintMonthDto
import com.familyplanz.app.data.PrintMonthRef
import com.familyplanz.app.data.PrintSource
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.secondary.PageViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Print (`/calendar/print`): the fridge-sheet month, walked with prev / next / "Jump to now". */
class PrintViewModel(private val source: PrintSource) : PageViewModel() {
	private val _ui = MutableStateFlow<Load<PrintMonthDto>>(Load.Loading)
	val ui: StateFlow<Load<PrintMonthDto>> = _ui

	/** null/null = the user's current month. */
	private var requested: PrintMonthRef? = null
	private var job: Job? = null

	init {
		load()
	}

	fun show(ref: PrintMonthRef) {
		requested = ref
		load()
	}

	fun jumpToNow() {
		requested = null
		load()
	}

	fun load() {
		_ui.value = Load.Loading
		job?.cancel()
		job = viewModelScope.launch {
			val ref = requested
			_ui.value = when (val r = source.month(ref?.year, ref?.month)) {
				is ApiResult.Ok -> Load.Loaded(r.value)
				is ApiResult.Err -> Load.Failed(describe(r.error))
			}
		}
	}
}
