package com.familyplanz.app.ui.calendar

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.ui.calendar.model.MonthCell
import com.familyplanz.app.ui.calendar.model.CalendarEmpty
import com.familyplanz.app.ui.calendar.model.VisibleCalendar
import com.familyplanz.app.ui.calendar.model.cellPlan
import com.familyplanz.app.ui.calendar.model.eventsOn
import com.familyplanz.app.ui.calendar.model.isWeekendWash
import com.familyplanz.app.ui.calendar.model.monthCells
import com.familyplanz.app.ui.calendar.model.tasksOn
import com.familyplanz.app.ui.calendar.model.weekdayLabels
import com.familyplanz.app.ui.theme.FpDayDiscText
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate
import java.time.LocalDate

/*
 * MonthView + MonthDays + MonthDayCell (#292 L2): weekday header rotated by
 * weekStart, seven columns with no gap on a phone, every cell exactly 72 dp,
 * up to three event chips and two task chips then "+N more".
 */

/** The fixed cell height every row keeps whatever it holds (AC-CAL-4). */
val CELL_HEIGHT = 72.dp

@Composable
fun CalendarMonthGrid(state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions) {
	val zone = state.zone
	val cells = monthCells(state.month, state.mondayFirst)
	Column(modifier = Modifier.fillMaxWidth()) {
		Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
			weekdayLabels(state.mondayFirst).forEach {
				Text(
					it.uppercase(),
					fontSize = 12.sp,
					fontWeight = FontWeight.SemiBold,
					letterSpacing = 0.5.sp,
					color = Slate.S500,
					textAlign = TextAlign.Center,
					modifier = Modifier.weight(1f).padding(vertical = 8.dp),
				)
			}
		}
		cells.chunked(7).forEach { week ->
			Row(modifier = Modifier.fillMaxWidth()) {
				week.forEach { cell ->
					DayCell(
						cell = cell,
						today = state.today,
						selectionMode = state.selectionMode,
						selectedIds = state.selectedIds,
						events = eventsOn(visible.events, cell.date, zone),
						tasks = tasksOn(visible.tasks, cell.date),
						onTap = { actions.sheets.onCellTap(cell.date) },
						onMore = { actions.sheets.onOpen(CalendarSheet.DayEvents(cell.date)) },
						onToggle = actions.modes.onToggleSelect,
						modifier = Modifier.weight(1f),
					)
				}
			}
		}
		if (visible.empty == CalendarEmpty.NONE && visible.events.isEmpty() && visible.tasks.isEmpty()) {
			Text(
				"Nothing on this month yet.",
				fontSize = 13.sp,
				color = FpTheme.colors.textMuted,
				modifier = Modifier.fillMaxWidth().padding(16.dp),
				textAlign = TextAlign.Center,
			)
		}
	}
}

@Composable
private fun RowScope.DayCell(
	cell: MonthCell,
	today: LocalDate,
	selectionMode: Boolean,
	selectedIds: Set<String>,
	events: List<com.familyplanz.app.domain.CalendarEvent>,
	tasks: List<CalendarTask>,
	onTap: () -> Unit,
	onMore: () -> Unit,
	onToggle: (String) -> Unit,
	modifier: Modifier = Modifier,
) {
	val isToday = cell.date == today
	val plan = cellPlan(events.size, tasks.size)
	val surface = when {
		cell.otherMonth -> FpTheme.colors.otherMonthCellSurface
		isToday -> Primary.P50.copy(alpha = 0.4f)
		else -> MaterialTheme.colorScheme.surface
	}
	val border = when {
		cell.otherMonth -> BorderStroke(1.dp, FpTheme.colors.otherMonthCellBorder)
		isToday -> BorderStroke(1.dp, FpTheme.colors.todayCellBorder)
		else -> BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
	}
	Surface(
		shape = FpShape.Cell,
		color = Color.Transparent,
		border = border,
		modifier = modifier
			.height(CELL_HEIGHT)
			.testTag("cell-${cell.date}")
			.semantics { contentDescription = "Open ${cell.date}" }
			.clip(FpShape.Cell)
			.then(
				if (isWeekendWash(cell)) {
					Modifier.background(Brush.verticalGradient(listOf(CalTone.WeekendTop, MaterialTheme.colorScheme.surface)))
				} else {
					Modifier.background(surface)
				},
			)
			.clickable(onClick = onTap),
	) {
		Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
			Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
				Box(
					modifier = Modifier
						.size(28.dp)
						.clip(FpShape.Pill)
						.background(if (isToday) Primary.P600 else Color.Transparent),
					contentAlignment = Alignment.Center,
				) {
					Text(
						cell.date.dayOfMonth.toString(),
						style = FpDayDiscText,
						color = when {
							isToday -> Color.White
							cell.otherMonth -> Slate.S400
							else -> Slate.S600
						},
					)
				}
			}
			events.take(plan.eventChips).forEach { event ->
				SelectionChip(
					selected = selectionMode && event.id in selectedIds,
					selectionMode = selectionMode,
					onToggle = { onToggle(event.id) },
				) {
					EventChip(event)
				}
			}
			tasks.take(plan.taskChips).forEach { task -> TaskChip(task, today) }
			if (plan.more > 0) {
				Text(
					"+${plan.more} more",
					fontSize = 11.sp,
					fontWeight = FontWeight.Medium,
					color = Slate.S600,
					maxLines = 1,
					overflow = TextOverflow.Ellipsis,
					modifier = Modifier
						.height(16.dp)
						.testTag("more-${cell.date}")
						.clickable(onClick = onMore)
						.padding(horizontal = 1.dp),
				)
			}
		}
	}
}

/** In selection mode a chip is a toggle wearing a 12 dp checkbox square (AC-CAL-32). */
@Composable
private fun SelectionChip(
	selected: Boolean,
	selectionMode: Boolean,
	onToggle: () -> Unit,
	chip: @Composable () -> Unit,
) {
	if (!selectionMode) {
		chip()
		return
	}
	Row(
		modifier = Modifier
			.fillMaxWidth()
			.clip(RoundedCornerShape(6.dp))
			.then(if (selected) Modifier.background(Primary.P50) else Modifier)
			.clickable(onClick = onToggle)
			.padding(end = 1.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(2.dp),
	) {
		Box(
			modifier = Modifier
				.size(12.dp)
				.clip(RoundedCornerShape(3.dp))
				.background(if (selected) Primary.P600 else Slate.S200),
		)
		Box(modifier = Modifier.weight(1f)) { chip() }
	}
}
