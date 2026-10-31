package com.familyplanz.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.TaskRepository
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.EventMapper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.Month
import java.time.YearMonth

/** Per-day bucket; the server already returned day-sized entries. */
data class DaySection(val day: String, val events: List<CalendarEvent> = emptyList())

data class CalendarUiState(
	val month: YearMonth,
	val events: List<CalendarEvent> = emptyList(),
	val grouped: List<DaySection> = emptyList(),
	val loading: Boolean = false,
	val selectedDay: String? = null,
	val unauthorized: Boolean = false,
	val errorText: String? = null,
)

/**
 * Month fetch (one ≤62d window) + client-side day filtering. Move/refresh
 * always refetches the whole month; 401 surfaces through `unauthorized`
 * so the host can swap to the token screen.
 */
class CalendarViewModel(private val repository: TaskRepository) : ViewModel() {
	private val _ui = MutableStateFlow(CalendarUiState(month = YearMonth.now()))
	val ui: StateFlow<CalendarUiState> = _ui

	init {
		viewModelScope.launch { load(YearMonth.now()) }
	}

	fun move(delta: Long) {
		viewModelScope.launch { load(_ui.value.month.plusMonths(delta)) }
	}

	fun refresh() {
		viewModelScope.launch { load(_ui.value.month) }
	}

	fun selectDay(day: String) {
		_ui.value = _ui.value.copy(selectedDay = day)
	}

	fun clearDay() {
		_ui.value = _ui.value.copy(selectedDay = null)
	}

	private suspend fun load(month: YearMonth) {
		_ui.value = _ui.value.copy(
			month = month,
			loading = true,
			errorText = null,
			unauthorized = false,
		)
		when (val result = repository.monthEvents(month.year, month.monthValue)) {
			is ApiResult.Ok -> {
				val mapped = result.value.map(EventMapper::fromDto)
				val grouped = monthSections(mapped, month)
				_ui.value = _ui.value.copy(
					loading = false,
					events = mapped,
					grouped = grouped,
				)
			}

			is ApiResult.Err -> _ui.value = when (val error = result.error) {
				ApiError.Unauthorized -> _ui.value.copy(loading = false, unauthorized = true)
				else -> _ui.value.copy(loading = false, errorText = error.message)
			}
		}
	}
}

/**
 * The server page window pads ±7 days around the grid, so a month fetch
 * returns neighbouring-month rows too; bucket strictly to the shown month.
 */
internal fun monthSections(mapped: List<CalendarEvent>, month: YearMonth): List<DaySection> {
	val prefix = "%04d-%02d".format(month.year, month.monthValue)
	return mapped
		.filter { it.day.take(7) == prefix }
		.groupBy { it.day }
		.toSortedMap()
		.entries
		.map { DaySection(it.key, it.value.sortedBy { e -> e.startDate }) }
}

internal fun monthNameOf(month: Month): String =
	month.name.lowercase().replaceFirstChar { it.uppercase() }
