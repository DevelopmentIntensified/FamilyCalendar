package com.familyplanz.app.ui.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.calendar.form.EventFormSheet
import com.familyplanz.app.ui.calendar.model.CalendarEmpty
import com.familyplanz.app.ui.calendar.model.VisibleCalendar
import com.familyplanz.app.ui.calendar.model.visibleOf
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate

/*
 * The Calendar page (#292 L2, §2.2): toolbar, the alert/verse/first-run
 * stack, the four views behind the reading filters, the FAB and the one
 * overlay in [CalendarUiState.sheet]. Copy is the web's verbatim.
 */

@Composable
fun CalendarScreen(
	state: CalendarUiState,
	actions: CalendarActions,
	onBrowseTasks: () -> Unit,
	menu: @Composable () -> Unit = {},
) {
	val visible = remember(state) { visibleOf(state) }
	Box(modifier = Modifier.fillMaxSize().testTag("calendar-screen")) {
		Column(modifier = Modifier.fillMaxSize()) {
			CalendarToolbar(state, visible, actions, menu)
			Notices(state, actions, onBrowseTasks)
			Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
				Body(state, visible, actions)
				if (state.selectionMode) {
					Box(modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(bottom = 8.dp)) {
						CalendarBulkBar(state, actions.bulk)
					}
				}
			}
		}
		if (!state.selectionMode) Fab(onClick = { actions.form.onCreate(state.today, null) })
		SheetHost(state, visible, actions)
	}
}

/** Light: skeleton. Error: Retry. Warnings: one amber line each. */
@Composable
private fun Notices(state: CalendarUiState, actions: CalendarActions, onBrowseTasks: () -> Unit) {
	if (state.downloadingMonth) DownloadingLine()
	state.errorText?.let { CalendarAlert(it, retry = actions.modes.onRetry) }
	state.warnings.forEach { CalendarAlert(it) }
	if (!state.firstRunDismissed) FirstRunCard(onBrowseTasks = onBrowseTasks, onDismiss = actions.filters.onDismissFirstRun)
	state.data.verse?.let { DailyVerseCard(it) }
}

@Composable
private fun Body(state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions) {
	when {
		state.loading -> CalendarSkeleton()
		visible.empty != CalendarEmpty.NONE && visible.matches == 0 -> CalendarEmpty(
			empty = visible.empty,
			query = state.query,
			hiddenCalendarNames = visible.hiddenCalendarNames,
			hiddenAssigneeNames = visible.hiddenAssigneeNames,
			onShowAllCalendars = { actions.filters.onHideAll(false) },
			onClearSearch = { actions.filters.onQuery("") },
			onShowEveryone = actions.filters.onShowEveryone,
		)

		state.view == CalendarView.DAY -> CalendarDayView(state, visible, actions)
		state.view == CalendarView.WEEK -> CalendarWeekView(state, visible, actions)
		state.view == CalendarView.LIST -> CalendarListView(state, visible, actions)
		else -> Box(Modifier.fillMaxSize().monthSwipe(actions.nav.onSwipe)) { CalendarMonthGrid(state, visible, actions) }
	}
}

/** 64 dp primary circle, "Quick Add Event", press scale 0.95 (AC-CAL-28). */
@Composable
private fun BoxScope.Fab(onClick: () -> Unit) {
	Box(
		modifier = Modifier
			.align(Alignment.BottomEnd)
			.padding(end = 24.dp, bottom = 96.dp)
			.size(64.dp)
			.shadow(12.dp, CircleShape)
			.clip(CircleShape)
			.background(Primary.P600)
			.semantics { contentDescription = "Quick Add Event" }
			.clickable(onClick = onClick)
			.testTag("calendar-fab"),
		contentAlignment = Alignment.Center,
	) {
		Text("+", fontSize = 32.sp, fontWeight = FontWeight.Normal, color = Slate.S50)
	}
}

/** The one overlay at a time; the shell already carries the scrim and handle. */
@Composable
private fun SheetHost(state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions) {
	when (val sheet = state.sheet) {
		null -> Unit
		is CalendarSheet.DayActions -> DayActionSheet(sheet.date, state, visible, actions)
		is CalendarSheet.DayEvents -> DayEventsModal(sheet.date, state, visible, actions)
		is CalendarSheet.Event -> EventSheet(
			event = sheet.event,
			state = state,
			checklist = state.checklist,
			actions = EventSheetActions(
				onClose = actions.sheets.onClose,
				onRsvp = actions.events.onRsvp,
				onDelete = actions.events.onDelete,
				onEdit = actions.form.onEdit,
				onDuplicate = actions.form.onDuplicate,
				onAddChecklist = actions.events.onAddChecklist,
				onCompleteTask = actions.events.onCompleteTask,
			),
		)

		is CalendarSheet.Task -> CalendarTaskSheet(state, actions)
		is CalendarSheet.MonthPicker -> MonthPickerSheet(sheet.year, state, actions)
		is CalendarSheet.Form -> CalendarSheetShell(onClose = actions.sheets.onClose) {
			EventFormSheet(sheet.form, state, actions.form)
		}

		CalendarSheet.Filters -> CalendarFiltersSheet(state, visible, actions)
		CalendarSheet.Actions -> CalendarActionsSheet(state, actions)
	}
}

/** A left/right fling is a month step; a mostly-vertical move is a scroll (#048). */
internal fun Modifier.monthSwipe(onSwipe: (Float, Float) -> Unit): Modifier = pointerInput(Unit) {
	var dx = 0f
	var dy = 0f
	detectDragGestures(
		onDragStart = {
			dx = 0f
			dy = 0f
		},
		onDragEnd = { onSwipe(dx / density, dy / density) },
	) { change, drag ->
		change.consume()
		dx += drag.x
		dy += drag.y
	}
}

/** The page title the old list headers used; kept for previews and tests. */
internal fun calendarTitle(state: CalendarUiState): String =
	if (state.selectedDay != null) {
		val date = java.time.LocalDate.parse(state.selectedDay)
		monthNameOf(date.month) + " ${date.dayOfMonth}, ${date.year}"
	} else {
		monthNameOf(state.month.month) + " ${state.month.year}"
	}

/** "Oct 31, 4:00 PM" in the device zone, or null for a blank instant. */
internal fun friendlyTime(iso: String?): String? {
	if (iso.isNullOrBlank()) return null
	val fmt = java.time.format.DateTimeFormatter.ofPattern("MMM d, h:mm a", java.util.Locale.ENGLISH)
	return runCatching { fmt.format(java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault())) }
		.getOrElse { runCatching { fmt.format(java.time.LocalDateTime.parse(iso)) }.getOrNull() }
}
