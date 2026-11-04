package com.familyplanz.app.ui.secondary.stats

import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.StatsResponse
import com.familyplanz.app.data.StatsSource
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.secondary.PageViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Task stats (`/calendar/stats`): one G15 read, retried on demand. */
class StatsViewModel(private val source: StatsSource) : PageViewModel() {
	private val _ui = MutableStateFlow<Load<StatsResponse>>(Load.Loading)
	val ui: StateFlow<Load<StatsResponse>> = _ui

	init {
		load()
	}

	fun load() {
		_ui.value = Load.Loading
		viewModelScope.launch {
			_ui.value = when (val r = source.stats()) {
				is ApiResult.Ok -> Load.Loaded(r.value)
				is ApiResult.Err -> Load.Failed(describe(r.error))
			}
		}
	}
}
