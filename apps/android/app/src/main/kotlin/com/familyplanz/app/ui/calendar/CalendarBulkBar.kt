package com.familyplanz.app.ui.calendar

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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate

/*
 * BulkEditBar (#292 L2, AC-CAL-33/34): the selection bar, its phone
 * "More tools" collapse, the delete confirmation and the smart-plan review.
 */

fun deleteConfirmText(n: Int): String {
	val plural = if (n == 1) "event" else "events"
	return "Delete $n $plural? Attached checklists go too."
}

@Composable
fun CalendarBulkBar(state: CalendarUiState, actions: CalendarBulkActions) {
	val plan = state.plan
	Surface(
		color = MaterialTheme.colorScheme.surface,
		shape = RoundedCornerShape(12.dp),
		modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp).testTag("bulk-bar"),
	) {
		Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
			if (plan != null) {
				PlanReview(plan, actions)
			} else {
				SelectionRow(state.selectedIds.size, state.data.calendars, actions)
			}
		}
	}
}

@Composable
private fun SelectionRow(count: Int, calendars: List<com.familyplanz.app.data.CalendarDto>, actions: CalendarBulkActions) {
	var more by remember { mutableStateOf(false) }
	var confirming by remember { mutableStateOf(false) }
	Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
		Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
			Box(
				modifier = Modifier.clip(FpShape.Pill).background(Primary.P50).padding(horizontal = 10.dp, vertical = 4.dp),
			) {
				Text("$count selected", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Primary.P700)
			}
			Text(
				if (more) "Less tools" else "More tools",
				fontSize = 12.sp,
				color = FpTheme.colors.textBody,
				modifier = Modifier
					.clickable(role = Role.Button) { more = !more }
					.testTag("bulk-more")
					.padding(vertical = 4.dp),
			)
		}
		if (more) ToolRows(calendars, actions)
		if (confirming) {
			Text(
				deleteConfirmText(count),
				fontSize = 13.sp,
				color = FpTheme.colors.textStrong,
				modifier = Modifier.testTag("bulk-delete-confirm"),
			)
		}
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
			BulkButton("Delete", danger = true, tag = "bulk-delete") {
				if (confirming) actions.onDelete() else confirming = true
			}
			if (confirming) {
				BulkButton("Yes, delete", danger = true, tag = "bulk-delete-yes", onClick = actions.onDelete)
				BulkButton("Cancel") { confirming = false }
			}
			Box(Modifier.weight(1f))
			BulkButton("Done", onClick = { actions.onDone() })
		}
	}
}

@Composable
private fun ToolRows(calendars: List<com.familyplanz.app.data.CalendarDto>, actions: CalendarBulkActions) {
	var location by remember { mutableStateOf("") }
	var attendant by remember { mutableStateOf("") }
	var instruction by remember { mutableStateOf("") }
	Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
		Text("Calendar", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = FpTheme.colors.textMuted)
		Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
			calendars.forEach { calendar ->
				BulkButton(calendar.name, tag = "bulk-calendar") { actions.onCalendar(calendar.id) }
			}
		}
		BulkInput("Location", "Location.", location, { location = it }, "Set") { actions.onLocation(location) }
		BulkInput("Attendant", "+ Attendant.", attendant, { attendant = it }, "Add") { actions.onAttendants(attendant) }
		BulkInput("Instruction", "e.g. 'move all to next friday'", instruction, { instruction = it }, "Smart") {
			actions.onPlan(instruction)
		}
	}
}

/** "PLANNED CHANGES - REVIEW, THEN APPLY" and the past-date gate (AC-CAL-34). */
@Composable
private fun PlanReview(plan: SmartPlan, actions: CalendarBulkActions) {
	var confirmingPast by remember(plan) { mutableStateOf(false) }
	Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
		Text(
			"PLANNED CHANGES - REVIEW, THEN APPLY",
			fontSize = 11.sp,
			fontWeight = FontWeight.SemiBold,
			letterSpacing = 0.6.sp,
			color = FpTheme.colors.textMuted,
			modifier = Modifier.testTag("plan-header"),
		)
		plan.descriptions.forEach { line ->
			Text("\u2022 $line", fontSize = 13.sp, color = FpTheme.colors.textBody)
		}
		if (plan.movesToPast && !confirmingPast) {
			Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
				Text(
					"Some of these changes move events to past dates.",
					fontSize = 12.sp,
					color = Accent.Amber800,
					modifier = Modifier.weight(1f),
				)
				BulkButton("Apply anyway", danger = true) { confirmingPast = true }
				BulkButton("Go back", onClick = actions.onDiscardPlan)
			}
		} else {
			Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
				BulkButton("Discard", onClick = actions.onDiscardPlan)
				BulkButton(applyLabel(plan.ops.size), primary = true, tag = "plan-apply", onClick = actions.onApplyPlan)
			}
		}
	}
}

private fun applyLabel(n: Int): String = if (n == 1) "Apply 1 change" else "Apply $n changes"

@Composable
@Suppress("LongParameterList")
private fun BulkInput(label: String, placeholder: String, value: String, onValue: (String) -> Unit, action: String, onAction: () -> Unit) {
	Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
		Text(label, fontSize = 11.sp, color = FpTheme.colors.textMuted)
		Box(
			modifier = Modifier
				.weight(1f)
				.heightIn(min = 36.dp)
				.clip(FpShape.Input)
				.background(Slate.S100)
				.padding(horizontal = 8.dp, vertical = 6.dp),
		) {
			androidx.compose.foundation.text.BasicTextField(
				value = value,
				onValueChange = onValue,
				singleLine = true,
				textStyle = androidx.compose.ui.text.TextStyle(fontSize = 13.sp, color = FpTheme.colors.textStrong),
			)
			if (value.isEmpty()) Text(placeholder, fontSize = 13.sp, color = FpTheme.colors.textMuted)
		}
		BulkButton(action, onClick = onAction)
	}
}

@Composable
private fun BulkButton(label: String, danger: Boolean = false, primary: Boolean = false, tag: String? = null, onClick: () -> Unit) {
	val surface = when {
		primary -> Primary.P600
		danger -> Accent.Red50
		else -> Slate.S100
	}
	val content = when {
		primary -> Slate.S50
		danger -> Accent.Red700
		else -> FpTheme.colors.textBody
	}
	Text(
		label,
		fontSize = 12.sp,
		fontWeight = FontWeight.SemiBold,
		color = content,
		modifier = Modifier
			.clip(RoundedCornerShape(8.dp))
			.background(surface)
			.clickable(role = Role.Button, onClick = onClick)
			.padding(horizontal = 10.dp, vertical = 8.dp)
			.then(if (tag != null) Modifier.testTag(tag) else Modifier),
	)
}
