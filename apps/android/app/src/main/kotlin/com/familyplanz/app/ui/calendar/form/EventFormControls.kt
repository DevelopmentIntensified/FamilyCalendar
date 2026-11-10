package com.familyplanz.app.ui.calendar.form

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.R
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * #309: the event form's non-text controls - the exposed dropdown that looks
 * like the form's input, the calendar color disc and the Material3 date and
 * time pickers. The copy stays in REMINDER_OPTIONS / RepeatOption.
 */

private const val MILLIS_PER_DAY = 24L * 60 * 60 * 1000

/** A dropdown whose FIELD looks like the form's input and whose MENU lists [options]. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FormDropdown(label: String, selected: String, options: List<String>, tag: String, onPick: (Int) -> Unit) {
	var open by remember { mutableStateOf(false) }
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
		Text(label, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Slate.S600)
		ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
			Row(
				modifier = Modifier
					.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
					.fillMaxWidth()
					.clip(FpShape.Input)
					.background(Slate.S50)
					.padding(horizontal = 12.dp, vertical = 10.dp)
					.testTag(tag),
				horizontalArrangement = Arrangement.spacedBy(8.dp),
				verticalAlignment = Alignment.CenterVertically,
			) {
				Text(selected, fontSize = 14.sp, color = FpTheme.colors.textStrong, modifier = Modifier.weight(1f))
				Icon(
					painterResource(R.drawable.ic_fp_chevron_right),
					contentDescription = null,
					tint = Slate.S400,
					modifier = Modifier.size(16.dp),
				)
			}
			ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
				options.forEachIndexed { index, text ->
					DropdownMenuItem(text = { Text(text) }, onClick = { open = false; onPick(index) })
				}
			}
		}
	}
}

/** A 10 dp disc of a calendar's color (slate-300 when the calendar carries none). */
@Composable
internal fun CalendarDisc(color: String?, modifier: Modifier = Modifier) {
	Box(
		modifier = modifier
			.size(10.dp)
			.clip(CircleShape)
			.background(
				runCatching { Color(android.graphics.Color.parseColor(color.orEmpty())) }
					.getOrDefault(Slate.S300),
			),
	)
}

/** "Tue, Nov 3" style label for the date fields' display; blank stays blank. */
internal fun dateLabelOf(iso: String?): String =
	dayOf(iso)?.let { DateTimeFormatter.ofPattern("EEE, MMM d", Locale.ENGLISH).format(it) }.orEmpty()

/** "19:00" style label for the time fields' display; blank stays blank. */
internal fun timeLabelOf(iso: String?): String =
	timeOf(iso)?.let { String.format(Locale.ENGLISH, "%02d:%02d", it.hour, it.minute) }.orEmpty()

private fun dayOf(iso: String?): LocalDate? =
	iso?.takeIf { it.isNotBlank() }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

private fun timeOf(iso: String?): LocalTime? =
	iso?.takeIf { it.isNotBlank() }?.let { runCatching { LocalTime.parse(it) }.getOrNull() }

/** The picker's millis are UTC midnight of the selected day, so the form's day is read back in UTC too. */
private fun utcDayOf(millis: Long): String = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()

/** Material3 date picker; the form's day is the selected `YYYY-MM-DD`. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FormDatePicker(label: String, value: String, tag: String, onDay: (String) -> Unit, onDismiss: () -> Unit) {
	val state = rememberDatePickerState(initialSelectedDateMillis = dayOf(value)?.toEpochDay()?.times(MILLIS_PER_DAY))
	DatePickerDialog(
		onDismissRequest = onDismiss,
		confirmButton = {
			TextButton(onClick = {
				state.selectedDateMillis?.let { utcDayOf(it) }?.let(onDay)
				onDismiss()
			}) { Text("OK") }
		},
		dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
	) {
		DatePicker(state = state, modifier = Modifier.testTag("$tag-picker"), title = { Text(label) })
	}
}

/** Material3 time picker; the `HH:mm` label goes back through [onTime] exactly as the form stores it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FormTimePicker(label: String, value: String, tag: String, onTime: (String) -> Unit, onDismiss: () -> Unit) {
	val seed = timeOf(value)
	val state = rememberTimePickerState(initialHour = seed?.hour ?: 9, initialMinute = seed?.minute ?: 0)
	// The same modal shell the date picker uses: an OK/Cancel dialog with the time body inside.
	DatePickerDialog(
		onDismissRequest = onDismiss,
		confirmButton = {
			TextButton(onClick = {
				onTime(String.format(Locale.ENGLISH, "%02d:%02d", state.hour, state.minute))
				onDismiss()
			}) { Text("OK") }
		},
		dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
	) {
		androidx.compose.foundation.layout.Column {
			Text(label, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Slate.S600)
			TimePicker(state = state, modifier = Modifier.testTag("$tag-picker"))
		}
	}
}
