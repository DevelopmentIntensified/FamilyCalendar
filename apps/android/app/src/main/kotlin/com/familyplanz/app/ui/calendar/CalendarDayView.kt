package com.familyplanz.app.ui.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.calendar.chips.chipColor
import com.familyplanz.app.ui.calendar.model.DAY_HOUR_DP
import com.familyplanz.app.ui.calendar.model.HOUR_ROWS
import com.familyplanz.app.ui.calendar.model.RangeSelection
import com.familyplanz.app.ui.calendar.model.TimedBlock
import com.familyplanz.app.ui.calendar.model.VisibleCalendar
import com.familyplanz.app.ui.calendar.model.dayTitle
import com.familyplanz.app.ui.calendar.model.eventsOn
import com.familyplanz.app.ui.calendar.model.formatRangeLabel
import com.familyplanz.app.ui.calendar.model.initialScrollHour
import com.familyplanz.app.ui.calendar.model.layoutDay
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate
import java.time.LocalDate
import java.time.LocalDateTime

/*
 * DayView + DayHeader + DayAllDayList + DayHourGrid (#292 L2): Back, the
 * date, 56 dp hour rows scrolled to (now - 1 h) or 07:00, the red now-line,
 * a long-press (450 ms) or Add-mode drag range select with its popover.
 */

@Composable
fun CalendarDayView(state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions) {
	val day = state.anchor
	val events = eventsOn(visible.events, day, state.zone)
	Column(modifier = Modifier.fillMaxWidth()) {
		Row(
			modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
			verticalAlignment = Alignment.CenterVertically,
			horizontalArrangement = Arrangement.spacedBy(8.dp),
		) {
			Box(
				modifier = Modifier
					.size(width = 44.dp, height = 36.dp)
					.clip(MaterialTheme.shapes.small)
					.background(MaterialTheme.colorScheme.surface)
					.clickable(onClickLabel = "Back", onClick = actions.nav.onBack)
					.semantics { contentDescription = "Back" },
				contentAlignment = Alignment.Center,
			) {
				Text("Back", fontSize = 13.sp, color = FpTheme.colors.textBody)
			}
			Text(
				dayTitle(day),
				fontSize = 20.sp,
				fontWeight = FontWeight.SemiBold,
				color = FpTheme.colors.textStrong,
				modifier = Modifier.weight(1f),
			)
			if (day == state.today) {
				Text(
					"Today",
					fontSize = 12.sp,
					fontWeight = FontWeight.Medium,
					color = Primary.P700,
					modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Primary.P100).padding(horizontal = 8.dp, vertical = 2.dp),
				)
			}
		}
		events.filter { it.allDay }.forEach { event ->
			AllDayRow(event) { actions.sheets.onOpen(CalendarSheet.Event(event)) }
		}
		if (events.isEmpty()) {
			Column(
				modifier = Modifier.fillMaxWidth().padding(24.dp),
				horizontalAlignment = Alignment.CenterHorizontally,
				verticalArrangement = Arrangement.spacedBy(12.dp),
			) {
				Text("Nothing scheduled. A free day is a gift - or add something fun.", fontSize = 14.sp, color = FpTheme.colors.textMuted)
				CalendarCta("Add event") { actions.form.onCreate(day, null) }
			}
		}
		DayHourGrid(day, state, actions, events)
		state.range?.let { range -> RangePopover(range, state, actions) }
	}
}

@Composable
private fun DayHourGrid(day: LocalDate, state: CalendarUiState, actions: CalendarActions,
	events: List<com.familyplanz.app.domain.CalendarEvent>) {
	val density = LocalDensity.current
	val scroll = rememberScrollState()
	val blocks = layoutDay(events, day, state.zone)
	val hourPx = with(density) { DAY_HOUR_DP.dp.toPx() }
	var anchorMinute by remember(day) { mutableIntStateOf(-1) }
	LaunchedEffect(day) {
		val hour = initialScrollHour(day, LocalDateTime.now())
		scroll.scrollTo(with(density) { (hour * DAY_HOUR_DP).dp.roundToPx() })
	}
	Box(
		modifier = Modifier
			.fillMaxWidth()
			.height(360.dp)
			.verticalScroll(scroll)
			.pointerInput(day, state.addMode, hourPx) {
				if (state.addMode) {
					detectDragGestures(
						onDragStart = { pos -> anchorMinute = minuteAt(pos.y + scroll.value, hourPx) },
						onDrag = { change, _ ->
							if (anchorMinute >= 0) {
								actions.modes.onRange(RangeSelection.of(day, anchorMinute, minuteAt(change.position.y + scroll.value, hourPx)))
							}
						},
					)
				} else {
					detectTapGestures(
						onLongPress = { pos -> actions.modes.onRange(RangeSelection.longPress(day, minuteAt(pos.y + scroll.value, hourPx))) },
					)
				}
			}
			.testTag("day-grid"),
	) {
		Column(modifier = Modifier.fillMaxWidth().height((HOUR_ROWS * DAY_HOUR_DP).dp)) {
			for (hour in 0 until HOUR_ROWS) {
				Row(modifier = Modifier.fillMaxWidth().height(DAY_HOUR_DP.dp)) {
					Text(
						"%02d".format(hour),
						fontSize = 10.sp,
						fontWeight = FontWeight.Medium,
						color = Slate.S400,
						modifier = Modifier.width(32.dp).padding(end = 4.dp),
					)
					Box(Modifier.fillMaxWidth().height(1.dp).background(Slate.S100))
				}
			}
		}
		blocks.forEach { block -> DayBlock(block, actions) }
		NowLine(day, state)
		state.range?.let { range -> RangeHighlight(range) }
	}
}

private fun minuteAt(yPx: Float, hourPx: Float): Int = (yPx / hourPx * 60f).toInt().coerceIn(0, 24 * 60)

@Composable
private fun DayBlock(block: TimedBlock, actions: CalendarActions) {
	val minuteDp = DAY_HOUR_DP / 60f
	Box(
		modifier = Modifier
			.fillMaxWidth()
			.padding(top = (block.startMin * minuteDp).dp, start = 36.dp, end = 4.dp)
			.height(((block.endMin - block.startMin) * minuteDp).dp)
			.clip(RoundedCornerShape(6.dp))
			.background(MaterialTheme.colorScheme.surface)
			.clickable { actions.sheets.onOpen(CalendarSheet.Event(block.event)) },
	) {
		Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
			modifier = Modifier.padding(4.dp)) {
			Box(Modifier.width(3.dp).height(18.dp).clip(RoundedCornerShape(2.dp)).background(chipColor(block.event.color)))
			Text(block.event.title, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
		}
	}
}

/** `bg-red-400` at the current minute, only on today (AC-CAL-21). */
@Composable
private fun NowLine(day: LocalDate, state: CalendarUiState) {
	val now = LocalDateTime.now()
	if (day != state.today) return
	val offset = now.toLocalTime().toSecondOfDay() / 60 * (DAY_HOUR_DP / 60f)
	Box(Modifier.fillMaxWidth().padding(top = offset.dp).height(1.dp).background(Accent.Red400))
}

@Composable
private fun RangeHighlight(range: RangeSelection) {
	val minuteDp = DAY_HOUR_DP / 60f
	Box(
		Modifier
			.padding(top = (range.startMin * minuteDp).dp, start = 36.dp, end = 4.dp)
			.height(((range.endMin - range.startMin) * minuteDp).dp)
			.fillMaxWidth()
			.background(Primary.P100.copy(alpha = 0.7f)),
	)
}

/** "-15", "+15", "Create", close: each 44 dp (AC-CAL-23). */
@Composable
private fun RangePopover(range: RangeSelection, state: CalendarUiState, actions: CalendarActions) {
	Surface(
		shape = MaterialTheme.shapes.medium,
		color = MaterialTheme.colorScheme.surface,
		shadowElevation = 8.dp,
		modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp).testTag("range-popover"),
	) {
		Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
			Text(formatRangeLabel(range), fontSize = 12.sp, color = FpTheme.colors.textBody, modifier = Modifier.weight(1f))
			PopoverButton("-15") { actions.modes.onRange(range.stepEnd(-15)) }
			PopoverButton("+15") { actions.modes.onRange(range.stepEnd(15)) }
			PopoverButton("Create") { actions.form.onCreate(state.anchor, range) }
			PopoverButton("Close", contentLabel = "Close range picker") { actions.modes.onRange(null) }
		}
	}
}

@Composable
private fun PopoverButton(label: String, contentLabel: String? = null, onClick: () -> Unit) {
	Box(
		modifier = Modifier
			.size(width = 44.dp, height = 44.dp)
			.clickable(role = androidx.compose.ui.semantics.Role.Button, onClick = onClick)
			.semantics { if (contentLabel != null) contentDescription = contentLabel },
		contentAlignment = Alignment.Center,
	) {
		Text(label, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Primary.P700)
	}
}

