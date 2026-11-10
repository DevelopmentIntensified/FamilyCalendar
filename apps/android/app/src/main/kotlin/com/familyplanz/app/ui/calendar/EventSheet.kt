@file:Suppress("TooManyFunctions", "MatchingDeclarationName")
package com.familyplanz.app.ui.calendar

import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.R
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.ui.calendar.chips.ChipDensity
import com.familyplanz.app.ui.calendar.chips.ChipKindMark
import com.familyplanz.app.ui.calendar.chips.chipColor
import com.familyplanz.app.ui.calendar.chips.chipKindOf
import com.familyplanz.app.ui.calendar.model.SCOPE_ALL
import com.familyplanz.app.ui.calendar.model.SCOPE_THIS
import com.familyplanz.app.ui.calendar.model.dayFull
import com.familyplanz.app.ui.calendar.model.timeRange
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate
import java.time.ZoneId

/*
 * EventModal (the event detail sheet, `EventModal.svelte` + parts). Public on
 * purpose: #297 (Dashboard) opens the same sheet from a dashboard row, so one
 * component owns the look and both lanes cannot drift.
 */

@Suppress("MatchingDeclarationName")
data class EventSheetActions(
	val onClose: () -> Unit,
	val onRsvp: (CalendarEvent, String) -> Unit,
	val onDelete: (CalendarEvent, String) -> Unit,
	val onEdit: (CalendarEvent) -> Unit,
	val onDuplicate: (CalendarEvent) -> Unit,
	val onAddChecklist: (String, String) -> Unit,
	val onCompleteTask: (CalendarTask) -> Unit,
)

/** The full detail sheet: details, RSVP, attendees, checklist, footer (AC-CAL-24..27). */
@Composable
fun EventSheet(
	event: CalendarEvent,
	state: CalendarUiState,
	checklist: List<CalendarTask>?,
	actions: EventSheetActions,
) {
	var panel by remember(event.id) { mutableStateOf(Panel.NONE) }
	var checklistText by remember(event.id) { mutableStateOf("") }
	CalendarSheetShell(onClose = actions.onClose, modifier = Modifier.testTag("event-sheet")) {
		Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
			EventHeader(event, actions)
			DetailRows(event, state)
			if (event.isRecurring) RecurrenceCard(event)
			RsvpControl(event, actions)
			AttendeeGroup(event)
			ChecklistSection(event, checklist, checklistText, onChange = { checklistText = it }, onAdd = actions.onAddChecklist)
			Footer(event, panel, onEdit = { actions.onEdit(event) }) { panel = it }
			when (panel) {
				Panel.DELETE_THIS -> ConfirmPanel(
					question = if (event.isRecurring) "Delete just this one?" else "Delete this event?",
					body = "${eventsWarning(event)}Delete an event and it is gone for everyone.",
					confirm = "Delete",
					onConfirm = { actions.onDelete(event, if (event.isRecurring) SCOPE_THIS else SCOPE_ALL) },
					onCancel = { panel = Panel.NONE },
				)

				Panel.DELETE_SERIES -> ConfirmPanel(
					question = "Delete the whole series?",
					body = "${eventsWarning(event)}Every occurrence of this repeating event goes too.",
					confirm = "Delete",
					onConfirm = { actions.onDelete(event, SCOPE_ALL) },
					onCancel = { panel = Panel.NONE },
				)

				Panel.DUPLICATE -> ConfirmPanel(
					question = "Duplicate this event?",
					body = "A copy titled \"${event.title} (copy)\" will be created.",
					confirm = "Duplicate",
					onConfirm = { actions.onDuplicate(event) },
					onCancel = { panel = Panel.NONE },
				)

				Panel.NONE -> Unit
			}
			Box(Modifier.size(16.dp))
		}
	}
}

private enum class Panel { NONE, DELETE_THIS, DELETE_SERIES, DUPLICATE }

private fun eventsWarning(event: CalendarEvent): String =
	if (event.isRecurring) "Repeating event - pick a scope below. " else ""

@Composable
private fun EventHeader(event: CalendarEvent, actions: EventSheetActions) {
	Row(
		modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 8.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(8.dp),
	) {
		Box(Modifier.size(12.dp).clip(FpShape.Pill).background(chipColor(event.color)))
		Column(modifier = Modifier.weight(1f)) {
			Text(event.title, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = FpTheme.colors.textStrong,
				maxLines = 2, overflow = TextOverflow.Ellipsis)
			if (event.isRecurring) {
				Text("Repeats ${repeatRule(event)}", fontSize = 12.sp, color = Accent.Purple500)
			}
		}
		Box(
			modifier = Modifier
				.size(44.dp)
				.semantics { contentDescription = "Close event" }
				.clickable(role = Role.Button, onClick = actions.onClose),
			contentAlignment = Alignment.Center,
		) {
			Text("Close", fontSize = 13.sp, color = FpTheme.colors.textBody)
		}
	}
}

private fun repeatRule(event: CalendarEvent): String {
	val unit = event.recurrenceFrequency?.lowercase()?.removeSuffix("ly") ?: "week"
	val every = event.recurrenceInterval ?: 1
	return if (every == 1) "every $unit" else "every $every ${unit}s"
}

/** The detail list: date, time or All day, calendar, creator, location, reminder, description. */
@Composable
private fun DetailRows(event: CalendarEvent, state: CalendarUiState) {
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
		Detail(DetailKind.DATE, event.localDay?.let { dayFull(it) } ?: event.startDate.take(10))
		Detail(DetailKind.TIME, if (event.allDay) "All day" else timeRange(event, state.zone))
		state.data.calendarRefs.firstOrNull { it.first == event.calendarId }?.let { Detail(DetailKind.CALENDAR, it.second) }
		event.creatorName?.takeIf { it.isNotBlank() }?.let { Detail(DetailKind.CREATOR, it) }
		event.location?.takeIf { it.isNotBlank() }?.let { Detail(DetailKind.LOCATION, it) }
		reminderLabel(event.reminderMinutes)?.let { Detail(DetailKind.REMINDER, it) }
		event.description?.takeIf { it.isNotBlank() }?.let {
			Surface(shape = MaterialTheme.shapes.medium, color = Slate.S50, modifier = Modifier.fillMaxWidth()) {
				Text(it, fontSize = 13.sp, color = FpTheme.colors.textBody, modifier = Modifier.padding(16.dp))
			}
		}
	}
}

/** "15 minutes before" ... the web's reminder wording. */
fun reminderLabel(minutes: Int?): String? = when (minutes) {
	null -> null
	15 -> "15 minutes before"
	30 -> "30 minutes before"
	60 -> "1 hour before"
	120 -> "2 hours before"
	1440 -> "1 day before"
	else -> if (minutes % 60 == 0) "${minutes / 60} hours before" else "$minutes minutes before"
}

/** The detail rows, in order, each with the web's own stroke icon (`EventDetailList.svelte`); the clock is the web's time glyph. */
private enum class DetailKind(val label: String, val tag: String, @DrawableRes val icon: Int) {
	DATE("Date", "date", R.drawable.ic_fp_detail_date),
	TIME("Time", "time", R.drawable.ic_fp_detail_time),
	CALENDAR("Calendar", "calendar", R.drawable.ic_fp_detail_calendar),
	CREATOR("Created by", "creator", R.drawable.ic_fp_detail_creator),
	LOCATION("Location", "location", R.drawable.ic_fp_detail_location),
	REMINDER("Reminder", "reminder", R.drawable.ic_fp_detail_reminder),
}

/** One row: the 32 dp `rounded-lg bg-slate-100` tile with the row's 16 dp slate-500 icon, then label over value. */
@Composable
private fun Detail(kind: DetailKind, value: String) {
	Row(
		verticalAlignment = Alignment.Top,
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		modifier = Modifier.testTag("detail-row-${kind.tag}"),
	) {
		Box(
			modifier = Modifier.size(32.dp).clip(MaterialTheme.shapes.small).background(Slate.S100),
			contentAlignment = Alignment.Center,
		) {
			Icon(
				painterResource(kind.icon),
				contentDescription = null,
				tint = Slate.S500,
				modifier = Modifier.size(16.dp).testTag("detail-icon-${kind.tag}"),
			)
		}
		Column {
			Text(kind.label, fontSize = 11.sp, color = FpTheme.colors.textMuted)
			Text(value, fontSize = 14.sp, color = FpTheme.colors.textBody)
		}
	}
}

@Composable
private fun RecurrenceCard(event: CalendarEvent) {
	Surface(shape = MaterialTheme.shapes.medium, color = Accent.Purple100, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp,
		vertical = 6.dp)) {
		Column(modifier = Modifier.padding(12.dp)) {
			Text("This is a repeating event", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Accent.Purple500)
			Text("Repeats ${repeatRule(event)}", fontSize = 12.sp, color = FpTheme.colors.textBody)
			Text("Saving changes can apply to this event only or to the whole series.", fontSize = 12.sp, color = FpTheme.colors.textBody)
		}
	}
}

/** Going / Maybe / Can't go, each with its count; tapping the same one clears it (AC-CAL-25). */
@Composable
private fun RsvpControl(event: CalendarEvent, actions: EventSheetActions) {
	val going = event.attendance?.going ?: 0
	val options = listOf(
		"going" to ("Going" to going),
		"maybe" to ("Maybe" to 0),
		"declined" to ("Can't go" to 0),
	)
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
		SectionKicker("Your RSVP")
		Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
			options.forEach { (status, label) ->
				val selected = event.rsvpStatus == status
				val tint = when (status) {
					"going" -> Accent.Emerald700
					"maybe" -> Accent.Amber700
					else -> Accent.Red600
				}
				Row(
					modifier = Modifier
						.weight(1f)
						.heightIn(min = 44.dp)
						.clip(RoundedCornerShape(10.dp))
						.background(if (selected) tint else Slate.S100)
						.clickable(role = Role.Button) { actions.onRsvp(event, status) }
						.padding(horizontal = 8.dp, vertical = 10.dp),
					verticalAlignment = Alignment.CenterVertically,
					horizontalArrangement = Arrangement.spacedBy(4.dp),
				) {
					Text(label.first, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = if (selected) Slate.S50 else Slate.S600)
					Text("${label.second}", fontSize = 11.sp, color = if (selected) Slate.S50 else Slate.S500)
				}
			}
		}
		Text("tap again to clear", fontSize = 11.sp, color = FpTheme.colors.textMuted)
	}
}

@Composable
private fun AttendeeGroup(event: CalendarEvent) {
	val summary = event.attendance ?: return
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
		SectionKicker("Who is going")
		Text("${summary.going} going, ${summary.invited} invited", fontSize = 13.sp, color = FpTheme.colors.textBody)
		if (summary.requiredPending > 0) {
			Text("${summary.requiredPending} still to answer", fontSize = 12.sp, color = FpTheme.colors.textMuted)
		}
	}
}

@Composable
private fun ChecklistSection(
	event: CalendarEvent,
	checklist: List<CalendarTask>?,
	text: String,
	onChange: (String) -> Unit,
	onAdd: (String, String) -> Unit,
) {
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
		SectionKicker("Checklist")
		checklist.orEmpty().forEach { task ->
			Text("${if (task.completed) "Done - " else ""}${task.title}", fontSize = 13.sp, color = FpTheme.colors.textBody)
		}
		Row(
			modifier = Modifier
				.fillMaxWidth()
				.heightIn(min = 44.dp)
				.clip(RoundedCornerShape(10.dp))
				.background(Slate.S50)
				.padding(horizontal = 12.dp),
			verticalAlignment = Alignment.CenterVertically,
			horizontalArrangement = Arrangement.spacedBy(8.dp),
		) {
			Box(modifier = Modifier.weight(1f)) {
				androidx.compose.foundation.text.BasicTextField(
					value = text,
					onValueChange = onChange,
					singleLine = true,
					textStyle = androidx.compose.ui.text.TextStyle(fontSize = 13.sp, color = FpTheme.colors.textStrong),
					modifier = Modifier.fillMaxWidth().testTag("checklist-input"),
				)
				if (text.isEmpty()) Text("Add a task...", fontSize = 13.sp, color = FpTheme.colors.textMuted)
			}
			Text(
				"Done",
				fontSize = 13.sp,
				fontWeight = FontWeight.SemiBold,
				color = Primary.P700,
				modifier = Modifier.clickable(role = Role.Button) {
					onAdd(event.id, text)
					onChange("")
				}.padding(4.dp),
			)
		}
	}
}

@Composable
private fun Footer(event: CalendarEvent, panel: Panel, onEdit: () -> Unit, onPanel: (Panel) -> Unit) {
	Row(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp),
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalAlignment = Alignment.CenterVertically,
	) {
		FooterButton("Delete", filled = false, tint = Accent.Red600) {
			onPanel(Panel.DELETE_THIS)
		}
		FooterButton("Duplicate", filled = false) { onPanel(Panel.DUPLICATE) }
		FooterButton("Edit", filled = true, modifier = Modifier.weight(1f), onClick = onEdit)
	}
	if (event.isRecurring && panel == Panel.DELETE_THIS) {
		Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
			FooterButton("Just this one", filled = false, modifier = Modifier.weight(1f)) { onPanel(Panel.DELETE_THIS) }
			FooterButton("Whole series", filled = false, modifier = Modifier.weight(1f)) { onPanel(Panel.DELETE_SERIES) }
		}
	}
}

@Composable
private fun FooterButton(
	label: String,
	filled: Boolean,
	modifier: Modifier = Modifier,
	tint: androidx.compose.ui.graphics.Color = Primary.P600,
	onClick: () -> Unit,
) {
	Surface(
		shape = MaterialTheme.shapes.small,
		color = if (filled) tint else MaterialTheme.colorScheme.surface,
		border = if (filled) null else BorderStroke(1.dp, Slate.S200),
		modifier = modifier.heightIn(min = 44.dp).clickable(role = Role.Button, onClick = onClick),
	) {
		Box(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp), contentAlignment = Alignment.Center) {
			Text(label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (filled) Slate.S50 else tint)
		}
	}
}

@Composable
private fun ConfirmPanel(question: String, body: String, confirm: String, onConfirm: () -> Unit, onCancel: () -> Unit) {
	Surface(shape = MaterialTheme.shapes.medium, color = Accent.Red50, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp,
		vertical = 6.dp)) {
		Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
			Text(question, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Accent.Red700)
			Text(body, fontSize = 12.sp, color = FpTheme.colors.textBody, fontStyle = FontStyle.Normal)
			Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
				FooterButton(confirm, filled = true, tint = Accent.Red600, modifier = Modifier.weight(1f), onClick = onConfirm)
				FooterButton("Cancel", filled = false, modifier = Modifier.weight(1f), onClick = onCancel)
			}
		}
	}
}

/** Chips in the detail sheet reuse the same kind mark as the grid. */
@Composable
fun EventKindMark(event: CalendarEvent) {
	ChipKindMark(chipKindOf(event), chipColor(event.color), ChipDensity.WORD)
}

internal fun eventZone(state: CalendarUiState): ZoneId = state.zone

