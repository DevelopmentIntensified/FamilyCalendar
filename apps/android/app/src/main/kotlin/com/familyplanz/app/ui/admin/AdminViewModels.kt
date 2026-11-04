package com.familyplanz.app.ui.admin

import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.AdminBugsDto
import com.familyplanz.app.data.AdminCountsDto
import com.familyplanz.app.data.AdminNlpDto
import com.familyplanz.app.data.AdminSource
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.secondary.PageViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The "Admin" landing page: the two open counts (G19 `GET /api/admin`). */
class AdminViewModel(private val source: AdminSource) : PageViewModel() {
	private val _ui = MutableStateFlow<Load<AdminCountsDto>>(Load.Loading)
	val ui: StateFlow<Load<AdminCountsDto>> = _ui

	init {
		load()
	}

	fun load() {
		_ui.value = Load.Loading
		viewModelScope.launch {
			_ui.value = when (val r = source.counts()) {
				is ApiResult.Ok -> Load.Loaded(r.value)
				is ApiResult.Err -> Load.Failed(describe(r.error))
			}
		}
	}
}

/** What the admin tab strip shows beside each tab name (0 until the counts arrive). */
data class AdminBadges(val bugs: Int = 0, val phrases: Int = 0)

/** Bug Reports: the register plus Resolve, which moves a row to "Resolved" at once and puts it back if the server says no. */
class AdminBugsViewModel(private val source: AdminSource) : PageViewModel() {
	private val _ui = MutableStateFlow<Load<AdminBugsDto>>(Load.Loading)
	val ui: StateFlow<Load<AdminBugsDto>> = _ui

	private val _badges = MutableStateFlow(AdminBadges())
	val badges: StateFlow<AdminBadges> = _badges

	init {
		load()
	}

	fun load() {
		_ui.value = Load.Loading
		viewModelScope.launch {
			val counts = source.counts()
			if (counts is ApiResult.Ok) _badges.value = AdminBadges(counts.value.openBugs, counts.value.openPhrases)
			_ui.value = when (val r = source.bugs()) {
				is ApiResult.Ok -> Load.Loaded(r.value)
				is ApiResult.Err -> Load.Failed(describe(r.error))
			}
		}
	}

	fun resolve(id: String) {
		val before = (_ui.value as? Load.Loaded)?.value ?: return
		val report = before.open.firstOrNull { it.id == id } ?: return
		_ui.value = Load.Loaded(before.copy(open = before.open - report, resolved = listOf(report) + before.resolved))
		_badges.update { it.copy(bugs = (it.bugs - 1).coerceAtLeast(0)) }
		viewModelScope.launch {
			if (source.resolveBug(id) is ApiResult.Err) {
				_ui.value = Load.Loaded(before)
				_badges.update { it.copy(bugs = it.bugs + 1) }
				showSnack("Couldn't resolve that report — try again.")
			}
		}
	}
}

/** Unmatched Phrases: the register plus Resolve, same optimistic move as the bugs. */
class AdminNlpViewModel(private val source: AdminSource) : PageViewModel() {
	private val _ui = MutableStateFlow<Load<AdminNlpDto>>(Load.Loading)
	val ui: StateFlow<Load<AdminNlpDto>> = _ui

	private val _badges = MutableStateFlow(AdminBadges())
	val badges: StateFlow<AdminBadges> = _badges

	init {
		load()
	}

	fun load() {
		_ui.value = Load.Loading
		viewModelScope.launch {
			val counts = source.counts()
			if (counts is ApiResult.Ok) _badges.value = AdminBadges(counts.value.openBugs, counts.value.openPhrases)
			_ui.value = when (val r = source.nlp()) {
				is ApiResult.Ok -> Load.Loaded(r.value)
				is ApiResult.Err -> Load.Failed(describe(r.error))
			}
		}
	}

	fun resolve(id: String) {
		val before = (_ui.value as? Load.Loaded)?.value ?: return
		val phrase = before.phrases.firstOrNull { it.id == id } ?: return
		_ui.value = Load.Loaded(before.copy(phrases = before.phrases - phrase, resolved = listOf(phrase) + before.resolved))
		_badges.update { it.copy(phrases = (it.phrases - 1).coerceAtLeast(0)) }
		viewModelScope.launch {
			if (source.resolvePhrase(id) is ApiResult.Err) {
				_ui.value = Load.Loaded(before)
				_badges.update { it.copy(phrases = it.phrases + 1) }
				showSnack("Couldn't resolve that phrase — try again.")
			}
		}
	}
}
