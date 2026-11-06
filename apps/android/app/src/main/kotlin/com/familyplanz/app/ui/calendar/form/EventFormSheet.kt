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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.calendar.CalendarFormActions
import com.familyplanz.app.ui.calendar.CalendarUiState
import com.familyplanz.app.ui.calendar.model.CalendarForm
import com.familyplanz.app.ui.calendar.model.FormKind
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate

/*
 * EventFormModal + EventModalShell + MODALS_SPEC (#292 L2): the gradient
 * header, the Event|Task segmented control, the fields (see
 * EventFormFields.kt) and the action bar whose primary button stays disabled
 * until the form is valid (AC-CAL-30).
 */

@Composable
fun EventFormSheet(form: CalendarForm, state: CalendarUiState, actions: CalendarFormActions) {
	Column(modifier = Modifier.fillMaxWidth().testTag("event-form")) {
		FormHeader(form, onClose = actions.onCancel())
		// weight(fill=false) so a tall form scrolls inside the leftover space and
		// the ActionBar below always keeps its 44 dp (0x0 footer on small screens).
		Column(modifier = Modifier.weight(1f, fill = false).fillMaxWidth().verticalScroll(rememberScrollState())) {
			if (!form.editing) KindToggle(form) { kind -> actions.onUpdate { it.copy(kind = kind) } }
			EventFormFields(form, state, actions)
		}
		ActionBar(form, actions)
	}
}

private fun CalendarFormActions.onCancel(): () -> Unit = onClose

@Composable
private fun FormHeader(form: CalendarForm, onClose: () -> Unit) {
	Box(
		modifier = Modifier
			.fillMaxWidth()
			.background(Brush.horizontalGradient(listOf(Primary.P500, Primary.P600)))
			.padding(horizontal = 16.dp, vertical = 14.dp),
	) {
		Column(modifier = Modifier.fillMaxWidth()) {
			Row(verticalAlignment = Alignment.CenterVertically) {
				Text(
					form.headerTitle,
					fontSize = 18.sp,
					fontWeight = FontWeight.Bold,
					color = Slate.S50,
					modifier = Modifier.weight(1f),
				)
				Box(
					modifier = Modifier.size(32.dp).clickable(role = Role.Button, onClick = onClose),
					contentAlignment = Alignment.Center,
				) {
					Text("\u00D7", fontSize = 20.sp, color = Primary.P100)
				}
			}
			Text(form.headerSubtitle, fontSize = 12.sp, color = Primary.P100)
		}
	}
}

/** Event | Task - create mode only (the web's segmented control). */
@Composable
private fun KindToggle(form: CalendarForm, onKind: (FormKind) -> Unit) {
	Row(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
		horizontalArrangement = Arrangement.spacedBy(6.dp),
	) {
		FormKind.entries.forEach { kind ->
			val selected = form.kind == kind
			Box(
				modifier = Modifier
					.weight(1f)
					.heightIn(min = 40.dp)
					.clip(MaterialTheme.shapes.small)
					.background(if (selected) Primary.P600 else Slate.S100)
					.clickable(role = Role.Tab) { onKind(kind) },
				contentAlignment = Alignment.Center,
			) {
				Text(
					if (kind == FormKind.EVENT) "Event" else "Task",
					fontSize = 14.sp,
					fontWeight = FontWeight.Medium,
					color = if (selected) Slate.S50 else Slate.S600,
				)
			}
		}
	}
}

/** Cancel, Clear (create event) and the primary action, disabled while invalid. */
@Composable
private fun ActionBar(form: CalendarForm, actions: CalendarFormActions) {
	Row(
		modifier = Modifier.fillMaxWidth().padding(12.dp),
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalAlignment = Alignment.CenterVertically,
	) {
		Text(
			"Cancel",
			fontSize = 14.sp,
			fontWeight = FontWeight.Medium,
			color = FpTheme.colors.textBody,
			modifier = Modifier.clickable(role = Role.Button, onClick = actions.onClose).padding(12.dp),
		)
		if (form.kind == FormKind.EVENT && !form.editing) {
			Text(
				"Clear",
				fontSize = 14.sp,
				color = FpTheme.colors.textMuted,
				modifier = Modifier
					.clickable(role = Role.Button) { actions.onUpdate { CalendarForm(kind = it.kind, calendarId = it.calendarId) } }
					.padding(8.dp),
			)
		}
		Box(
			modifier = Modifier
				.weight(1f)
				.heightIn(min = 44.dp)
				.clip(MaterialTheme.shapes.small)
				.background(if (form.valid) Primary.P600 else Slate.S200)
				.clickable(enabled = form.valid, role = Role.Button, onClick = actions.onSubmit)
				.testTag("form-submit"),
			contentAlignment = Alignment.Center,
		) {
			Text(
				form.actionLabel,
				fontSize = 14.sp,
				fontWeight = FontWeight.SemiBold,
				color = if (form.valid) Slate.S50 else Slate.S500,
			)
		}
	}
}

/** A one-line field: label, value, placeholder, optional tick (parsed) and hint. */
@Composable
@Suppress("LongParameterList")
fun FormField(
	label: String,
	value: String,
	placeholder: String,
	parsed: Boolean,
	hint: String?,
	tag: String,
	keyboard: KeyboardType = KeyboardType.Text,
	onValue: (String) -> Unit,
) {
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
		Row(verticalAlignment = Alignment.CenterVertically) {
			Text(label, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Slate.S600, modifier = Modifier.weight(1f))
			if (parsed) Text("\u2713", fontSize = 12.sp, color = Primary.P600)
		}
		Box(
			modifier = Modifier
				.fillMaxWidth()
				.clip(FpShape.Input)
				.background(Slate.S50)
				.padding(horizontal = 12.dp, vertical = 10.dp),
		) {
			androidx.compose.foundation.text.BasicTextField(
				value = value,
				onValueChange = onValue,
				singleLine = true,
				keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = keyboard),
				textStyle = androidx.compose.ui.text.TextStyle(fontSize = 14.sp, color = FpTheme.colors.textStrong),
				modifier = Modifier.fillMaxWidth().testTag(tag),
			)
			if (value.isEmpty()) Text(placeholder, fontSize = 14.sp, color = FpTheme.colors.textMuted)
		}
		hint?.let { Text(it, fontSize = 11.sp, color = com.familyplanz.app.ui.theme.Accent.Red600) }
	}
}

/** A pill toggle row ("All day", "Multi-day"). */
@Composable
fun FormPill(label: String, on: Boolean, onClick: () -> Unit) {
	Text(
		label,
		fontSize = 12.sp,
		fontWeight = FontWeight.Medium,
		color = if (on) Primary.P700 else Slate.S600,
		modifier = Modifier
			.clip(RoundedCornerShape(8.dp))
			.background(if (on) Primary.P100 else Slate.S100)
			.clickable(role = Role.Button, onClick = onClick)
			.padding(horizontal = 10.dp, vertical = 6.dp),
	)
}
