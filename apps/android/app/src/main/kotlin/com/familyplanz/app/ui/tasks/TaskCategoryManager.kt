package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.TaskCategoryDto
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.fpFieldColors
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/**
 * `TaskCategoryManager.svelte` (AC-TK-24): "Categories · n" with
 * Manage/Hide; each row renames inline (Save / Cancel) or deletes behind a
 * "Tasks become uncategorized." prompt.
 */
@Composable
fun TaskCategoryManager(
	rows: List<TaskCategoryDto>,
	onRename: (TaskCategoryDto, String) -> Unit,
	onDelete: (TaskCategoryDto) -> Unit,
) {
	if (rows.isEmpty()) return
	var open by rememberSaveable { mutableStateOf(false) }
	FpCard(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).testTag("category-manager"),
		padding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
	) {
		Column {
			Row(verticalAlignment = Alignment.CenterVertically) {
				Text(
					"Categories \u00b7 ${rows.size}",
					style = MaterialTheme.typography.titleSmall,
					fontWeight = FontWeight.SemiBold,
					color = FpTheme.colors.textStrong,
					modifier = Modifier.weight(1f),
				)
				TextButton(onClick = { open = !open }, modifier = Modifier.testTag("category-manage")) {
					Text(if (open) "Hide" else "Manage")
				}
			}
			if (open) rows.forEach { row -> CategoryRow(row, onRename, onDelete) }
		}
	}
}

@Composable
private fun CategoryRow(
	row: TaskCategoryDto,
	onRename: (TaskCategoryDto, String) -> Unit,
	onDelete: (TaskCategoryDto) -> Unit,
) {
	var editing by rememberSaveable(row.id) { mutableStateOf(false) }
	var name by rememberSaveable(row.id) { mutableStateOf(row.name) }
	var confirming by rememberSaveable(row.id) { mutableStateOf(false) }
	Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
		if (editing) {
			OutlinedTextField(
				value = name,
				onValueChange = { name = it },
				singleLine = true,
				modifier = Modifier.weight(1f).testTag("category-name-input"),
				shape = FpShape.Input,
				colors = fpFieldColors(),
			)
			TextButton(
				onClick = {
					editing = false
					if (name.isNotBlank() && name != row.name) onRename(row, name.trim())
				},
				modifier = Modifier.testTag("category-save"),
			) { Text("Save") }
			TextButton(onClick = { editing = false; name = row.name }) { Text("Cancel") }
		} else {
			Text(
				row.name,
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textBody,
				modifier = Modifier.weight(1f),
			)
			TextButton(onClick = { editing = true }, modifier = Modifier.testTag("category-rename")) {
				Text("Rename")
			}
			TextButton(onClick = { confirming = true }, modifier = Modifier.testTag("category-delete")) {
				Text("Delete")
			}
		}
	}
	if (confirming) {
		AlertDialog(
			onDismissRequest = { confirming = false },
			title = { Text("Delete \"${row.name}\"?") },
			text = { Text("Tasks become uncategorized.") },
			confirmButton = {
				TextButton(
					onClick = {
						confirming = false
						onDelete(row)
					},
					modifier = Modifier.testTag("category-delete-yes"),
				) { Text("Delete") }
			},
			dismissButton = { TextButton(onClick = { confirming = false }) { Text("Keep") } },
		)
	}
}
