package com.familyplanz.app.ui.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.calendar.model.VisibleCalendar
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate

/*
 * The Filters bottom sheet (#292 L2, `+page.svelte:615-805`): CALENDARS and
 * ASSIGNEE sections with their verbatim footnotes, the hide/show-all pair,
 * the 28 x 16 switches and the per-person counts.
 */

@Composable
@Suppress("LongMethod")
fun CalendarFiltersSheet(state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions) {
	val allHidden = state.data.calendars.isNotEmpty() && state.data.calendars.all { it.id in state.hiddenCalendars }
	CalendarSheetShell(onClose = actions.sheets.onClose, maxHeightFraction = 0.88f, modifier = Modifier.testTag("filters-sheet")) {
		SheetTitle("Filters", closeLabel = "Close calendar filter") { actions.sheets.onClose() }
		Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
			SectionHeader("Calendars", if (allHidden) "Show all" else "Hide all") {
				actions.filters.onHideAll(!allHidden)
			}
			state.data.calendars.forEach { calendar ->
				val hidden = calendar.id in state.hiddenCalendars
				Row(
					modifier = Modifier
						.fillMaxWidth()
						.background(if (hidden) Slate.S50 else MaterialTheme.colorScheme.surface)
						.clickable { actions.filters.onToggleCalendar(calendar.id) }
						.padding(horizontal = 16.dp, vertical = 10.dp),
					verticalAlignment = Alignment.CenterVertically,
					horizontalArrangement = Arrangement.spacedBy(8.dp),
				) {
					CalendarDot(calendar.color, dimmed = hidden)
					Text(
						calendar.name,
						fontSize = 14.sp,
						color = if (hidden) Slate.S400 else FpTheme.colors.textBody,
						textDecoration = if (hidden) TextDecoration.LineThrough else null,
						modifier = Modifier.weight(1f),
					)
					Switch(on = !hidden)
				}
			}
			Footnote(
				"Hidden calendars drop their events and their due tasks from every view. " +
					"This is a reading filter - new events still go to your default calendar.",
			)
			SectionHeader(
				title = "Assignee",
				action = if (state.hiddenAssignees.isEmpty()) null else "Show everyone",
			) { actions.filters.onShowEveryone() }
			if (visible.assignees.isEmpty()) {
				Footnote(
					"Nobody has anything on this calendar yet, so there is nobody to filter by. " +
						"The people who put something here will show up.",
				)
			}
			visible.assignees.forEach { person ->
				val hidden = person.id in state.hiddenAssignees
				Row(
					modifier = Modifier
						.fillMaxWidth()
						.background(if (hidden) Slate.S50 else MaterialTheme.colorScheme.surface)
						.clickable { actions.filters.onToggleAssignee(person.id) }
						.padding(horizontal = 16.dp, vertical = 10.dp),
					verticalAlignment = Alignment.CenterVertically,
					horizontalArrangement = Arrangement.spacedBy(8.dp),
				) {
					PersonAvatar(person.name)
					Text(
						person.name,
						fontSize = 14.sp,
						color = if (hidden) Slate.S400 else FpTheme.colors.textBody,
						modifier = Modifier.weight(1f),
					)
					Text(if (hidden) "-" else "${person.count}", fontSize = 13.sp, color = FpTheme.colors.textMuted)
				}
			}
			Footnote(
				"Switched-off people drop their events and their due tasks from every view. " +
					"The number is what is left on the calendar now, so a 0 is why the grid is empty.",
			)
			Box(Modifier.height(24.dp))
		}
	}
}

@Composable
private fun SectionHeader(title: String, action: String?, onAction: () -> Unit) {
	Row(modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
		Text(
			title.uppercase(),
			fontSize = 11.sp,
			fontWeight = FontWeight.SemiBold,
			letterSpacing = 0.8.sp,
			color = Slate.S400,
			modifier = Modifier.weight(1f),
		)
		if (action != null) {
			Text(
				action,
				fontSize = 12.sp,
				fontWeight = FontWeight.SemiBold,
				color = Primary.P700,
				modifier = Modifier.clickable(role = Role.Button, onClick = onAction).padding(8.dp),
			)
		}
	}
}

@Composable
private fun Footnote(text: String) {
	Text(text, fontSize = 12.sp, color = FpTheme.colors.textMuted, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
}

/** The web's 28 x 16 switch; the whole row is tappable, this is just the mark. */
@Composable
private fun Switch(on: Boolean) {
	Box(
		modifier = Modifier
			.size(width = 28.dp, height = 16.dp)
			.clip(RoundedCornerShape(8.dp))
			.background(if (on) Primary.P600 else Slate.S200),
	) {
		Box(
			modifier = Modifier
				.align(if (on) Alignment.CenterEnd else Alignment.CenterStart)
				.padding(horizontal = 2.dp)
				.size(12.dp)
				.clip(FpShape.Pill)
				.background(MaterialTheme.colorScheme.surface),
		)
	}
}

/** The actions menu: a top sheet with the web's five rows, each at least 44 dp (AC-CAL-14). */
@Composable
fun CalendarActionsSheet(state: CalendarUiState, actions: CalendarActions) {
	CalendarSheetShell(onClose = actions.sheets.onClose, maxHeightFraction = 0.6f, modifier = Modifier.testTag("actions-sheet")) {
		SheetTitle("Calendar actions", closeLabel = "Close calendar actions") { actions.sheets.onClose() }
		Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
			val rows = buildList {
				if (state.data.calendars.isNotEmpty() || state.data.roster.isNotEmpty()) add(CalendarMenuAction.FILTERS)
				add(CalendarMenuAction.IMPORT)
				add(CalendarMenuAction.PRINT)
				add(CalendarMenuAction.DASHBOARD)
				add(CalendarMenuAction.SETTINGS)
			}
			rows.forEach { row ->
				Text(
					row.label,
					fontSize = 16.sp,
					color = Slate.S700,
					modifier = Modifier
						.fillMaxWidth()
						.heightIn(min = 44.dp)
						.clip(RoundedCornerShape(8.dp))
						.clickable(role = Role.Button) {
							actions.sheets.onClose()
							if (row == CalendarMenuAction.FILTERS) {
								actions.sheets.onOpen(CalendarSheet.Filters)
							} else {
								actions.sheets.onMenu(row)
							}
						}
						.padding(horizontal = 12.dp, vertical = 12.dp),
				)
			}
			Box(Modifier.height(16.dp))
		}
	}
}

/** A task's detail sheet (task chip tap): title, chips and the one-tap complete. */
@Composable
fun CalendarTaskSheet(state: CalendarUiState, actions: CalendarActions) {
	val task = (state.sheet as? CalendarSheet.Task)?.task ?: return
	CalendarSheetShell(onClose = actions.sheets.onClose, modifier = Modifier.testTag("task-sheet")) {
		SheetTitle("Task Details", closeLabel = "Close task details", subtitle = task.title) { actions.sheets.onClose() }
		Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
			Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
				if (task.familyId != null) Chip("Family")
				Chip(task.visibility.replaceFirstChar { it.uppercase() })
				Chip(task.priority.replaceFirstChar { it.uppercase() })
			}
			CalendarCta("Mark complete") {
				actions.events.onCompleteTask(task)
				actions.sheets.onClose()
			}
		}
	}
}

@Composable
private fun Chip(label: String) {
	Text(
		label,
		fontSize = 11.sp,
		fontWeight = FontWeight.Medium,
		color = Slate.S600,
		modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Slate.S100).padding(horizontal = 6.dp, vertical = 2.dp),
	)
}
