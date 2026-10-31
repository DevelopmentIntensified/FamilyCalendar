package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.CalendarEvent
import java.time.LocalDate

/**
 * Month view grouped by the server's per-day `date` buckets; a selected day
 * narrows to that day's sections. Recurrence and multi-day splitting are
 * server work (issue 082 pipeline) — this screen only renders.
 */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun CalendarScreen(
	state: CalendarUiState,
	onPrevMonth: () -> Unit,
	onNextMonth: () -> Unit,
	onSelectDay: (String) -> Unit,
	onClearDay: () -> Unit,
) {
	Scaffold(
		topBar = {
			TopAppBar(
				title = { Text(calendarTitle(state)) },
				actions = {
					TextButton(onClick = onPrevMonth) { Text("Prev") }
					TextButton(onClick = onNextMonth) { Text("Next") }
				},
			)
		},
	) { padding ->
		Box(modifier = Modifier.padding(padding).fillMaxSize()) {
			when {
				state.loading -> LinearProgressIndicator(
					modifier = Modifier.fillMaxWidth().padding(16.dp),
				)

				state.errorText != null -> Column(
					modifier = Modifier.fillMaxSize().padding(24.dp),
					verticalArrangement = Arrangement.Center,
					horizontalAlignment = Alignment.CenterHorizontally,
				) {
					Text(state.errorText, style = MaterialTheme.typography.bodyMedium)
					TextButton(onClick = { onPrevMonth() }) { Text("Retry") }
				}

				else -> {
					val sections = if (state.selectedDay != null) {
						state.grouped.filter { it.day == state.selectedDay }
					} else {
						state.grouped
					}
					if (sections.isEmpty()) {
						Column(
							modifier = Modifier.fillMaxSize().padding(24.dp),
							verticalArrangement = Arrangement.Center,
							horizontalAlignment = Alignment.CenterHorizontally,
						) {
							Text("No events this month", style = MaterialTheme.typography.titleMedium)
							Text("Add events in the web app.", style = MaterialTheme.typography.bodyMedium)
						}
					} else {
						EventSections(sections, state.selectedDay != null, onSelectDay, onClearDay)
					}
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
	LazyColumn {
		if (dayMode) {
			item {
				TextButton(onClick = onClearDay) { Text("All days") }
			}
		}
		sections.forEach { section ->
			item(key = "day-${section.day}") {
				Row(
					modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
					verticalAlignment = Alignment.CenterVertically,
				) {
					Text(
						dayHeading(section.day),
						style = MaterialTheme.typography.titleSmall,
						color = MaterialTheme.colorScheme.primary,
					)
					if (!dayMode) {
						TextButton(onClick = { onSelectDay(section.day) }) { Text("Day view") }
					}
				}
				HorizontalDivider()
			}
			items(section.events, key = { "${section.day}-${it.id}" }) { event ->
				EventRow(event)
			}
		}
	}
}

@Composable
private fun EventRow(event: CalendarEvent) {
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
		Text(event.title, style = MaterialTheme.typography.bodyLarge)
		Text(
			eventMeta(event),
			style = MaterialTheme.typography.bodySmall,
			color = MaterialTheme.colorScheme.onSurfaceVariant,
		)
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
				.atZoneSameInstant(java.time.ZoneId.systemDefault())
		)
	} catch (_: java.time.format.DateTimeParseException) {
		iso.take(16)
	}
}
