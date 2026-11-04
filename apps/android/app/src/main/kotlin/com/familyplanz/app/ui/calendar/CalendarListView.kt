package com.familyplanz.app.ui.calendar

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.ui.calendar.chips.ChipDensity
import com.familyplanz.app.ui.calendar.chips.ChipKind
import com.familyplanz.app.ui.calendar.chips.ChipKindMark
import com.familyplanz.app.ui.calendar.chips.calendarNameFor
import com.familyplanz.app.ui.calendar.chips.chipColor
import com.familyplanz.app.ui.calendar.model.VisibleCalendar
import com.familyplanz.app.ui.calendar.model.dayTitle
import com.familyplanz.app.ui.calendar.model.eventsOn
import com.familyplanz.app.ui.calendar.model.monthDaysWithRows
import com.familyplanz.app.ui.calendar.model.tasksOn
import com.familyplanz.app.ui.calendar.model.timeRange
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate
import java.time.LocalDate

/*
 * ListView.svelte (#292 L2): the shown month grouped by day with sticky
 * headings, one card per event (colour bar, pills, meta row, chevron) and a
 * dashed card per task.
 */

@Composable
fun CalendarListView(state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions) {
	val days = monthDaysWithRows(state.month, visible.events, visible.tasks, state.zone)
	if (days.isEmpty()) {
		Column(
			modifier = Modifier.fillMaxWidth().padding(24.dp),
			horizontalAlignment = Alignment.CenterHorizontally,
			verticalArrangement = Arrangement.spacedBy(12.dp),
		) {
			Box(Modifier.alpha(0.8f)) { ListEmptyIllustration() }
			Text(
				"A whole month of nothing. Suspicious. Add something fun?",
				fontSize = 14.sp,
				color = FpTheme.colors.textMuted,
			)
		}
		return
	}
	LazyColumn(modifier = Modifier.fillMaxWidth().testTag("calendar-list")) {
		days.forEach { day ->
			stickyHeader(key = "head-$day") { DayHeading(day, day == state.today) }
			items(eventsOn(visible.events, day, state.zone), key = { "ev-${it.id}" }) { event ->
				EventCard(event, state, onTap = { actions.sheets.onOpen(CalendarSheet.Event(event)) })
			}
			items(tasksOn(visible.tasks, day), key = { "task-${it.id}" }) { task ->
				TaskCard(task, today = state.today, onTap = { actions.sheets.onOpen(CalendarSheet.Task(task)) })
			}
		}
	}
}

/** Sticky day heading: "EEEE, MMMM d" at 14 sp, primary when today, with the Today pill. */
@Composable
private fun DayHeading(day: LocalDate, today: Boolean) {
	Row(
		modifier = Modifier
			.fillMaxWidth()
			.background(MaterialTheme.colorScheme.background)
			.padding(horizontal = 16.dp, vertical = 8.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(8.dp),
	) {
		Text(
			dayTitle(day),
			fontSize = 14.sp,
			fontWeight = FontWeight.SemiBold,
			color = if (today) Primary.P600 else Slate.S500,
		)
		if (today) {
			Text(
				"Today",
				fontSize = 12.sp,
				fontWeight = FontWeight.Medium,
				color = Primary.P700,
				modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Primary.P100).padding(horizontal = 8.dp, vertical = 2.dp),
			)
		}
	}
}

@Composable
private fun EventCard(event: CalendarEvent, state: CalendarUiState, onTap: () -> Unit) {
	Surface(
		shape = MaterialTheme.shapes.medium,
		color = MaterialTheme.colorScheme.surface,
		border = BorderStroke(1.dp, Slate.S200),
		modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).clickable(onClick = onTap),
	) {
		Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
			Box(Modifier.width(4.dp).height(48.dp).clip(RoundedCornerShape(2.dp)).background(chipColor(event.color)))
			Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
				Text(
					event.title,
					fontSize = 15.sp,
					fontWeight = FontWeight.Medium,
					color = FpTheme.colors.textStrong,
					maxLines = 2,
					overflow = TextOverflow.Ellipsis,
				)
				Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
					val rsvp = com.familyplanz.app.ui.calendar.chips.rsvpVisual(event.rsvpStatus)
					rsvp?.let {
						Text(
							it.label,
							fontSize = 11.sp,
							fontWeight = FontWeight.Medium,
							color = it.tone.content,
							modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(it.tone.container).padding(horizontal = 6.dp, vertical = 1.dp),
						)
					}
					event.creatorName?.takeIf { it.isNotBlank() }?.let {
						Text("by $it", fontSize = 11.sp, color = FpTheme.colors.textMuted)
					}
					event.attendance?.takeIf { it.invited > 1 }?.let {
						Text("${it.going}/${it.invited} going", fontSize = 11.sp, color = FpTheme.colors.textMuted)
					}
				}
				MetaRow(event, state)
			}
			Text("\u203A", fontSize = 18.sp, color = Slate.S300)
		}
	}
}

/** Calendar dot + name (2+ calendars), the kind word, the clock and the pin. */
@Composable
private fun MetaRow(event: CalendarEvent, state: CalendarUiState) {
	Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
		val name = calendarNameFor(event.calendarId, state.data.calendarRefs)
		if (name.isNotEmpty()) {
			CalendarDot(event.color)
			Text(name, fontSize = 12.sp, color = FpTheme.colors.textMuted)
		}
		ChipKindMark(com.familyplanz.app.ui.calendar.chips.chipKindOf(event), chipColor(event.color), ChipDensity.WORD)
		Text(eventWhen(event, state.zone), fontSize = 12.sp, color = Slate.S500, maxLines = 1)
		event.location?.takeIf { it.isNotBlank() }?.let {
			Text(it, fontSize = 12.sp, color = FpTheme.colors.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(150.dp))
		}
	}
}

/** Task card: dashed look, slate-50 ground, the recurring rule in purple. */
@Composable
private fun TaskCard(task: CalendarTask, today: LocalDate, onTap: () -> Unit) {
	Surface(
		shape = MaterialTheme.shapes.medium,
		color = Slate.S50,
		border = BorderStroke(1.dp, com.familyplanz.app.ui.theme.FpTheme.colors.taskChipBorder),
		modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).clickable(onClick = onTap),
	) {
		Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
			Box(Modifier.size(9.dp).clip(com.familyplanz.app.ui.theme.FpShape.Pill).background(Slate.S400))
			Text(task.title, fontSize = 14.sp, color = Slate.S700, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
			ChipKindMark(ChipKind.TASK, Slate.S400, ChipDensity.WORD)
			task.recurrenceFrequency?.let {
				val unit = it.lowercase().removeSuffix("ly")
				Text(
					"every ${task.recurrenceInterval ?: 1} ${unit}s",
					fontSize = 11.sp,
					fontWeight = FontWeight.Medium,
					color = com.familyplanz.app.ui.theme.Accent.Purple500,
				)
			}
			if (task.dueDay < today) Text("overdue", fontSize = 11.sp, color = Accent.Red600)
		}
	}
}

