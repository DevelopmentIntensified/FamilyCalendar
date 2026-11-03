package com.familyplanz.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.R
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import java.time.LocalDate

/**
 * Month view grouped by the server's per-day `date` buckets; a selected day
 * narrows to that day's sections. Recurrence and multi-day splitting are
 * server work (issue 082 pipeline) — this screen renders only. The quick-add
 * panel sits above the list (parse = hint, user confirms creation).
 * Look (#291): the web CalendarToolbar (chevrons, List/Month toggle) over
 * the list, or the MonthDayCell grid; tapping a busy day opens its Day view.
 */
@Composable
fun CalendarScreen(
	state: CalendarUiState,
	quickAdd: QuickAddUiState,
	quickAddActions: QuickAddActions,
	actions: CalendarActions,
) {
	var monthGrid by rememberSaveable { mutableStateOf(false) }
	Column(modifier = Modifier.fillMaxSize()) {
		FpHeader(calendarTitle(state)) {
			MonthStepButton("Prev", R.drawable.ic_fp_chevron_left, leading = true, onClick = actions.onPrevMonth)
			MonthStepButton("Next", R.drawable.ic_fp_chevron_right, leading = false, onClick = actions.onNextMonth)
		}
		QuickAddPanel(state = quickAdd, actions = quickAddActions)
		ViewToggle(monthGrid) { monthGrid = it }
		if (monthGrid && !state.loading && state.errorText == null) {
			Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(bottom = 16.dp)) {
				MonthGrid(state.month, state.events, state.selectedDay, onSelectDay = {
					monthGrid = false
					actions.onSelectDay(it)
				})
			}
		} else {
			CalendarBody(state, actions.onSelectDay, actions.onClearDay, onRetry = actions.onPrevMonth)
		}
	}
}

@Composable
fun CalendarBody(
	state: CalendarUiState,
	onSelectDay: (String) -> Unit,
	onClearDay: () -> Unit,
	onRetry: () -> Unit,
) {
	Box(modifier = Modifier.fillMaxSize()) {
		when {
			state.loading -> LinearProgressIndicator(
				modifier = Modifier.fillMaxWidth().padding(16.dp),
			)

			state.errorText != null -> Column(
				modifier = Modifier.fillMaxSize().padding(24.dp),
				verticalArrangement = Arrangement.Center,
				horizontalAlignment = Alignment.CenterHorizontally,
			) {
				Text(state.errorText, style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textBody)
				TextButton(onClick = onRetry) { Text("Retry") }
			}

			else -> {
				val sections = if (state.selectedDay != null) {
					state.grouped.filter { it.day == state.selectedDay }
				} else {
					state.grouped
				}
				if (sections.isEmpty()) {
					FpEmptyState("No events this month", "Add events in the web app or via quick add.")
				} else {
					EventSections(sections, state.selectedDay != null, onSelectDay, onClearDay)
				}
			}
		}
	}
}

@Composable
private fun EventSections(
	sections: List<DaySection>,
	dayMode: Boolean,
	onSelectDay: (String) -> Unit,
	onClearDay: () -> Unit,
) {
	LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
		if (dayMode) {
			item {
				TextButton(onClick = onClearDay) { Text("All days") }
			}
		}
		sections.forEach { section ->
			item(key = "day-${section.day}") {
				DayHeading(section.day, dayMode, onSelectDay)
			}
			items(section.events, key = { "${section.day}-${it.id}" }) { event ->
				EventRow(event)
			}
		}
	}
}

/** Day group heading: semibold slate-700 date, today in primary, with the Day view link. */
@Composable
private fun DayHeading(day: String, dayMode: Boolean, onSelectDay: (String) -> Unit) {
	val isToday = day.take(10) == LocalDate.now().toString()
	Row(
		modifier = Modifier.fillMaxWidth().heightIn(min = 40.dp).padding(top = 8.dp),
		verticalAlignment = Alignment.CenterVertically,
	) {
		Text(
			dayHeading(day),
			style = MaterialTheme.typography.titleSmall,
			color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
			modifier = Modifier.weight(1f),
		)
		if (!dayMode) {
			TextButton(onClick = { onSelectDay(day) }) { Text("Day view") }
		}
	}
}

/**
 * chipShell, word density: white chip, 3dp rail in the calendar colour
 * (fallback slate-400), the kind's glyph (timed dot / all-day bar), title +
 * meta. MonthDayCell's chrome: rounded-[14px], slate-200 border.
 */
@Composable
private fun EventRow(event: CalendarEvent) {
	val rail = FpTheme.colors.chipRail
	Surface(
		shape = FpShape.Cell,
		color = MaterialTheme.colorScheme.surface,
		border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
		modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
	) {
		Row(modifier = Modifier.height(IntrinsicSize.Min).heightIn(min = 52.dp)) {
			Box(Modifier.width(3.dp).fillMaxHeight().background(rail))
			Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
				Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
					if (event.allDay) {
						Box(Modifier.size(width = 10.dp, height = 5.dp).clip(MaterialTheme.shapes.extraSmall).background(rail))
					} else {
						Box(Modifier.size(6.dp).clip(FpShape.Pill).background(rail))
					}
					Text(
						event.title,
						style = MaterialTheme.typography.bodyMedium,
						fontWeight = FontWeight.Medium,
						color = FpTheme.colors.textStrong,
					)
				}
				Text(
					eventMeta(event),
					style = MaterialTheme.typography.bodySmall,
					color = MaterialTheme.colorScheme.onSurfaceVariant,
				)
			}
		}
	}
}

internal fun eventMeta(event: CalendarEvent): String = buildList {
	if (event.allDay) {
		add("All day")
	} else {
		friendlyTime(event.startDate)?.let { add(it) }
	}
	event.location?.let { add(it) }
	event.rsvpStatus
		?.takeIf { it.isNotBlank() && it != "none" }
		?.let { add("rsvp: $it") }
	event.creatorName?.let { add("by $it") }
}.joinToString(" · ")

internal fun calendarTitle(state: CalendarUiState): String =
	if (state.selectedDay != null) {
		val date = java.time.LocalDate.parse(state.selectedDay)
		monthNameOf(date.month) + " ${date.dayOfMonth}, ${date.year}"
	} else {
		monthNameOf(state.month.month) + " ${state.month.year}"
	}

private val headingFormatter: java.time.format.DateTimeFormatter =
	java.time.format.DateTimeFormatter.ofPattern("EEE, MMM d", java.util.Locale.ENGLISH)

internal fun dayHeading(day: String): String =
	try {
		headingFormatter.format(java.time.LocalDate.parse(day.take(10)))
	} catch (_: java.time.DateTimeException) {
		day
	}

/**
 * Server timestamps are UTC ISO ("…Z"); display in the device zone.
 * Unparseable input falls back to the raw prefix (never crashes).
 */
internal fun friendlyTime(iso: String?): String? {
	if (iso.isNullOrBlank()) return null
	return try {
		val fmt = java.time.format.DateTimeFormatter.ofPattern("MMM d, h:mm a", java.util.Locale.ENGLISH)
		fmt.format(
			java.time.OffsetDateTime.parse(iso)
				.atZoneSameInstant(java.time.ZoneId.systemDefault()),
		)
	} catch (_: java.time.format.DateTimeParseException) {
		iso.take(16)
	}
}
