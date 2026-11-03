package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/** Non-interactive category label on a task row (#280): the web's teal CategoryChip pill. */
@Composable
fun CategoryChip(name: String) {
	FpChip(name, FpTheme.colors.category, Modifier.widthIn(max = 128.dp).testTag("category-chip"))
}

/** "Category" button, swapped for the inline [CategoryPanel] while picking. */
@Composable
fun CategoryControl(category: String?, categories: List<String>, onCategory: (String?) -> Unit) {
	var picking by rememberSaveable { mutableStateOf(false) }
	if (picking) {
		CategoryPanel(current = category, categories = categories, onPicked = onCategory, onDismiss = { picking = false })
	} else {
		TextButton(onClick = { picking = true }) { Text(category?.let { "Category: $it" } ?: "Category") }
	}
}

/**
 * Inline category picker for a new task (#280; inline, not a dialog, so it
 * stays in the add bar's layout): the caller's names (filtered by what is
 * typed) or free entry; a new name is auto-added server-side on create.
 * "No category" clears.
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
fun CategoryPanel(
	current: String?,
	categories: List<String>,
	onPicked: (String?) -> Unit,
	onDismiss: () -> Unit,
) {
	var typed by rememberSaveable { mutableStateOf(current.orEmpty()) }
	val query = typed.trim()
	val shown = categories.filter { query.isEmpty() || it.contains(query, ignoreCase = true) }
	val pick = { name: String? ->
		onPicked(name)
		onDismiss()
	}
	// A case variant of a listed name uses the list's spelling (the server stores it that way too).
	val use = { pick(categories.firstOrNull { it.equals(query, ignoreCase = true) } ?: query.ifEmpty { null }) }
	Column(modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
		OutlinedTextField(
			value = typed,
			onValueChange = { typed = it.take(MAX_CATEGORY_LENGTH) },
			modifier = Modifier.fillMaxWidth().testTag("category-input"),
			singleLine = true,
			shape = FpShape.Input,
			colors = fpFieldColors(),
			placeholder = { Text("New or existing category") },
			keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
			keyboardActions = KeyboardActions(onDone = { use() }),
		)
		FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
			shown.forEach { name ->
				FilterChip(
					selected = name.equals(current, ignoreCase = true),
					onClick = { pick(name) },
					label = { Text(name) },
					shape = FpShape.Pill,
					colors = fpFilterChipColors(),
					border = fpFilterChipBorder(name.equals(current, ignoreCase = true)),
				)
			}
		}
		Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
			TextButton(onClick = use, enabled = query.isNotEmpty()) { Text("Use") }
			TextButton(onClick = { pick(null) }) { Text("No category") }
			TextButton(onClick = onDismiss) { Text("Cancel") }
		}
	}
}

/** Server limit (spec: ≤ 80 chars after trimming). */
private const val MAX_CATEGORY_LENGTH = 80
