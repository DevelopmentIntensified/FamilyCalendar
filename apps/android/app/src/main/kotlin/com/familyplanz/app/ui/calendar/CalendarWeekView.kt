package com.familyplanz.app.ui.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.ui.calendar.chips.chipColor
import com.familyplanz.app.ui.calendar.model.HOUR_ROWS
import com.familyplanz.app.ui.calendar.model.TimedBlock
import com.familyplanz.app.ui.calendar.model.VisibleCalendar
import com.familyplanz.app.ui.calendar.model.WEEK_HOUR_DP
import com.familyplanz.app.ui.calendar.model.WEEK_MIN_WIDTH_DP
import com.familyplanz.app.ui.calendar.model.eventsOn
import com.familyplanz.app.ui.calendar.model.layoutDay
import com.familyplanz.app.ui.calendar.model.weekDays
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate
import java.time.LocalDate

/*
 * WeekView + WeekHeader + WeekAllDayRow + WeekHourGrid (#292 L2): a 700 dp
 * grid inside a horizontal scroll on a phone, 60 dp hour rows, all-day rows
 * above, and one block per event laid out by lane.
 */

@Composable
fun CalendarWeekView(state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions) {
	val days = weekDays(state.anchor, state.mondayFirst)
	val scroll = rememberScrollState()
	Column(modifier = Modifier.fillMaxWidth()) {
		Row(
			modifier = Modifier
				.fillMaxWidth()
				.horizontalScroll(scroll)
				.width(WEEK_MIN_WIDTH_DP.dp)
				.testTag("week-grid"),
		) {
			Box(Modifier.width(40.dp))
			days.forEach { day ->
				Column(
					modifier = Modifier.weight(1f).padding(vertical = 4.dp),
					horizontalAlignment = Alignment.CenterHorizontally,
				) {
					Text(
						day.dayOfWeek.name.take(3).lowercase().replaceFirstChar { it.uppercase() },
						fontSize = 10.sp,
						color = FpTheme.colors.textMuted,
					)
					Text(
						day.dayOfMonth.toString(),
						fontSize = 13.sp,
						fontWeight = FontWeight.Bold,
						color = if (day == state.today) Primary.P600 else FpTheme.colors.textBody,
					)
				}
			}
		}
		WeekAllDayRow(state, visible, days, scroll, actions)
		Row(
			modifier = Modifier
				.fillMaxWidth()
				.horizontalScroll(scroll)
				.width(WEEK_MIN_WIDTH_DP.dp)
				.height((HOUR_ROWS * WEEK_HOUR_DP).dp),
		) {
			Column(modifier = Modifier.width(40.dp)) {
				for (hour in 0 until HOUR_ROWS) {
					Box(Modifier.height(WEEK_HOUR_DP.dp).fillMaxWidth(), contentAlignment = Alignment.TopEnd) {
						Text("%02d".format(hour), fontSize = 9.sp, color = FpTheme.colors.textMuted, modifier = Modifier.padding(end = 4.dp))
					}
				}
			}
			days.forEach { day ->
				WeekDayColumn(day, state, visible, actions, Modifier.weight(1f))
			}
		}
	}
}

@Composable
private fun WeekAllDayRow(
	state: CalendarUiState,
	visible: VisibleCalendar,
	days: List<LocalDate>,
	scroll: androidx.compose.foundation.ScrollState,
	actions: CalendarActions,
) {
	val hasAny = days.any { day -> eventsOn(visible.events, day, state.zone).any { it.allDay } }
	if (!hasAny) return
	Row(modifier = Modifier.fillMaxWidth().horizontalScroll(scroll).width(WEEK_MIN_WIDTH_DP.dp).testTag("week-allday")) {
		Box(Modifier.width(40.dp))
		days.forEach { day ->
			Column(modifier = Modifier.weight(1f).padding(horizontal = 1.dp)) {
				eventsOn(visible.events, day, state.zone).filter { it.allDay }.forEach { event ->
					Text(
						event.title,
						fontSize = 10.sp,
						maxLines = 1,
						overflow = TextOverflow.Ellipsis,
						color = FpTheme.colors.textBody,
						modifier = Modifier
							.fillMaxWidth()
							.clip(RoundedCornerShape(4.dp))
							.background(chipColor(event.color).copy(alpha = 0.18f))
							.padding(horizontal = 2.dp, vertical = 1.dp)
							.clickable { actions.sheets.onOpen(CalendarSheet.Event(event)) },
					)
				}
			}
		}
	}
}

@Composable
private fun WeekDayColumn(day: LocalDate, state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions, modifier: Modifier) {
	val blocks = layoutDay(eventsOn(visible.events, day, state.zone), day, state.zone)
	Box(
		modifier = modifier
			.fillMaxWidth()
			.height((HOUR_ROWS * WEEK_HOUR_DP).dp)
			.background(MaterialTheme.colorScheme.surface)
			.padding(horizontal = 1.dp),
	) {
		for (hour in 1 until HOUR_ROWS) {
			Box(Modifier.fillMaxWidth().height(1.dp).padding(top = (hour * WEEK_HOUR_DP - 1).dp).background(Slate.S100))
		}
		blocks.forEach { block -> WeekBlock(block, actions) }
	}
}

@Composable
private fun WeekBlock(block: TimedBlock, actions: CalendarActions) {
	val minuteDp = WEEK_HOUR_DP / 60f
	val top = (block.startMin * minuteDp).dp
	val height = ((block.endMin - block.startMin) * minuteDp).dp
	val widthFraction = 1f / block.lanes
	Box(
		modifier = Modifier
			.fillMaxWidth(widthFraction)
			.padding(top = top, start = 1.dp, end = 1.dp)
			.height(height)
			.background(chipColor(block.event.color).copy(alpha = 0.18f), RoundedCornerShape(4.dp))
			.clickable { actions.sheets.onOpen(CalendarSheet.Event(block.event)) },
	) {
		Text(block.event.title, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(2.dp))
	}
}

/** The all-day list line used by DayView too. */
@Composable
fun AllDayRow(event: CalendarEvent, onClick: () -> Unit) {
	Row(
		modifier = Modifier
			.fillMaxWidth()
			.clip(RoundedCornerShape(6.dp))
			.background(chipColor(event.color).copy(alpha = 0.18f))
			.clickable(onClick = onClick)
			.padding(horizontal = 8.dp, vertical = 6.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(6.dp),
	) {
		Box(Modifier.width(3.dp).height(16.dp).clip(RoundedCornerShape(2.dp)).background(chipColor(event.color)))
		Text(event.title, fontSize = 13.sp, color = FpTheme.colors.textBody, maxLines = 1, overflow = TextOverflow.Ellipsis)
		Text("All day", fontSize = 11.sp, color = FpTheme.colors.textMuted)
	}
}

