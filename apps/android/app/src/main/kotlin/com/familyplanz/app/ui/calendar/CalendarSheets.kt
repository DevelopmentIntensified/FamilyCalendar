package com.familyplanz.app.ui.calendar

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.calendar.chips.ChipDensity
import com.familyplanz.app.ui.calendar.chips.chipColor
import com.familyplanz.app.ui.calendar.chips.chipKindOf
import com.familyplanz.app.ui.calendar.model.VisibleCalendar
import com.familyplanz.app.ui.calendar.model.dayTitle
import com.familyplanz.app.ui.calendar.model.eventsOn
import com.familyplanz.app.ui.calendar.model.tasksOn
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate
import java.time.LocalDate

/*
 * DayActionSheet + DayEventsModal + the mini month picker (#292 L2). The
 * sheet's four rows are in the web's order; the day-events overlay lists
 * everything that day plus its tasks.
 */

@Composable
fun DayActionSheet(day: LocalDate, state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions) {
	val events = eventsOn(visible.events, day, state.zone)
	CalendarSheetShell(onClose = actions.sheets.onClose, modifier = Modifier.testTag("day-action-sheet")) {
		SheetTitle(dayTitle(day), closeLabel = "Close") { actions.sheets.onClose() }
		if (events.isNotEmpty()) {
			Column(
				modifier = Modifier
					.fillMaxWidth()
					.heightIn(max = 200.dp)
					.verticalScroll(rememberScrollState()),
			) {
				events.forEach { event ->
					Row(
						modifier = Modifier
							.fillMaxWidth()
							.clickable {
								actions.sheets.onClose()
								actions.sheets.onOpen(CalendarSheet.Event(event))
							}
							.padding(horizontal = 16.dp, vertical = 10.dp),
						verticalAlignment = Alignment.CenterVertically,
						horizontalArrangement = Arrangement.spacedBy(8.dp),
					) {
						com.familyplanz.app.ui.calendar.chips.ChipKindMark(chipKindOf(event), chipColor(event.color), ChipDensity.WORD)
						Column(modifier = Modifier.weight(1f)) {
							Text(event.title, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Slate.S800,
								maxLines = 1, overflow = TextOverflow.Ellipsis)
							Text(
								eventWhen(event, state.zone) + (event.creatorName?.let { " - by $it" } ?: ""),
								fontSize = 12.sp,
								color = Slate.S500,
							)
						}
						Text("\u203A", fontSize = 16.sp, color = Slate.S300)
					}
				}
			}
		}
		Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
			ActionRow("Add event", primary = false) {
				actions.sheets.onClose()
				actions.form.onCreate(day, null)
			}
			ActionRow("Open Day Dashboard", primary = false) { actions.sheets.onMenu(CalendarMenuAction.DASHBOARD) }
			ActionRow("View this day's events", primary = false) { actions.sheets.onOpen(CalendarSheet.DayEvents(day)) }
			ActionRow("Open Day View", primary = false) {
				actions.sheets.onClose()
				actions.nav.onOpenDay(day)
			}
		}
	}
}

/** One 44 dp action row with a 36 dp icon disc (DayActionSheet.svelte). */
@Composable
private fun ActionRow(label: String, primary: Boolean, onClick: () -> Unit) {
	Row(
		modifier = Modifier
			.fillMaxWidth()
			.heightIn(min = 48.dp)
			.clip(RoundedCornerShape(12.dp))
			.background(MaterialTheme.colorScheme.surface)
			.then(Modifier.padding(0.dp))
			.clickable(role = Role.Button, onClick = onClick)
			.padding(horizontal = 12.dp, vertical = 10.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(12.dp),
	) {
		Box(
			modifier = Modifier
				.size(36.dp)
				.clip(FpShape.Pill)
				.background(if (primary) Primary.P100 else Slate.S100),
		)
		Text(label, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Slate.S700)
	}
}

/** DayEventsModal: the formatted date, every event, then the day's tasks. */
@Composable
fun DayEventsModal(day: LocalDate, state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions) {
	val events = eventsOn(visible.events, day, state.zone)
	val tasks = tasksOn(visible.tasks, day)
	CalendarSheetShell(onClose = actions.sheets.onClose, modifier = Modifier.testTag("day-events-modal")) {
		SheetTitle(dayTitle(day), closeLabel = "Close day events overlay") { actions.sheets.onClose() }
		Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 12.dp)) {
			events.forEach { event ->
				Surface(
					shape = MaterialTheme.shapes.medium,
					color = MaterialTheme.colorScheme.surface,
					border = BorderStroke(1.dp, Slate.S200),
					modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable {
						actions.sheets.onClose()
						actions.sheets.onOpen(CalendarSheet.Event(event))
					},
				) {
					Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
						Text(event.title, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Slate.S900)
						Text(
							eventWhen(event, state.zone) + (event.location?.let { " - $it" } ?: ""),
							fontSize = 12.sp,
							color = Slate.S500,
						)
					}
				}
			}
			if (tasks.isNotEmpty()) {
				SectionKicker("Tasks")
				tasks.forEach { task ->
					Text(
						task.title + " - Due task - tap for details",
						fontSize = 14.sp,
						color = Slate.S700,
						modifier = Modifier
							.fillMaxWidth()
							.clickable {
								actions.sheets.onClose()
								actions.sheets.onOpen(CalendarSheet.Task(task))
							}
							.padding(horizontal = 8.dp, vertical = 10.dp),
					)
				}
			}
		}
		Box(Modifier.padding(bottom = 16.dp))
	}
}

/** MiniMonthPicker: year row then a 3 x 4 grid of MMM buttons (AC-CAL-11). */
@Composable
fun MonthPickerSheet(year: Int, state: CalendarUiState, actions: CalendarActions) {
	val months = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
	CalendarSheetShell(onClose = actions.sheets.onClose, modifier = Modifier.testTag("month-picker")) {
		SheetTitle("$year", closeLabel = "Close month picker") { actions.sheets.onClose() }
		Row(
			modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
			verticalAlignment = Alignment.CenterVertically,
			horizontalArrangement = Arrangement.spacedBy(8.dp),
		) {
			YearArrow("Previous year", "\u2039") { actions.sheets.onOpen(CalendarSheet.MonthPicker(year - 1)) }
			Box(Modifier.weight(1f))
			YearArrow("Next year", "\u203A") { actions.sheets.onOpen(CalendarSheet.MonthPicker(year + 1)) }
		}
		Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
			months.chunked(3).forEach { week ->
				Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
					week.forEach { name ->
						val monthValue = months.indexOf(name) + 1
						val current = state.month.year == year && state.month.monthValue == monthValue
						Box(
							modifier = Modifier
								.weight(1f)
								.heightIn(min = 44.dp)
								.clip(MaterialTheme.shapes.small)
								.background(if (current) Primary.P600 else MaterialTheme.colorScheme.surface)
								.border(BorderStroke(1.dp, Slate.S200), MaterialTheme.shapes.small)
								.clickable {
									actions.sheets.onClose()
									actions.nav.onPickMonth(java.time.YearMonth.of(year, monthValue))
								},
							contentAlignment = Alignment.Center,
						) {
							Text(name, fontSize = 14.sp, color = if (current) Slate.S50 else Slate.S700)
						}
					}
				}
			}
		}
	}
}

@Composable
private fun YearArrow(label: String, glyph: String, onClick: () -> Unit) {
	Box(
		modifier = Modifier
			.size(width = 44.dp, height = 44.dp)
			.semantics { contentDescription = label }
			.clickable(role = Role.Button, onClick = onClick),
		contentAlignment = Alignment.Center,
	) {
		Text(glyph, fontSize = 20.sp, color = Slate.S500)
	}
}
