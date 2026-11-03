package com.familyplanz.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.ui.theme.FpDayDiscText
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth

/*
 * The web month grid (MonthView + MonthDayCell, issue 291): Monday-first
 * (MonthView preferedFirstDayOfWeek), 14dp-radius white cells on a
 * slate-200 border, today washed primary-50 with a primary-600 disc, the
 * weekend on the paper wash, and the chip vocabulary's glyph view — at a
 * phone's cell width the month is marks, not titles (#068).
 */

private val WEEKDAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

/** Monday-first grid for [month]: leading nulls, then every day, padded to whole weeks. */
internal fun monthCells(month: YearMonth): List<LocalDate?> {
	val lead = month.atDay(1).dayOfWeek.value - DayOfWeek.MONDAY.value
	val days = (1..month.lengthOfMonth()).map(month::atDay)
	val cells = List<LocalDate?>(lead) { null } + days
	val trail = (7 - cells.size % 7) % 7
	return cells + List(trail) { null }
}

@Composable
internal fun MonthGrid(
	month: YearMonth,
	events: List<CalendarEvent>,
	selectedDay: String?,
	onSelectDay: (String) -> Unit,
	today: LocalDate = LocalDate.now(),
) {
	val byDay = events.groupBy { it.day.take(10) }
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
		Row(modifier = Modifier.fillMaxWidth()) {
			WEEKDAYS.forEach {
				Text(
					it,
					style = MaterialTheme.typography.labelSmall,
					color = FpTheme.colors.textMuted,
					textAlign = TextAlign.Center,
					modifier = Modifier.weight(1f),
				)
			}
		}
		monthCells(month).chunked(7).forEach { week ->
			Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
				week.forEach { date ->
					if (date == null) {
						Box(Modifier.weight(1f))
					} else {
						val iso = date.toString()
						DayCell(date, byDay[iso].orEmpty(), date == today, iso == selectedDay) { onSelectDay(iso) }
					}
				}
			}
		}
	}
}

@Composable
private fun RowScope.DayCell(
	date: LocalDate,
	events: List<CalendarEvent>,
	isToday: Boolean,
	selected: Boolean,
	onClick: () -> Unit,
) {
	val colors = FpTheme.colors
	val weekend = date.dayOfWeek == DayOfWeek.SATURDAY || date.dayOfWeek == DayOfWeek.SUNDAY
	val surface = when {
		isToday -> colors.todayCellSurface
		weekend -> colors.weekendCellSurface
		else -> MaterialTheme.colorScheme.surface
	}
	val border = when {
		selected -> BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
		isToday -> BorderStroke(1.dp, colors.todayCellBorder)
		else -> BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
	}
	Surface(
		shape = FpShape.Cell,
		color = surface,
		border = border,
		modifier = Modifier
			.weight(1f)
			.height(56.dp)
			.clip(FpShape.Cell)
			.then(if (events.isNotEmpty()) Modifier.clickable(onClick = onClick) else Modifier),
	) {
		Column(modifier = Modifier.padding(4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
			Box(
				modifier = Modifier
					.size(24.dp)
					.clip(FpShape.Pill)
					.background(if (isToday) MaterialTheme.colorScheme.primary else Color.Transparent),
				contentAlignment = Alignment.Center,
			) {
				Text(
					date.dayOfMonth.toString(),
					style = FpDayDiscText,
					color = if (isToday) MaterialTheme.colorScheme.onPrimary else colors.textBody,
				)
			}
			ChipMarks(events)
		}
	}
}

/** chipVocabulary glyphs: timed = 6dp dot, all-day = 10x5 bar, in the calendar colour (fallback slate-400). */
@Composable
private fun ChipMarks(events: List<CalendarEvent>) {
	if (events.isEmpty()) return
	val rail = FpTheme.colors.chipRail
	Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
		events.take(MAX_MARKS).forEach { event ->
			if (event.allDay) {
				Box(Modifier.width(10.dp).height(5.dp).clip(MaterialTheme.shapes.extraSmall).background(rail))
			} else {
				Box(Modifier.size(6.dp).clip(FpShape.Pill).background(rail))
			}
		}
		if (events.size > MAX_MARKS) {
			Text("+${events.size - MAX_MARKS}", style = MaterialTheme.typography.labelSmall, color = FpTheme.colors.textMuted)
		}
	}
}

private const val MAX_MARKS = 3
