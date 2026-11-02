package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Quick-add affordance for the calendar tab: phrase in, editable draft out
 * (parse = hint), create on confirm. Errors stay inline, never silent.
 */
@Composable
fun QuickAddPanel(
	state: QuickAddUiState,
	onParse: (String) -> Unit,
	onDismiss: () -> Unit,
	onConfirm: () -> Unit,
	onUpdateDraft: (title: String?, date: String?, startTime: String?, endTime: String?, location: String?, allDay: Boolean?) -> Unit,
) {
	var input by rememberSaveable { mutableStateOf("") }

	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
		Row(
			verticalAlignment = Alignment.CenterVertically,
			horizontalArrangement = Arrangement.spacedBy(8.dp),
		) {
			OutlinedTextField(
				value = input,
				onValueChange = { input = it },
				modifier = Modifier.weight(1f),
				singleLine = true,
				placeholder = { Text("\"dinner Friday at 7 at the park\"") },
			)
			TextButton(onClick = { onParse(input) }) { Text("Parse") }
		}

		when (state) {
			QuickAddUiState.Idle -> {}

			QuickAddUiState.Parsing, QuickAddUiState.Creating -> LinearProgressIndicator(
				modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
			)

			is QuickAddUiState.Failed -> Column(modifier = Modifier.padding(top = 8.dp)) {
				Text(
					state.reason,
					color = MaterialTheme.colorScheme.error,
					style = MaterialTheme.typography.bodySmall,
				)
				TextButton(onClick = onDismiss) { Text("Dismiss") }
			}

			is QuickAddUiState.Draft -> DraftCard(state, onDismiss, onConfirm, onUpdateDraft)
		}
	}
}

@Composable
private fun DraftCard(
	state: QuickAddUiState.Draft,
	onDismiss: () -> Unit,
	onConfirm: () -> Unit,
	onUpdateDraft: (title: String?, date: String?, startTime: String?, endTime: String?, location: String?, allDay: Boolean?) -> Unit,
) {
	Column(modifier = Modifier.padding(top = 8.dp)) {
		if (state.needsTitle) {
			Text(
				"Add a title",
				color = MaterialTheme.colorScheme.error,
				style = MaterialTheme.typography.bodySmall,
			)
		}
		OutlinedTextField(
			value = state.title,
			onValueChange = { onUpdateDraft(it, null, null, null, null, null) },
			label = { Text("Title") },
			modifier = Modifier.fillMaxWidth(),
			singleLine = true,
		)
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
			OutlinedTextField(
				value = state.date ?: "",
				onValueChange = { onUpdateDraft(null, it, null, null, null, null) },
				label = { Text("Date (YYYY-MM-DD)") },
				modifier = Modifier.weight(1f),
				singleLine = true,
			)
			Row(verticalAlignment = Alignment.CenterVertically) {
				Checkbox(
					checked = state.allDay,
					onCheckedChange = { onUpdateDraft(null, null, null, null, null, it) },
				)
				Text("All day")
			}
		}
		if (!state.allDay) {
			Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
				OutlinedTextField(
					value = state.startTime ?: "",
					onValueChange = { onUpdateDraft(null, null, it, null, null, null) },
					label = { Text("Start (HH:MM)") },
					modifier = Modifier.weight(1f),
					singleLine = true,
				)
				OutlinedTextField(
					value = state.endTime ?: "",
					onValueChange = { onUpdateDraft(null, null, null, it, null, null) },
					label = { Text("End (HH:MM)") },
					modifier = Modifier.weight(1f),
					singleLine = true,
				)
			}
		}
		OutlinedTextField(
			value = state.location ?: "",
			onValueChange = { onUpdateDraft(null, null, null, null, it, null) },
			label = { Text("Location") },
			modifier = Modifier.fillMaxWidth(),
			singleLine = true,
		)
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
			Button(
				onClick = onConfirm,
				enabled = !state.needsTitle && !state.date.isNullOrBlank(),
			) {
				Text("Create event")
			}
			OutlinedButton(onClick = onDismiss) { Text("Cancel") }
		}
		if (state.method.startsWith("regex")) {
			Text(
				"Parsed on-device rules — check the details before creating.",
				style = MaterialTheme.typography.bodySmall,
				color = MaterialTheme.colorScheme.onSurfaceVariant,
			)
		}
	}
}
