package com.familyplanz.app.ui.secondary.archive

import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.ArchiveResponse
import com.familyplanz.app.data.ArchiveSource
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.secondary.PageViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Archive (`/calendar/archive`): one G16 read; a plan without the archive arrives as a loaded gate, not an error. */
class ArchiveViewModel(private val source: ArchiveSource) : PageViewModel() {
	private val _ui = MutableStateFlow<Load<ArchiveResponse>>(Load.Loading)
	val ui: StateFlow<Load<ArchiveResponse>> = _ui

	init {
		load()
	}

	fun load() {
		_ui.value = Load.Loading
		viewModelScope.launch {
			_ui.value = when (val r = source.archive()) {
				is ApiResult.Ok -> Load.Loaded(r.value)
				is ApiResult.Err -> Load.Failed(describe(r.error))
			}
		}
	}
}
