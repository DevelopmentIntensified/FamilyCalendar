@file:Suppress("MatchingDeclarationName")
package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.TaskUpdatePatch
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskPriority
import com.familyplanz.app.ui.fpFieldColors
import com.familyplanz.app.ui.fpFilterChipBorder
import com.familyplanz.app.ui.fpFilterChipColors
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/** What the edit dialog holds; prefilled from the row (AC-TK-20). */
@Suppress("MatchingDeclarationName")
data class TaskEditForm(
	val title: String,
	val notes: String,
	val tags: String,
	val category: String,
	val dueDate: String,
	val priority: TaskPriority,
	val recurrenceFrequency: String?,
	val recurrenceInterval: Int?,
	val visibility: String,
	val assignedTo: String?,
)

fun Task.toEditForm(): TaskEditForm = TaskEditForm(
	title = title,
	notes = notes.orEmpty(),
	tags = tags.joinToString(", "),
	category = category.orEmpty(),
	dueDate = dueDate?.take(10).orEmpty(),
	priority = priority,
	recurrenceFrequency = recurrenceFrequency,
	recurrenceInterval = recurrenceInterval,
	visibility = visibility,
	assignedTo = assignedTo,
)

/**
 * AC-TK-20: only the fields that differ from [original] ride the request;
 * null = nothing changed, so Save sends nothing at all.
 */
@Suppress("CyclomaticComplexMethod")
fun TaskEditForm.changedPatch(original: Task): TaskUpdatePatch? {
	val fields = linkedMapOf<String, JsonElement>()
	fun text(name: String, value: String?, before: String?) {
		if (value != before) fields[name] = JsonPrimitive(value ?: "")
	}
	text("title", title.trim(), original.title)
	text("notes", notes.ifBlank { null }, original.notes)
	text("dueDate", dueDate.ifBlank { null }, original.dueDate?.take(10))
	if (tagsNormalized() != original.tags) {
		fields["tags"] = kotlinx.serialization.json.JsonArray(tagsNormalized().map { JsonPrimitive(it) })
	}
	if (priority != original.priority) fields["priority"] = JsonPrimitive(priority.wire)
	if (category.ifBlank { null } != original.category) {
		fields["category"] = if (category.isBlank()) JsonNull else JsonPrimitive(category.trim())
	}
	if (recurrenceFrequency != original.recurrenceFrequency) {
		fields["recurrenceFrequency"] = recurrenceFrequency?.let(::JsonPrimitive) ?: JsonNull
	}
	if (recurrenceFrequency != null && recurrenceInterval != original.recurrenceInterval) {
		fields["recurrenceInterval"] = JsonPrimitive(recurrenceInterval ?: 1)
	}
	if (visibility != original.visibility) fields["visibility"] = JsonPrimitive(visibility)
	return if (fields.isEmpty()) null else TaskUpdatePatch.editChanged(fields)
}

private fun TaskEditForm.tagsNormalized(): List<String> =
	tags.split(',').map { it.trim().removePrefix("#").lowercase() }.filter { it.isNotEmpty() }.distinct()

/**
 * `EditTaskDialog.svelte`: every field prefilled, Cancel / Save, and the
 * server's own "rolls the due date forward" hint. The assignee control lists
 * only the signed-in member's own self (the roster's members are L3's
 * remaining seam: [members] fills it in when L2 hands them over).
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
@Suppress("LongMethod")
fun EditTaskDialog(
	task: Task,
	categories: List<String> = emptyList(),
	onDismiss: () -> Unit,
	onSave: (TaskEditForm) -> Unit,
) {
	var form by remember(task.id) { mutableStateOf(task.toEditForm()) }
	AlertDialog(
		onDismissRequest = onDismiss,
		title = { Text("Edit task", fontWeight = FontWeight.SemiBold) },
		text = {
			Column(
				modifier = Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()),
				verticalArrangement = Arrangement.spacedBy(6.dp),
			) {
				EditField("Title", form.title, "edit-title") { form = form.copy(title = it) }
				EditField("Notes", form.notes, "edit-notes") { form = form.copy(notes = it) }
				EditField("Tags (comma)", form.tags, "edit-tags") { form = form.copy(tags = it) }
				EditField("Category", form.category, "edit-category") { form = form.copy(category = it) }
				EditField("Due date (YYYY-MM-DD)", form.dueDate, "edit-due") { form = form.copy(dueDate = it) }
				FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
					TaskPriority.entries.forEach { option ->
						FilterChip(
							selected = form.priority == option,
							onClick = { form = form.copy(priority = option) },
							label = { Text(option.label) },
							shape = FpShape.Pill,
							colors = fpFilterChipColors(),
							border = fpFilterChipBorder(form.priority == option),
						)
					}
				}
				RepeatsRow(form) { form = it }
				FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
					listOf("private", "public").forEach { option ->
						FilterChip(
							selected = form.visibility == option,
							onClick = { form = form.copy(visibility = option) },
							label = { Text(option.replaceFirstChar(Char::uppercase)) },
							shape = FpShape.Pill,
							colors = fpFilterChipColors(),
							border = fpFilterChipBorder(form.visibility == option),
						)
					}
				}
				categories.takeIf { it.isNotEmpty() }?.let { names ->
					FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
						names.forEach { name ->
							FilterChip(
								selected = form.category.equals(name, ignoreCase = true),
								onClick = { form = form.copy(category = name) },
								label = { Text(name) },
								shape = FpShape.Pill,
								colors = fpFilterChipColors(),
								border = fpFilterChipBorder(form.category.equals(name, ignoreCase = true)),
							)
						}
					}
				}
				Text(
					"Completing it rolls the due date forward automatically.",
					style = MaterialTheme.typography.labelSmall,
					color = FpTheme.colors.textMuted,
				)
			}
		},
		confirmButton = {
			TextButton(onClick = { onSave(form) }, modifier = Modifier.testTag("edit-save")) {
				Text("Save")
			}
		},
		dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
	)
}

@Composable
private fun EditField(label: String, value: String, tag: String, onChange: (String) -> Unit) {
	OutlinedTextField(
		value = value,
		onValueChange = onChange,
		label = { Text(label) },
		singleLine = true,
		modifier = Modifier.fillMaxWidth().testTag(tag),
		shape = FpShape.Input,
		colors = fpFieldColors(),
	)
}

/** Repeats: None / Daily / Weekly / Monthly / Yearly + every N (AC-TK-20 fields). */
@Composable
private fun RepeatsRow(form: TaskEditForm, onChange: (TaskEditForm) -> Unit) {
	Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
		Text("Repeats", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textBody)
	}
	FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
		listOf(null, "daily", "weekly", "monthly", "yearly").forEach { frequency ->
			FilterChip(
				selected = form.recurrenceFrequency == frequency,
				onClick = {
					onChange(
						form.copy(
							recurrenceFrequency = frequency,
							recurrenceInterval = if (frequency == null) null else form.recurrenceInterval ?: 1,
						),
					)
				},
				label = { Text(frequency?.replaceFirstChar(Char::uppercase) ?: "None") },
				shape = FpShape.Pill,
				colors = fpFilterChipColors(),
				border = fpFilterChipBorder(form.recurrenceFrequency == frequency),
			)
		}
	}
	if (form.recurrenceFrequency != null) {
		EditField(
			label = "Every N",
			value = (form.recurrenceInterval ?: 1).toString(),
			tag = "edit-interval",
		) { raw -> onChange(form.copy(recurrenceInterval = raw.toIntOrNull()?.coerceAtLeast(1))) }
	}
}

