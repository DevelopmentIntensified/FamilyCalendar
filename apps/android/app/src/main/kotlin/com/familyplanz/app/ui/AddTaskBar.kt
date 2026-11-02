package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.TaskPriority
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Tasks-tab add field: title (required) + optional due date, priority and
 * category (#280, from [categories] or free entry).
 * Submit clears the field at once; the pending row is the <100ms ack, the
 * server's error (if any) shows inline here.
 */
@Composable
fun AddTaskBar(error: String?, categories: List<String> = emptyList(), onCreate: (NewTaskInput) -> Unit) {
	var title by rememberSaveable { mutableStateOf("") }
	var due by rememberSaveable { mutableStateOf<String?>(null) }
	var priority by rememberSaveable { mutableStateOf(TaskPriority.NORMAL) }
	var category by rememberSaveable { mutableStateOf<String?>(null) }
	var picking by rememberSaveable { mutableStateOf(false) }

	val submit = {
		onCreate(NewTaskInput(title, due?.let(LocalDate::parse), priority, category))
		if (title.isNotBlank()) {
			title = ""
			due = null
			priority = TaskPriority.NORMAL
			category = null
		}
	}

	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
		Row(
			verticalAlignment = Alignment.CenterVertically,
			horizontalArrangement = Arrangement.spacedBy(8.dp),
		) {
			OutlinedTextField(
				value = title,
				onValueChange = { title = it },
				modifier = Modifier.weight(1f),
				singleLine = true,
				placeholder = { Text("Add a task") },
				keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
				keyboardActions = KeyboardActions(onDone = { submit() }),
			)
			Button(onClick = submit, enabled = title.isNotBlank()) { Text("Add") }
		}
		if (title.isNotBlank() || due != null) {
			TaskOptionsRow(
				due = due,
				priority = priority,
				onPickDue = { picking = true },
				onClearDue = { due = null },
				onPriority = { priority = it },
			)
			CategoryControl(category, categories) { category = it }
		}
		error?.let {
			Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
		}
	}
	if (picking) {
		DueDateDialog(
			onPicked = { due = it.toString() },
			onDismiss = { picking = false },
		)
	}
}

@Composable
private fun TaskOptionsRow(
	due: String?,
	priority: TaskPriority,
	onPickDue: () -> Unit,
	onClearDue: () -> Unit,
	onPriority: (TaskPriority) -> Unit,
) {
	Row(
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(4.dp),
	) {
		TextButton(onClick = onPickDue) { Text(due?.let { "Due $it" } ?: "Due date") }
		if (due != null) {
			TextButton(onClick = onClearDue) { Text("Clear") }
		}
		TaskPriority.entries.forEach { option ->
			FilterChip(
				selected = priority == option,
				onClick = { onPriority(option) },
				label = { Text(option.name.lowercase()) },
			)
		}
	}
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun DueDateDialog(onPicked: (LocalDate) -> Unit, onDismiss: () -> Unit) {
	val pickerState = rememberDatePickerState()
	DatePickerDialog(
		onDismissRequest = onDismiss,
		confirmButton = {
			TextButton(
				onClick = {
					pickerState.selectedDateMillis?.let { onPicked(utcMillisToDate(it)) }
					onDismiss()
				},
			) { Text("OK") }
		},
		dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
	) {
		DatePicker(state = pickerState)
	}
}

/** DatePicker reports midnight UTC of the chosen day. */
internal fun utcMillisToDate(millis: Long): LocalDate =
	Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
