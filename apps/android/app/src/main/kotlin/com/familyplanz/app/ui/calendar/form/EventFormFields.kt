package com.familyplanz.app.ui.calendar.form

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.calendar.CalendarFormActions
import com.familyplanz.app.ui.calendar.CalendarUiState
import com.familyplanz.app.ui.calendar.model.CalendarForm
import com.familyplanz.app.ui.calendar.model.FormField as Field
import com.familyplanz.app.ui.calendar.model.FormKind
import com.familyplanz.app.ui.calendar.model.REMINDER_OPTIONS
import com.familyplanz.app.ui.calendar.model.RepeatOption
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate

/*
 * The EventFormModal body (#292 L2): Quick Add with its amber fallback, the
 * event fields, the Task tab and every pill/select row. Copy is the web's
 * verbatim - AC-CAL-29..31 assert it.
 */

internal const val QUICK_ADD_PLACEHOLDER = "Lunch Friday at noon with John"
internal const val QUICK_ADD_FALLBACK = "Couldn't check that with the parser just now - fill the fields below manually."
internal const val QUICK_ADD_REPORT = "Parsed wrong? Report this phrase"
internal const val END_HINT = "End must be after start"
private const val TASK_PLACEHOLDER = "e.g., Pay water bill - or try \"#private tomorrow @family\""

@Composable
internal fun EventFormFields(form: CalendarForm, state: CalendarUiState, actions: CalendarFormActions) {
	Column(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
		if (form.kind == FormKind.TASK) {
			TaskFields(form, actions)
		} else {
			if (!form.editing && state.data.settings.autoParseEventDetails) QuickAddBlock(state, actions)
			EventFields(form, state, actions)
		}
	}
}

/* ---- Quick Add (AC-CAL-29) ---- */

@Composable
private fun QuickAddBlock(state: CalendarUiState, actions: CalendarFormActions) {
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
		SectionLabel("Quick Add", end = if (state.quickAdd.isBlank()) null else "Clear" to { actions.onQuickAdd("") })
		Box(
			modifier = Modifier
				.fillMaxWidth()
				.clip(FpShape.Input)
				.background(Primary.P50)
				.padding(horizontal = 12.dp, vertical = 10.dp),
		) {
			androidx.compose.foundation.text.BasicTextField(
				value = state.quickAdd,
				onValueChange = actions.onQuickAdd,
				singleLine = true,
				textStyle = androidx.compose.ui.text.TextStyle(fontSize = 14.sp, color = FpTheme.colors.textStrong),
				modifier = Modifier.fillMaxWidth().testTag("quick-add"),
			)
			if (state.quickAdd.isEmpty()) {
				Text(QUICK_ADD_PLACEHOLDER, fontSize = 14.sp, color = FpTheme.colors.textMuted)
			}
		}
		Row(
			modifier = Modifier.fillMaxWidth(),
			horizontalArrangement = Arrangement.spacedBy(8.dp),
			verticalAlignment = Alignment.CenterVertically,
		) {
			Text(
				"Parse",
				fontSize = 12.sp,
				fontWeight = FontWeight.SemiBold,
				color = Primary.P700,
				modifier = Modifier
					.clickable(enabled = state.quickAdd.isNotBlank() && !state.parsing, role = Role.Button, onClick = actions.onParse)
					.testTag("quick-add-parse")
					.padding(vertical = 8.dp),
			)
			if (state.parsing) Text("Checking...", fontSize = 12.sp, color = FpTheme.colors.textMuted)
			if (state.parseFailed) Text(QUICK_ADD_REPORT, fontSize = 12.sp, color = Primary.P700)
		}
		if (state.parseFailed) {
			Text(
				QUICK_ADD_FALLBACK,
				fontSize = 12.sp,
				color = Accent.Amber700,
				modifier = Modifier
					.clip(RoundedCornerShape(8.dp))
					.background(Accent.Amber50)
					.padding(horizontal = 10.dp, vertical = 8.dp)
					.fillMaxWidth()
					.testTag("quick-add-fallback"),
			)
		}
	}
}

/* ---- Event fields ---- */

@Composable
private fun EventFields(form: CalendarForm, state: CalendarUiState, actions: CalendarFormActions) {
	TitleField(form, actions)
	DescriptionField(form, actions)
	ShowMoreToggle(form, actions)
	if (form.showMore) {
		PillRow(
			label = "Repeat",
			pills = RepeatOption.entries.map { it.label to (form.repeat == it) },
			onPick = { index -> actions.onUpdate { it.copy(repeat = RepeatOption.entries[index]) } },
		)
		if (form.repeat != RepeatOption.NONE) StepperRow(form, actions)
		PillRow(
			label = "Reminder",
			pills = REMINDER_OPTIONS.map { (minutes, label) -> label to (form.reminderMinutes == minutes && form.reminderSet) },
			onPick = { index ->
				actions.onUpdate {
					val minutes = REMINDER_OPTIONS[index].first
					it.copy(reminderMinutes = minutes, reminderSet = minutes != null)
				}
			},
		)
		LocationField(form, actions)
		CalendarPicker(form, state, actions)
	}
	PillRow(label = "All day", pills = listOf("All day" to form.allDay, "Multi-day" to form.multiDay), onPick = { index ->
		actions.onUpdate { if (index == 0) it.copy(allDay = !it.allDay) else it.copy(multiDay = !it.multiDay) }
	})
	DateField(form, actions)
	TimeFields(form, actions)
	if (form.endBeforeStart) {
		Text(
			END_HINT,
			fontSize = 12.sp,
			color = Accent.Red600,
			modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp).testTag("form-end-hint"),
		)
	}
	if (form.editing && form.repeat != RepeatOption.NONE) ScopeCard(form, actions)
}

/* ---- Task tab (AC-CAL-31) ---- */

@Composable
private fun TaskFields(form: CalendarForm, actions: CalendarFormActions) {
	FormField(
		label = "Task Title*",
		value = form.title,
		placeholder = TASK_PLACEHOLDER,
		parsed = Field.TITLE in form.parsed,
		hint = null,
		tag = "form-title",
		onValue = { text -> actions.onUpdate { it.copy(title = text, parsed = it.touched(Field.TITLE)) } },
	)
	PillRow(
		label = "Who can see this",
		pills = listOf("Private" to (form.effectiveVisibility() == "private"), "Public" to (form.effectiveVisibility() == "public")),
		onPick = { index -> actions.onUpdate { it.copy(visibility = if (index == 0) "private" else "public") } },
	)
	FormField(
		label = "Due Date",
		value = form.date.orEmpty(),
		placeholder = "YYYY-MM-DD",
		parsed = Field.DATE in form.parsed,
		hint = null,
		tag = "form-date",
		onValue = { text -> actions.onUpdate { it.copy(date = text.ifBlank { null }, parsed = it.touched(Field.DATE)) } },
	)
}

/* ---- Explicit field rows (no reflection, so each tag stays unique) ---- */

@Composable
private fun TitleField(form: CalendarForm, actions: CalendarFormActions) {
	FormField(
		label = "Event Title*",
		value = form.title,
		placeholder = "Add a title",
		parsed = Field.TITLE in form.parsed,
		hint = null,
		tag = "form-title",
		onValue = { text -> actions.onUpdate { it.copy(title = text, parsed = it.touched(Field.TITLE)) } },
	)
}

@Composable
private fun DescriptionField(form: CalendarForm, actions: CalendarFormActions) {
	FormField(
		label = "Description",
		value = form.description,
		placeholder = "Optional notes",
		parsed = Field.DESCRIPTION in form.parsed,
		hint = null,
		tag = "form-description",
		onValue = { text -> actions.onUpdate { it.copy(description = text, parsed = it.touched(Field.DESCRIPTION)) } },
	)
}

@Composable
private fun LocationField(form: CalendarForm, actions: CalendarFormActions) {
	FormField(
		label = "Location",
		value = form.location,
		placeholder = "Add a place",
		parsed = Field.LOCATION in form.parsed,
		hint = null,
		tag = "form-location",
		onValue = { text -> actions.onUpdate { it.copy(location = text, parsed = it.touched(Field.LOCATION)) } },
	)
}

@Composable
private fun DateField(form: CalendarForm, actions: CalendarFormActions) {	FormField(
		label = "Start Date",
		value = form.date.orEmpty(),
		placeholder = "YYYY-MM-DD",
		parsed = Field.DATE in form.parsed,
		hint = null,
		tag = "form-date",
		onValue = { text -> actions.onUpdate { it.copy(date = text.ifBlank { null }, parsed = it.touched(Field.DATE)) } },
	)
	if (form.multiDay) {
		FormField(
			label = "End Date",
			value = form.endDate.orEmpty(),
			placeholder = "YYYY-MM-DD",
			parsed = false,
			hint = null,
			tag = "form-end-date",
			onValue = { text -> actions.onUpdate { it.copy(endDate = text.ifBlank { null }) } },
		)
	}
}

@Composable
private fun TimeFields(form: CalendarForm, actions: CalendarFormActions) {
	if (form.allDay) return
	FormField(
		label = "Start Time",
		value = form.startTime.orEmpty(),
		placeholder = "HH:mm",
		parsed = Field.START_TIME in form.parsed,
		hint = null,
		tag = "form-start-time",
		onValue = { text -> actions.onUpdate { it.copy(startTime = text.ifBlank { null }, parsed = it.touched(Field.START_TIME)) } },
	)
	FormField(
		label = "End Time",
		value = form.endTime.orEmpty(),
		placeholder = "HH:mm",
		parsed = Field.END_TIME in form.parsed,
		hint = null,
		tag = "form-end-time",
		onValue = { text -> actions.onUpdate { it.copy(endTime = text.ifBlank { null }, parsed = it.touched(Field.END_TIME)) } },
	)
}

@Composable
private fun SectionLabel(text: String, end: Pair<String, () -> Unit>? = null) {
	Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
		Text(text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Slate.S600, modifier = Modifier.weight(1f))
		if (end != null) {
			Text(
				end.first,
				fontSize = 12.sp,
				color = FpTheme.colors.textMuted,
				modifier = Modifier.clickable(role = Role.Button, onClick = end.second),
			)
		}
	}
}

@Composable
private fun PillRow(label: String, pills: List<Pair<String, Boolean>>, onPick: (Int) -> Unit) {
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
		Text(label, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Slate.S600)
		Row(
			modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
			horizontalArrangement = Arrangement.spacedBy(6.dp),
		) {
			pills.forEachIndexed { index, (text, on) ->
				FormPill(text, on) { onPick(index) }
			}
		}
	}
}

@Composable
private fun ShowMoreToggle(form: CalendarForm, actions: CalendarFormActions) {
	Text(
		if (form.showMore) "Show Less" else "Show More",
		fontSize = 12.sp,
		fontWeight = FontWeight.SemiBold,
		color = Primary.P700,
		modifier = Modifier
			.clickable(role = Role.Button) { actions.onUpdate { it.copy(showMore = !it.showMore) } }
			.testTag("form-show-more")
			.padding(horizontal = 16.dp, vertical = 8.dp),
	)
}

/** "every N unit(s)" for a recurring rule. */
@Composable
private fun StepperRow(form: CalendarForm, actions: CalendarFormActions) {
	Row(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 2.dp),
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalAlignment = Alignment.CenterVertically,
	) {
		Stepper("\u2212") { actions.onUpdate { it.copy(repeatEvery = (it.repeatEvery - 1).coerceAtLeast(1)) } }
		Text(
			CalendarForm.repeatSummary(form.repeat, form.repeatEvery),
			fontSize = 12.sp,
			color = FpTheme.colors.textBody,
			modifier = Modifier.weight(1f),
		)
		Stepper("+") { actions.onUpdate { it.copy(repeatEvery = (it.repeatEvery + 1).coerceAtMost(52)) } }
	}
}

@Composable
private fun Stepper(glyph: String, onClick: () -> Unit) {
	Box(
		modifier = Modifier
			.heightIn(min = 32.dp)
			.clip(RoundedCornerShape(8.dp))
			.background(Slate.S100)
			.clickable(role = Role.Button, onClick = onClick)
			.padding(horizontal = 12.dp, vertical = 6.dp),
		contentAlignment = Alignment.Center,
	) {
		Text(glyph, fontSize = 14.sp, color = Slate.S700)
	}
}

/** Only with 2+ calendars (the web hides a one-button picker). */
@Composable
private fun CalendarPicker(form: CalendarForm, state: CalendarUiState, actions: CalendarFormActions) {
	val calendars = state.data.calendars
	if (calendars.size < 2) return
	PillRow(
		label = "Calendar",
		pills = calendars.map { it.name to (it.id == form.calendarId) },
		onPick = { index -> actions.onUpdate { it.copy(calendarId = calendars[index].id) } },
	)
}

/** "This event repeats - save changes for: ..." */
@Composable
private fun ScopeCard(form: CalendarForm, actions: CalendarFormActions) {
	Column(
		modifier = Modifier
			.fillMaxWidth()
			.padding(horizontal = 16.dp, vertical = 6.dp)
			.clip(RoundedCornerShape(12.dp))
			.background(Primary.P50)
			.padding(12.dp),
	) {
		Text("This event repeats - save changes for:", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Primary.P800)
		Row(modifier = Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
			FormPill("This event only", form.scope == "single") { actions.onUpdate { it.copy(scope = "single") } }
			FormPill("All events in series", form.scope == "all") { actions.onUpdate { it.copy(scope = "all") } }
		}
	}
}
